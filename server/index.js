const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const pdfParse   = require('pdf-parse');
require('dotenv').config();

const pool = require('./db');
const app = express();

// HR Documents file storage
const hrUploadDir = path.join(__dirname, 'uploads', 'hr-documents');
try { if (!fs.existsSync(hrUploadDir)) fs.mkdirSync(hrUploadDir, { recursive: true }); } catch (e) {}

const hrStorage = multer.diskStorage({
  destination: hrUploadDir,
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const hrUpload = multer({ storage: hrStorage, limits: { fileSize: 25 * 1024 * 1024 } });

// Middleware to check HR Documents upload permission
const checkHRPermission = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT 1 FROM permissions p
       INNER JOIN tools t ON p.tool_id = t.id
       WHERE p.role = $1 AND t.slug = $2 AND p.permission_level = 'upload'`,
      [req.user.role, 'hr-documents']
    );
    if (result.rows.length === 0) return res.status(403).json({ message: 'Permission denied' });
    next();
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Middleware to check HR Documents view permission
const checkHRView = async (req, res, next) => {
  if (req.user.role === 'admin') return next();
  try {
    const result = await pool.query(
      `SELECT 1 FROM permissions p
       INNER JOIN tools t ON p.tool_id = t.id
       WHERE p.role = $1 AND t.slug = $2 AND p.permission_level = 'view'`,
      [req.user.role, 'hr-documents']
    );
    if (result.rows.length === 0) return res.status(403).json({ message: 'Permission denied' });
    next();
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ message: 'No token provided' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Login route
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ user: { id: user.id, name: user.name, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user from cookie
app.get('/api/me', authenticateToken, (req, res) => {
  res.json({ id: req.user.id, name: req.user.name, role: req.user.role });
});

// Logout
app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

// Get all users
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add a new user
app.post('/api/users', authenticateToken, async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name, email, hashedPassword, role]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a user's role
app.put('/api/users/:id', authenticateToken, async (req, res) => {
  const { role } = req.body;
  try {
    const result = await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role',
      [role, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a user
app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get tools accessible to the current user's role
app.get('/api/my-tools', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT t.*,
        (EXISTS (
          SELECT 1 FROM permissions p
          WHERE p.tool_id = t.id AND p.role = $1 AND p.permission_level = 'upload'
        )) AS has_upload_permission
       FROM tools t
       WHERE t.visible_to_all = true
          OR EXISTS (
            SELECT 1 FROM permissions p
            WHERE p.tool_id = t.id AND p.role = $1 AND p.permission_level = 'view'
          )
       ORDER BY t.name`,
      [req.user.role]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all tools
app.get('/api/tools', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tools ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all permissions
app.get('/api/permissions', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM permissions');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Grant a permission to a role
app.post('/api/permissions', authenticateToken, async (req, res) => {
  const { role, tool_id, permission_level = 'view' } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO permissions (role, tool_id, permission_level) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING *',
      [role, tool_id, permission_level]
    );
    res.json(result.rows[0] || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Revoke a permission from a role
app.delete('/api/permissions', authenticateToken, async (req, res) => {
  const { role, tool_id, permission_level = 'view' } = req.body;
  try {
    await pool.query(
      'DELETE FROM permissions WHERE role = $1 AND tool_id = $2 AND permission_level = $3',
      [role, tool_id, permission_level]
    );
    res.json({ message: 'Permission revoked' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── HR Documents ─────────────────────────────────────────────────────────────

// List documents — admins and uploaders see all; viewers only see docs their role is granted
app.get('/api/hr-documents', authenticateToken, checkHRView, async (req, res) => {
  try {
    const isPrivileged = req.user.role === 'admin' || await (async () => {
      const r = await pool.query(
        `SELECT 1 FROM permissions p INNER JOIN tools t ON p.tool_id = t.id
         WHERE p.role = $1 AND t.slug = 'hr-documents' AND p.permission_level = 'upload'`,
        [req.user.role]
      );
      return r.rows.length > 0;
    })();

    let result;
    if (isPrivileged) {
      result = await pool.query(
        `SELECT d.id, d.name, d.filename, d.mimetype, d.size, d.uploaded_by_name, d.uploaded_at,
                COALESCE(array_agg(dr.role) FILTER (WHERE dr.role IS NOT NULL), '{}') AS roles
         FROM hr_documents d
         LEFT JOIN hr_document_roles dr ON dr.document_id = d.id
         GROUP BY d.id ORDER BY d.sort_order ASC NULLS LAST, d.uploaded_at DESC`
      );
    } else {
      result = await pool.query(
        `SELECT d.id, d.name, d.filename, d.mimetype, d.size, d.uploaded_by_name, d.uploaded_at,
                COALESCE(array_agg(dr.role) FILTER (WHERE dr.role IS NOT NULL), '{}') AS roles
         FROM hr_documents d
         INNER JOIN hr_document_roles dr ON dr.document_id = d.id AND dr.role = $1
         GROUP BY d.id ORDER BY d.sort_order ASC NULLS LAST, d.uploaded_at DESC`,
        [req.user.role]
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload a document
app.post('/api/hr-documents', authenticateToken, checkHRPermission, hrUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file provided' });
  const displayName = (req.body.name || '').trim() || req.file.originalname;
  let roles = [];
  try { roles = JSON.parse(req.body.roles || '[]'); } catch {}

  try {
    const result = await pool.query(
      `INSERT INTO hr_documents (name, filename, mimetype, size, uploaded_by_id, uploaded_by_name, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM hr_documents))
       RETURNING *`,
      [displayName, req.file.filename, req.file.mimetype, req.file.size, req.user.id, req.user.name]
    );
    const doc = result.rows[0];
    if (roles.length > 0) {
      const roleValues = roles.map((_, i) => `($1, $${i + 2})`).join(', ');
      await pool.query(
        `INSERT INTO hr_document_roles (document_id, role) VALUES ${roleValues} ON CONFLICT DO NOTHING`,
        [doc.id, ...roles]
      );
    }
    doc.roles = roles;
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a document's name and/or role visibility
app.patch('/api/hr-documents/:id', authenticateToken, checkHRPermission, async (req, res) => {
  const { name, roles } = req.body;
  try {
    const existing = await pool.query('SELECT * FROM hr_documents WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ message: 'Document not found' });

    if (name && name.trim()) {
      await pool.query('UPDATE hr_documents SET name = $1 WHERE id = $2', [name.trim(), req.params.id]);
    }
    if (Array.isArray(roles)) {
      await pool.query('DELETE FROM hr_document_roles WHERE document_id = $1', [req.params.id]);
      if (roles.length > 0) {
        const roleValues = roles.map((_, i) => `($1, $${i + 2})`).join(', ');
        await pool.query(
          `INSERT INTO hr_document_roles (document_id, role) VALUES ${roleValues} ON CONFLICT DO NOTHING`,
          [req.params.id, ...roles]
        );
      }
    }
    const updated = await pool.query(
      `SELECT d.id, d.name, d.filename, d.mimetype, d.size, d.uploaded_by_name, d.uploaded_at,
              COALESCE(array_agg(dr.role) FILTER (WHERE dr.role IS NOT NULL), '{}') AS roles
       FROM hr_documents d
       LEFT JOIN hr_document_roles dr ON dr.document_id = d.id
       WHERE d.id = $1
       GROUP BY d.id`,
      [req.params.id]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reorder documents — accepts ordered array of all IDs
app.patch('/api/hr-documents/reorder', authenticateToken, checkHRPermission, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'ids array required' });
  try {
    await Promise.all(ids.map((id, index) =>
      pool.query('UPDATE hr_documents SET sort_order = $1 WHERE id = $2', [index + 1, id])
    ));
    res.json({ message: 'Order updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// View a document inline in the browser
app.get('/api/hr-documents/:id/view', authenticateToken, checkHRView, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM hr_documents WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Document not found' });
    const doc = result.rows[0];
    const filePath = path.join(hrUploadDir, doc.filename);
    res.setHeader('Content-Disposition', `inline; filename="${doc.name}"`);
    res.sendFile(filePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Download a document
app.get('/api/hr-documents/:id/download', authenticateToken, checkHRView, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM hr_documents WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Document not found' });
    const doc = result.rows[0];
    const filePath = path.join(hrUploadDir, doc.filename);
    res.download(filePath, doc.name);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a document
app.delete('/api/hr-documents/:id', authenticateToken, checkHRPermission, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM hr_documents WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Document not found' });
    const doc = result.rows[0];
    const filePath = path.join(hrUploadDir, doc.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await pool.query('DELETE FROM hr_documents WHERE id = $1', [req.params.id]);
    res.json({ message: 'Document deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Production Photos ─────────────────────────────────────────────────────────

const productionUploadDir = path.join(__dirname, 'uploads', 'production-photos');
try { if (!fs.existsSync(productionUploadDir)) fs.mkdirSync(productionUploadDir, { recursive: true }); } catch (e) {}

const productionStorage = multer.diskStorage({
  destination: productionUploadDir,
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const productionUpload = multer({ storage: productionStorage, limits: { fileSize: 50 * 1024 * 1024 } });

// Serve a production photo inline — must come before /:id route
app.get('/api/production/photo/:filename', authenticateToken, (req, res) => {
  const filePath = path.join(productionUploadDir, path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Not found' });
  res.setHeader('Content-Disposition', 'inline');
  res.sendFile(filePath);
});

// List submissions
app.get('/api/production', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*,
        COUNT(p.id) FILTER (WHERE p.is_packing_slip = false) AS photo_count,
        COUNT(p.id) FILTER (WHERE p.is_packing_slip = true)  AS slip_count
       FROM production_submissions s
       LEFT JOIN production_photos p ON p.submission_id = s.id
       GROUP BY s.id
       ORDER BY s.submission_date DESC, s.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single submission with all sets and photos
app.get('/api/production/:id', authenticateToken, async (req, res) => {
  try {
    const sub = await pool.query('SELECT * FROM production_submissions WHERE id = $1', [req.params.id]);
    if (!sub.rows[0]) return res.status(404).json({ message: 'Not found' });
    const sets   = await pool.query('SELECT * FROM production_photo_sets WHERE submission_id = $1 ORDER BY sort_order', [req.params.id]);
    const photos = await pool.query('SELECT * FROM production_photos WHERE submission_id = $1 ORDER BY created_at',      [req.params.id]);
    res.json({
      ...sub.rows[0],
      packing_slips: photos.rows.filter(p => p.is_packing_slip),
      photo_sets: sets.rows.map(set => ({
        ...set,
        photos: photos.rows.filter(p => p.photo_set_id === set.id),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a submission
app.post('/api/production', authenticateToken, productionUpload.any(), async (req, res) => {
  const {
    submitted_by_name, submission_date, submission_type,
    distributor, other_distributor,
    ology_halves, ology_sixths, kl_halves, kl_sixths,
    packing_slip_unavailable, photo_sets_meta,
  } = req.body;

  let photoSetsMeta = [];
  try { photoSetsMeta = JSON.parse(photo_sets_meta || '[]'); } catch {}

  const files = req.files || [];

  try {
    const subResult = await pool.query(
      `INSERT INTO production_submissions
         (submitted_by_id, submitted_by_name, submission_date, submission_type,
          distributor, other_distributor, ology_halves, ology_sixths,
          kl_halves, kl_sixths, packing_slip_unavailable)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.user.id, submitted_by_name, submission_date, submission_type,
       distributor || null, other_distributor || null,
       parseInt(ology_halves) || 0, parseInt(ology_sixths) || 0,
       parseInt(kl_halves) || 0, parseInt(kl_sixths) || 0,
       packing_slip_unavailable === 'true']
    );
    const sub = subResult.rows[0];

    // Packing slips
    for (const file of files.filter(f => f.fieldname === 'packing_slips')) {
      await pool.query(
        'INSERT INTO production_photos (submission_id, is_packing_slip, filename, original_name, mimetype) VALUES ($1,true,$2,$3,$4)',
        [sub.id, file.filename, file.originalname, file.mimetype]
      );
    }

    // Photo sets
    for (let i = 0; i < photoSetsMeta.length; i++) {
      const meta     = photoSetsMeta[i];
      const setFiles = files.filter(f => f.fieldname === `photos_${i}`);
      if (!setFiles.length && !meta.type) continue;

      const setResult = await pool.query(
        'INSERT INTO production_photo_sets (submission_id, sort_order, photo_type, product_date, description) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [sub.id, i, meta.type || null, meta.product_date || null, meta.description || null]
      );
      const setId = setResult.rows[0].id;

      for (const file of setFiles) {
        await pool.query(
          'INSERT INTO production_photos (submission_id, photo_set_id, is_packing_slip, filename, original_name, mimetype) VALUES ($1,$2,false,$3,$4,$5)',
          [sub.id, setId, file.filename, file.originalname, file.mimetype]
        );
      }
    }

    res.json(sub);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a submission (admin only)
app.delete('/api/production/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  try {
    // Fetch filenames so we can delete files from disk
    const photos = await pool.query('SELECT filename FROM production_photos WHERE submission_id = $1', [req.params.id]);
    photos.rows.forEach(p => {
      const fp = path.join(productionUploadDir, p.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });
    await pool.query('DELETE FROM production_photos WHERE submission_id = $1', [req.params.id]);
    await pool.query('DELETE FROM production_photo_sets WHERE submission_id = $1', [req.params.id]);
    await pool.query('DELETE FROM production_submissions WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── SOPs & Checklists ─────────────────────────────────────────────────────────
const sopUploadDir = path.join(__dirname, 'uploads', 'sop-documents');
try { if (!fs.existsSync(sopUploadDir)) fs.mkdirSync(sopUploadDir, { recursive: true }); } catch (e) {}

const sopUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, sopUploadDir),
    filename:    (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`),
  }),
});

function checkSOPPermission(req, res, next) {
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = $1 AND t.slug = 'sops-checklists' AND p.permission_level = 'upload'`,
    [req.user.role]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

// List SOPs (role-filtered for viewers, all for uploaders)
app.get('/api/sop-documents', authenticateToken, async (req, res) => {
  try {
    const isPrivileged = req.user.role === 'admin' || await pool.query(
      `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
       WHERE p.role = $1 AND t.slug = 'sops-checklists' AND p.permission_level = 'upload'`,
      [req.user.role]
    ).then(r => r.rows.length > 0);

    const docs = await pool.query('SELECT * FROM sop_documents ORDER BY sort_order ASC, uploaded_at ASC');
    const roles = await pool.query('SELECT * FROM sop_document_roles');

    const roleMap = {};
    roles.rows.forEach(r => {
      if (!roleMap[r.document_id]) roleMap[r.document_id] = [];
      roleMap[r.document_id].push(r.role);
    });

    let result = docs.rows.map(d => ({ ...d, roles: roleMap[d.id] || [] }));
    if (!isPrivileged) {
      result = result.filter(d => d.roles.includes(req.user.role));
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload SOP
app.post('/api/sop-documents', authenticateToken, checkSOPPermission, sopUpload.single('file'), async (req, res) => {
  try {
    const { name, roles } = req.body;
    const parsedRoles = JSON.parse(roles || '[]');
    const maxSort = await pool.query('SELECT COALESCE(MAX(sort_order),0) AS m FROM sop_documents');
    const doc = await pool.query(
      `INSERT INTO sop_documents (name, filename, mimetype, size, uploaded_by_id, uploaded_by_name, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, req.file.filename, req.file.mimetype, req.file.size,
       req.user.id, req.user.name, maxSort.rows[0].m + 1]
    );
    for (const role of parsedRoles) {
      await pool.query('INSERT INTO sop_document_roles (document_id, role) VALUES ($1,$2) ON CONFLICT DO NOTHING', [doc.rows[0].id, role]);
    }
    res.json({ ...doc.rows[0], roles: parsedRoles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update SOP name/roles
app.patch('/api/sop-documents/:id', authenticateToken, checkSOPPermission, async (req, res) => {
  try {
    const { name, roles } = req.body;
    const parsedRoles = JSON.parse(roles || '[]');
    await pool.query('UPDATE sop_documents SET name=$1 WHERE id=$2', [name, req.params.id]);
    await pool.query('DELETE FROM sop_document_roles WHERE document_id=$1', [req.params.id]);
    for (const role of parsedRoles) {
      await pool.query('INSERT INTO sop_document_roles (document_id, role) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, role]);
    }
    res.json({ message: 'Updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reorder SOPs
app.patch('/api/sop-documents/reorder', authenticateToken, checkSOPPermission, async (req, res) => {
  try {
    const { orderedIds } = req.body;
    for (let i = 0; i < orderedIds.length; i++) {
      await pool.query('UPDATE sop_documents SET sort_order=$1 WHERE id=$2', [i, orderedIds[i]]);
    }
    res.json({ message: 'Reordered' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// View SOP inline
app.get('/api/sop-documents/:id/view', authenticateToken, async (req, res) => {
  try {
    const doc = await pool.query('SELECT * FROM sop_documents WHERE id=$1', [req.params.id]);
    if (!doc.rows.length) return res.status(404).json({ message: 'Not found' });
    const filePath = path.join(sopUploadDir, doc.rows[0].filename);
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(filePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Download SOP
app.get('/api/sop-documents/:id/download', authenticateToken, async (req, res) => {
  try {
    const doc = await pool.query('SELECT * FROM sop_documents WHERE id=$1', [req.params.id]);
    if (!doc.rows.length) return res.status(404).json({ message: 'Not found' });
    const filePath = path.join(sopUploadDir, doc.rows[0].filename);
    res.setHeader('Content-Disposition', `attachment; filename="${doc.rows[0].name}"`);
    res.sendFile(filePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete SOP
app.delete('/api/sop-documents/:id', authenticateToken, checkSOPPermission, async (req, res) => {
  try {
    const doc = await pool.query('SELECT * FROM sop_documents WHERE id=$1', [req.params.id]);
    if (!doc.rows.length) return res.status(404).json({ message: 'Not found' });
    const filePath = path.join(sopUploadDir, doc.rows[0].filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await pool.query('DELETE FROM sop_documents WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Label Inventory ───────────────────────────────────────────────────────────
const mailer = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

app.get('/api/label-inventory', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM label_inventory ORDER BY sort_order ASC, id ASC');
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/label-inventory', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  try {
    const { name, num_rolls, labels_per_roll, labels_on_order, low_par, high_par } = req.body;
    const maxSort = await pool.query('SELECT COALESCE(MAX(sort_order),0) AS m FROM label_inventory');
    const result = await pool.query(
      `INSERT INTO label_inventory (name, num_rolls, labels_per_roll, labels_on_order, low_par, high_par, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, num_rolls || 0, labels_per_roll || 2500, labels_on_order || 0, low_par || 0, high_par || 0, maxSort.rows[0].m + 1]
    );
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/label-inventory/reorder', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  try {
    const { orderedIds } = req.body;
    for (let i = 0; i < orderedIds.length; i++) {
      await pool.query('UPDATE label_inventory SET sort_order=$1 WHERE id=$2', [i, orderedIds[i]]);
    }
    res.json({ message: 'Reordered' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/label-inventory/:id', authenticateToken, async (req, res) => {
  try {
    const { name, num_rolls, labels_per_roll, labels_on_order, low_par, high_par } = req.body;
    const result = await pool.query(
      `UPDATE label_inventory SET name=$1, num_rolls=$2, labels_per_roll=$3,
       labels_on_order=$4, low_par=$5, high_par=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
      [name, num_rolls, labels_per_roll, labels_on_order, low_par, high_par, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/label-inventory/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  try {
    await pool.query('DELETE FROM label_inventory WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// Email list
app.get('/api/label-email-list', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM label_email_list ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/label-email-list', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  try {
    const result = await pool.query(
      'INSERT INTO label_email_list (email) VALUES ($1) ON CONFLICT DO NOTHING RETURNING *', [req.body.email]
    );
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/label-email-list/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  try {
    await pool.query('DELETE FROM label_email_list WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// Shared helper — builds and sends the label order email
async function sendLabelOrderEmail(overrides = {}) {
  const labels = await pool.query('SELECT * FROM label_inventory ORDER BY sort_order ASC');
  const emails = await pool.query('SELECT email FROM label_email_list');
  const to = emails.rows.map(r => r.email).join(',');
  if (!to) throw new Error('No email recipients configured.');

  const orderItems = labels.rows
    .map(l => {
      const currentInv   = parseFloat(l.num_rolls) * parseInt(l.labels_per_roll);
      const needsReorder = currentInv < parseInt(l.low_par);
      const defaultAmt   = needsReorder ? Math.max(0, parseInt(l.high_par) - currentInv) : 0;
      const qty          = overrides[l.id] !== undefined ? parseInt(overrides[l.id]) : defaultAmt;
      return (needsReorder || overrides[l.id] !== undefined) && qty > 0
        ? `${l.name} - ${qty.toLocaleString()} Labels`
        : null;
    })
    .filter(Boolean);

  const body = orderItems.length === 0
    ? 'We are good this week.'
    : `This week we need to order the following:\n\n${orderItems.join('\n')}\n\nThanks,`;

  await mailer.sendMail({ from: process.env.EMAIL_USER, to, subject: 'Core Label Order', text: body });
}

// Send order email (manual — accepts optional quantity overrides)
app.post('/api/label-inventory/send-order-email', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
  try {
    await sendLabelOrderEmail(req.body.overrides || {});
    res.json({ message: 'Email sent.' });
  } catch (err) { console.error(err); res.status(500).json({ message: `Failed to send email: ${err.message}` }); }
});

// ── Scheduled label emails — local dev only (production uses Netlify Scheduled Functions) ──
if (require.main === module) {
  const cron = require('node-cron');
  // Thursday 2:00 PM ET
  cron.schedule('0 14 * * 4', async () => {
    console.log('[cron] Sending Thursday label order email');
    try { await sendLabelOrderEmail(); } catch (err) { console.error('[cron] Email failed:', err.message); }
  }, { timezone: 'America/New_York' });

  // Friday 8:00 AM ET — only if inventory hasn't been updated since Thursday 2pm
  cron.schedule('0 8 * * 5', async () => {
    console.log('[cron] Friday check — verifying label inventory update');
    try {
      const result = await pool.query('SELECT MAX(updated_at) AS last FROM label_inventory');
      const lastUpdated = new Date(result.rows[0].last);
      const now = new Date();
      const thursday = new Date(now);
      thursday.setDate(now.getDate() - 1);
      thursday.setHours(14, 0, 0, 0);
      if (lastUpdated < thursday) {
        console.log('[cron] Inventory not updated since Thursday — sending reminder');
        await sendLabelOrderEmail();
      } else {
        console.log('[cron] Inventory updated since Thursday — skipping reminder');
      }
    } catch (err) { console.error('[cron] Friday check failed:', err.message); }
  }, { timezone: 'America/New_York' });
}

// ── Distro / Taproom Orders (Google Sheet) ────────────────────────────────────
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1Teo4JcdQRY8mmnUZOcS3NTZIIhhwWj6YoqFom6tqp6E/gviz/tq?tqx=out:csv&sheet=Invoice%20Log';

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = '';
    } else { current += ch; }
  }
  result.push(current);
  return result;
}

app.get('/api/distro-orders', authenticateToken, async (req, res) => {
  try {
    const response = await fetch(SHEET_CSV_URL);
    const csv = await response.text();
    const lines = csv.split('\n').filter(l => l.trim());
    const orders = lines.slice(1).map(line => {
      const cols = parseCSVLine(line);
      return {
        invoice_number: cols[1] || '',
        date:           cols[2] || '',
        recipient:      cols[3] || '',
        pdf_url:        cols[8] || '',
        status:         cols[10] || '',
      };
    }).filter(o => o.date && o.recipient);
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
});

// ── Taproom Inventory ──────────────────────────────────────────────────────

const TAPROOM_INPUT_SHEET_ID = '1aJ2R6OEvO5ixG-AsWdJlRSIsiMczEBOi_pk9Ra8Xuu0';
const TAPROOM_LOCATION_TABS = {
  midtown:    'Midtown',
  power_mill: 'Power%20Mill',
  northside:  'Northside',
  tampa:      'Tampa',
};

function parseTaproomCount(raw) {
  if (!raw) return 0;
  // Strip asterisk (means "on tap") and parse the number
  const n = parseFloat(raw.replace(/\*/g, '').trim());
  return isNaN(n) ? 0 : n;
}

function parseTaproomTabCSV(csv) {
  const lines = csv.split('\n').filter(l => l.trim());
  const rows = lines.map(l => parseCSVLine(l).map(v => v.replace(/^"|"$/g, '').trim()));

  // Find the date in the first 3 rows — handles M/D/YYYY, M/D/YY, and M/D (no year → current year)
  let sessionDate = null;
  const dateWithYearRe = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/;
  const dateNoYearRe   = /^(\d{1,2})[\/\-](\d{1,2})$/;
  const currentYear    = new Date().getFullYear();
  for (let i = 0; i < Math.min(3, rows.length); i++) {
    for (const cell of rows[i]) {
      const m = cell.match(dateWithYearRe);
      if (m) {
        const [, mo, day, yr] = m;
        const year = yr.length === 2 ? `20${yr}` : yr;
        sessionDate = `${year}-${mo.padStart(2, '0')}-${day.padStart(2, '0')}`;
        break;
      }
      const m2 = cell.match(dateNoYearRe);
      if (m2) {
        const [, mo, day] = m2;
        sessionDate = `${currentYear}-${mo.padStart(2, '0')}-${day.padStart(2, '0')}`;
        break;
      }
    }
    if (sessionDate) break;
  }

  // Find the note row (contains "* = A beer is on tap") — skip everything up to and including it
  let dataStart = 1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] && rows[i][0].includes('*')) {
      dataStart = i + 1;
      break;
    }
  }

  const beers = [];
  for (let i = dataStart; i < rows.length; i++) {
    const [name, fourPack, sixthBbl, halfBbl] = rows[i];
    // Skip blank names, placeholder "Name" rows, and the header note
    if (!name || name === 'Name' || name.includes('*')) continue;
    beers.push({
      name,
      four_pack: parseTaproomCount(fourPack),
      sixth_bbl: parseTaproomCount(sixthBbl),
      half_bbl:  parseTaproomCount(halfBbl),
    });
  }

  return { sessionDate, beers };
}

// GET beers — optional ?location=X filter returns only beers at that location
app.get('/api/taproom-beers', authenticateToken, async (req, res) => {
  const { location } = req.query;
  try {
    let result;
    if (location) {
      result = await pool.query(
        `SELECT b.id, b.name, b.sort_order,
                COALESCE(json_agg(bl.location) FILTER (WHERE bl.location IS NOT NULL), '[]') AS locations
         FROM taproom_beers b
         JOIN taproom_beer_locations bl ON bl.beer_id = b.id AND bl.location = $1
         GROUP BY b.id ORDER BY b.name`,
        [location]
      );
    } else {
      result = await pool.query(
        `SELECT b.id, b.name, b.sort_order,
                COALESCE(json_agg(bl.location) FILTER (WHERE bl.location IS NOT NULL), '[]') AS locations
         FROM taproom_beers b
         LEFT JOIN taproom_beer_locations bl ON bl.beer_id = b.id
         GROUP BY b.id ORDER BY b.name`
      );
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST add beer manually
app.post('/api/taproom-beers', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  const { name, locations = [] } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO taproom_beers (name) VALUES ($1) RETURNING *',
      [name]
    );
    const beerId = result.rows[0].id;
    for (const loc of locations) {
      await pool.query(
        'INSERT INTO taproom_beer_locations (beer_id, location) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [beerId, loc]
      );
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH update beer name
app.patch('/api/taproom-beers/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  const { name } = req.body;
  try {
    const result = await pool.query(
      'UPDATE taproom_beers SET name = $1 WHERE id = $2 RETURNING *',
      [name, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE beer
app.delete('/api/taproom-beers/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  try {
    await pool.query('DELETE FROM taproom_beers WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT toggle a beer's presence at a location
app.put('/api/taproom-beer-locations', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  const { beer_id, location, active } = req.body;
  try {
    if (active) {
      await pool.query(
        'INSERT INTO taproom_beer_locations (beer_id, location) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [beer_id, location]
      );
    } else {
      await pool.query(
        'DELETE FROM taproom_beer_locations WHERE beer_id = $1 AND location = $2',
        [beer_id, location]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST import from per-location tabs — creates beers, location associations, and baseline sessions
app.post('/api/taproom-beers/import-sheet', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  try {
    let beersAdded = 0, locationsAdded = 0, sessionsCreated = 0;
    const snapshotDates = {};

    for (const [loc, tab] of Object.entries(TAPROOM_LOCATION_TABS)) {
      const url = `https://docs.google.com/spreadsheets/d/${TAPROOM_INPUT_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${tab}`;
      const response = await fetch(url);
      const csv = await response.text();
      const { sessionDate, beers } = parseTaproomTabCSV(csv);
      snapshotDates[loc] = sessionDate;

      for (const beer of beers) {
        // Find or create beer record
        let beerRes = await pool.query('SELECT id FROM taproom_beers WHERE LOWER(name) = LOWER($1)', [beer.name]);
        let beerId;
        if (beerRes.rows.length === 0) {
          const ins = await pool.query('INSERT INTO taproom_beers (name) VALUES ($1) RETURNING id', [beer.name]);
          beerId = ins.rows[0].id;
          beersAdded++;
        } else {
          beerId = beerRes.rows[0].id;
        }

        // Add location association
        const locIns = await pool.query(
          'INSERT INTO taproom_beer_locations (beer_id, location) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
          [beerId, loc]
        );
        if (locIns.rows.length > 0) locationsAdded++;

        // Store count for session creation
        beer.beer_id = beerId;
      }

      // Create baseline session if one doesn't exist for this date+location
      if (sessionDate) {
        const exists = await pool.query(
          'SELECT id FROM taproom_inventory_sessions WHERE location = $1 AND session_date = $2',
          [loc, sessionDate]
        );
        if (exists.rows.length === 0) {
          const countsWithData = beers.filter(b => b.four_pack > 0 || b.sixth_bbl > 0 || b.half_bbl > 0);
          if (countsWithData.length > 0) {
            const sessionRes = await pool.query(
              `INSERT INTO taproom_inventory_sessions (location, session_date, submitted_by_id, submitted_by_name, notes)
               VALUES ($1, $2, $3, $4, $5) RETURNING id`,
              [loc, sessionDate, req.user.id, req.user.name, 'Imported from Google Sheet']
            );
            const sessionId = sessionRes.rows[0].id;
            for (const b of countsWithData) {
              await pool.query(
                `INSERT INTO taproom_inventory_counts (session_id, beer_id, four_pack, sixth_bbl, half_bbl)
                 VALUES ($1, $2, $3, $4, $5)`,
                [sessionId, b.beer_id, b.four_pack, b.sixth_bbl, b.half_bbl]
              );
            }
            sessionsCreated++;
          }
        }
      }
    }

    res.json({ beersAdded, locationsAdded, sessionsCreated, snapshotDates });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: `Import failed: ${err.message}` });
  }
});

// GET taproom inventory settings (discrepancy thresholds)
app.get('/api/taproom-settings', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM taproom_inventory_settings WHERE id = 1');
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT update discrepancy thresholds (admin only)
app.put('/api/taproom-settings', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  const { four_pack_threshold, sixth_bbl_threshold, half_bbl_threshold } = req.body;
  try {
    const result = await pool.query(
      `UPDATE taproom_inventory_settings
       SET four_pack_threshold = $1, sixth_bbl_threshold = $2, half_bbl_threshold = $3
       WHERE id = 1 RETURNING *`,
      [four_pack_threshold, sixth_bbl_threshold, half_bbl_threshold]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET inventory sessions (filter by location, limit)
app.get('/api/taproom-inventory', authenticateToken, async (req, res) => {
  const { location, limit = 20 } = req.query;
  try {
    const result = await pool.query(
      `SELECT s.id, s.location, s.session_date, s.submitted_by_name, s.notes, s.submitted_at
       FROM taproom_inventory_sessions s
       WHERE ($1::text IS NULL OR s.location = $1)
       ORDER BY s.session_date DESC, s.submitted_at DESC
       LIMIT $2`,
      [location || null, limit]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET latest session for a location — must be before /:id
app.get('/api/taproom-inventory/latest/:location', authenticateToken, async (req, res) => {
  try {
    const session = await pool.query(
      `SELECT s.id, s.session_date FROM taproom_inventory_sessions s
       WHERE s.location = $1
       ORDER BY s.session_date DESC, s.submitted_at DESC
       LIMIT 1`,
      [req.params.location]
    );
    if (!session.rows[0]) return res.json(null);
    const counts = await pool.query(
      `SELECT c.beer_id, c.four_pack, c.sixth_bbl, c.half_bbl
       FROM taproom_inventory_counts c WHERE c.session_id = $1`,
      [session.rows[0].id]
    );
    const countMap = {};
    counts.rows.forEach(r => { countMap[r.beer_id] = r; });
    res.json({ ...session.rows[0], counts: countMap });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET single session with counts
app.get('/api/taproom-inventory/:id', authenticateToken, async (req, res) => {
  try {
    const session = await pool.query(
      'SELECT * FROM taproom_inventory_sessions WHERE id = $1',
      [req.params.id]
    );
    if (!session.rows[0]) return res.status(404).json({ message: 'Not found' });
    const counts = await pool.query(
      `SELECT c.beer_id, b.name, c.four_pack, c.sixth_bbl, c.half_bbl
       FROM taproom_inventory_counts c
       JOIN taproom_beers b ON b.id = c.beer_id
       WHERE c.session_id = $1 ORDER BY b.name`,
      [req.params.id]
    );
    res.json({ ...session.rows[0], counts: counts.rows });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST submit inventory session
app.post('/api/taproom-inventory', authenticateToken, async (req, res) => {
  const { location, session_date, counts, notes } = req.body;
  try {
    const sessionRes = await pool.query(
      `INSERT INTO taproom_inventory_sessions (location, session_date, submitted_by_id, submitted_by_name, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [location, session_date, req.user.id, req.user.name, notes || null]
    );
    const sessionId = sessionRes.rows[0].id;
    for (const c of counts) {
      if (c.four_pack > 0 || c.sixth_bbl > 0 || c.half_bbl > 0) {
        await pool.query(
          `INSERT INTO taproom_inventory_counts (session_id, beer_id, four_pack, sixth_bbl, half_bbl)
           VALUES ($1, $2, $3, $4, $5)`,
          [sessionId, c.beer_id, c.four_pack || 0, c.sixth_bbl || 0, c.half_bbl || 0]
        );
      }
    }
    res.json({ id: sessionId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE inventory session (admin only)
app.delete('/api/taproom-inventory/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  try {
    await pool.query('DELETE FROM taproom_inventory_sessions WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Taproom Deliveries ─────────────────────────────────────────────────────

const DELIVERY_LOCATIONS = {
  'Midtown':    'midtown',
  'Power Mill': 'power_mill',
  'Northside':  'northside',
  'Tampa':      'tampa',
};

// Multer storage for delivery PDF uploads (memory only — don't save to disk)
const deliveryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Shared: parse a delivery PDF buffer → { location, locationLabel, invoiceNumber, deliveryDate, items }
async function parseTaproomDeliveryPDF(buffer) {
  const data = await pdfParse(buffer);
  const text = data.text;

  // Location: "Send To\nTampa" (newline between label and value)
  let location = null, locationLabel = null;
  const sendToMatch = text.match(/Send To\s*[\r\n]+\s*(.+)/);
  if (sendToMatch) {
    const candidate = sendToMatch[1].trim();
    for (const [label, id] of Object.entries(DELIVERY_LOCATIONS)) {
      if (candidate.toLowerCase().includes(label.toLowerCase())) {
        location = id; locationLabel = label; break;
      }
    }
  }
  if (!location) {
    for (const [label, id] of Object.entries(DELIVERY_LOCATIONS)) {
      if (text.includes(`Send To ${label}`)) { location = id; locationLabel = label; break; }
    }
  }

  // Extract invoice number
  // Invoice code is digits followed by letters (e.g. "260402TP") — require letters to avoid matching street numbers
  const invoiceMatch = text.match(/(\d{4,}[A-Z]+)/);
  const invoiceNumber = invoiceMatch?.[1] || null;

  // Extract date (DATE M/D/YYYY)
  const dateMatch = text.match(/DATE\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  let deliveryDate = null;
  if (dateMatch) {
    const [, mo, day, yr] = dateMatch;
    const year = yr.length === 2 ? `20${yr}` : yr;
    deliveryDate = `${year}-${mo.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Find the "BeerFormatQtyNotes" header row and parse subsequent lines
  const headerIdx = text.indexOf('BeerFormatQtyNotes');
  if (headerIdx === -1) throw new Error('Could not find item table in PDF — unexpected format');

  const afterHeader = text.slice(headerIdx + 'BeerFormatQtyNotes'.length);
  const rawLines = afterHeader.split('\n').map(l => l.trim()).filter(Boolean);

  const beersResult = await pool.query('SELECT id, name FROM taproom_beers ORDER BY LENGTH(name) DESC');
  const knownBeers  = beersResult.rows;

  const itemLineRe = /^([\s\S]+?)(Case|1\/6bbl|1\/2bbl)(\d+(?:\.\d+)?)(.*)$/;
  const items = [];
  for (const line of rawLines) {
    const m = line.match(itemLineRe);
    if (!m) continue;
    const rawPrefix = m[1].trim();
    const format    = m[2];
    const qty       = parseFloat(m[3]) || 0;
    let matchedBeer = null;
    for (const beer of knownBeers) {
      const escaped = beer.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(escaped, 'i').test(rawPrefix)) { matchedBeer = beer; break; }
    }
    items.push({
      beer_id:   matchedBeer?.id   || null,
      beer_name: matchedBeer?.name || rawPrefix,
      format,
      quantity:  qty,
      cases:     format === 'Case'    ? qty : 0,
      sixth_bbl: format === '1/6bbl' ? qty : 0,
      half_bbl:  format === '1/2bbl' ? qty : 0,
    });
  }

  if (items.length === 0) throw new Error('No line items found in PDF');
  return { location, locationLabel, invoiceNumber, deliveryDate, items };
}

// Shared: save a parsed delivery to DB (skips if invoice_number already exists)
// Returns 'saved' | 'duplicate' | 'no_location'
async function saveTaproomDelivery({ location, invoiceNumber, deliveryDate, items, submittedById, submittedByName, notes }) {
  if (!location) return 'no_location';
  if (invoiceNumber) {
    const dup = await pool.query('SELECT id FROM taproom_deliveries WHERE invoice_number = $1', [invoiceNumber]);
    if (dup.rows.length > 0) return 'duplicate';
  }
  const delivRes = await pool.query(
    `INSERT INTO taproom_deliveries (location, delivery_date, invoice_number, submitted_by_id, submitted_by_name, notes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [location, deliveryDate, invoiceNumber || null, submittedById, submittedByName, notes || null]
  );
  const deliveryId = delivRes.rows[0].id;
  for (const item of items) {
    await pool.query(
      `INSERT INTO taproom_delivery_items (delivery_id, beer_id, beer_name, cases, sixth_bbl, half_bbl)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [deliveryId, item.beer_id || null, item.beer_name, item.cases || 0, item.sixth_bbl || 0, item.half_bbl || 0]
    );
  }
  return 'saved';
}

// Sync deliveries from Invoice Log sheet for a given date range
// Parse a date string in either YYYY-MM-DD or M/D/YYYY format → "YYYY-MM-DD" or null
function parseSheetDate(raw) {
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const [, mo, day, yr] = mdy;
    const year = yr.length === 2 ? `20${yr}` : yr;
    return `${year}-${mo.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
}

async function syncDeliveriesFromSheet(fromDate, toDate) {
  const response = await fetch(SHEET_CSV_URL);
  const csv = await response.text();
  const lines = csv.split('\n').filter(l => l.trim());

  const results = { imported: 0, skipped: 0, failed: [], noLocation: 0 };

  for (const line of lines.slice(1)) {
    const cols    = parseCSVLine(line);
    const rawDate = (cols[2] || '').trim();
    const recipient = (cols[3] || '').trim();
    const pdfUrl    = (cols[8] || '').trim();
    // col[9] is a UUID unique per submission — use as stable duplicate key
    const rowUuid   = (cols[9] || '').trim();

    if (!rawDate || !pdfUrl) continue;

    // Parse date (sheet uses both YYYY-MM-DD and M/D/YYYY)
    const rowDate = parseSheetDate(rawDate);
    if (!rowDate) continue;
    if (rowDate < fromDate || rowDate > toDate) continue;

    // Only process taproom location rows
    let matchedLocation = null;
    for (const [label] of Object.entries(DELIVERY_LOCATIONS)) {
      if (recipient.toLowerCase().includes(label.toLowerCase())) { matchedLocation = label; break; }
    }
    if (!matchedLocation) continue;

    // Use UUID as the unique invoice key (sheet col[1] is empty for taproom rows)
    const uniqueKey = rowUuid || null;

    // Extract Google Drive file ID and build download URL
    const driveMatch = pdfUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!driveMatch) continue;
    const fileId = driveMatch[1];
    const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0`;

    try {
      const pdfRes = await fetch(downloadUrl);
      if (!pdfRes.ok) throw new Error(`HTTP ${pdfRes.status}`);
      const buffer = Buffer.from(await pdfRes.arrayBuffer());
      const parsed = await parseTaproomDeliveryPDF(buffer);

      const status = await saveTaproomDelivery({
        ...parsed,
        invoiceNumber: uniqueKey,        // UUID is the stable unique key
        deliveryDate:  parsed.deliveryDate || rowDate,
        submittedById: null,
        submittedByName: 'Auto-sync',
        notes: null,
      });

      if (status === 'saved')            results.imported++;
      else if (status === 'duplicate')   results.skipped++;
      else if (status === 'no_location') results.noLocation++;
    } catch (err) {
      results.failed.push({ invoiceNumber: rowUuid || recipient, error: err.message });
    }
  }
  return results;
}

// Saturday delivery sync — local dev only (production uses Netlify Scheduled Functions)
if (require.main === module) {
  const cron = require('node-cron');
  cron.schedule('0 6 * * 6', async () => {
    console.log('[cron] Saturday sync — importing taproom deliveries from Invoice Log sheet');
    try {
      const now = new Date();
      const friday = new Date(now); friday.setDate(now.getDate() - 1);
      const monday = new Date(friday); monday.setDate(friday.getDate() - 4);
      const fmt = d => d.toISOString().slice(0, 10);
      const results = await syncDeliveriesFromSheet(fmt(monday), fmt(friday));
      console.log(`[cron] Delivery sync complete — imported: ${results.imported}, skipped: ${results.skipped}, noLocation: ${results.noLocation}, failed: ${results.failed.length}`);
      if (results.failed.length) console.error('[cron] Failures:', results.failed);
    } catch (err) {
      console.error('[cron] Saturday delivery sync failed:', err.message);
    }
  }, { timezone: 'America/New_York' });
}

// POST parse a delivery PDF — returns structured preview, does NOT save
app.post('/api/taproom-deliveries/parse-pdf', authenticateToken, deliveryUpload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No PDF uploaded' });
  try {
    const parsed = await parseTaproomDeliveryPDF(req.file.buffer);
    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(err.message.includes('Could not find') || err.message.includes('No line items') ? 422 : 500)
      .json({ message: err.message });
  }
});

// POST manual on-demand sync from Invoice Log sheet
// Defaults to last 30 days so historical deliveries can be caught up
app.post('/api/taproom-deliveries/sync-sheet', authenticateToken, async (req, res) => {
  try {
    const { from_date, to_date } = req.body;
    const now = new Date();
    const fmt = d => d.toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
    const fromDate = from_date || fmt(thirtyDaysAgo);
    const toDate   = to_date   || fmt(now);

    const results = await syncDeliveriesFromSheet(fromDate, toDate);
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: `Sync failed: ${err.message}` });
  }
});

// POST save a confirmed delivery
app.post('/api/taproom-deliveries', authenticateToken, async (req, res) => {
  const { location, delivery_date, invoice_number, items, notes } = req.body;
  try {
    const status = await saveTaproomDelivery({
      location,
      invoiceNumber: invoice_number,
      deliveryDate: delivery_date,
      items,
      submittedById: req.user.id,
      submittedByName: req.user.name,
      notes,
    });
    if (status === 'duplicate') return res.status(409).json({ message: 'A delivery with this invoice number already exists' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET deliveries — optional ?location=X&since=YYYY-MM-DD
app.get('/api/taproom-deliveries', authenticateToken, async (req, res) => {
  const { location, since } = req.query;
  try {
    const result = await pool.query(
      `SELECT d.id, d.location, d.delivery_date, d.invoice_number, d.submitted_by_name, d.notes, d.created_at,
              json_agg(json_build_object(
                'id', i.id, 'beer_id', i.beer_id, 'beer_name', i.beer_name,
                'cases', i.cases, 'sixth_bbl', i.sixth_bbl, 'half_bbl', i.half_bbl
              ) ORDER BY i.id) AS items
       FROM taproom_deliveries d
       JOIN taproom_delivery_items i ON i.delivery_id = d.id
       WHERE ($1::text IS NULL OR d.location = $1)
         AND ($2::date IS NULL OR d.delivery_date >= $2)
       GROUP BY d.id
       ORDER BY d.delivery_date DESC, d.created_at DESC`,
      [location || null, since || null]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE delivery (admin only)
app.delete('/api/taproom-deliveries/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  try {
    await pool.query('DELETE FROM taproom_deliveries WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;