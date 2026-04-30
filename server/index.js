const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const pdfParse   = require('pdf-parse');
const { PDFDocument } = require('pdf-lib');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const pool = require('./db');
const app = express();

// File storage — memory storage for serverless; files uploaded to Supabase Storage
const memoryStorage = multer.memoryStorage();
const hrUpload         = multer({ storage: memoryStorage, limits: { fileSize: 25 * 1024 * 1024 } });
const hrUploadDir      = path.join(__dirname, 'uploads', 'hr-documents'); // local dev fallback path ref

// Helper: upload buffer to Supabase Storage, return public filename
async function uploadToSupabase(bucket, filename, buffer, mimetype) {
  const { error } = await supabase.storage.from(bucket).upload(filename, buffer, {
    contentType: mimetype,
    upsert: false,
  });
  if (error) throw error;
  return filename;
}

// Helper: get a signed URL (1 hour) for a file in Supabase Storage
async function getSignedUrl(bucket, filename) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filename, 3600);
  if (error) throw error;
  return data.signedUrl;
}

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
app.use((req, res, next) => req.body !== undefined ? next() : express.json()(req, res, next));
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
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    if (!user.password) return res.status(401).json({ message: 'Account setup is incomplete. Check your email for a setup link.' });
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

app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email required' });
    const result = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    // Always respond the same way to prevent email enumeration
    if (result.rows.length === 0) {
      return res.json({ message: 'If that email is in our system, a reset link has been sent.' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [token, expires, result.rows[0].id]
    );
    const resetUrl = `${process.env.CLIENT_URL || 'https://ologyhq.netlify.app'}/?reset=${token}`;
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    await transporter.sendMail({
      from: `"OlogyHQ" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'OlogyHQ — Password Reset',
      html: `<p>Someone requested a password reset for your OlogyHQ account.</p>
             <p><a href="${resetUrl}">Click here to set a new password</a></p>
             <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
    });
    res.json({ message: 'If that email is in our system, a reset link has been sent.' });
  } catch (err) {
    console.error('forgot-password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ message: 'Token and password required' });
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
    const result = await pool.query(
      'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'This reset link is invalid or has expired.' });
    }
    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      'UPDATE users SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [hashed, result.rows[0].id]
    );
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('reset-password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all users
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, created_at, (password IS NULL) AS invite_pending FROM users ORDER BY name'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add a new user
app.post('/api/users', authenticateToken, async (req, res) => {
  const { name, email, role } = req.body;
  try {
    // Check for duplicate email
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) return res.status(400).json({ message: 'An account with that email already exists.' });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days for invite

    const result = await pool.query(
      `INSERT INTO users (name, email, password, role, reset_token, reset_token_expires)
       VALUES ($1, $2, NULL, $3, $4, $5) RETURNING id, name, email, role`,
      [name, email, role, token, expires]
    );

    const setupUrl = `${process.env.CLIENT_URL || 'https://ologyhq.netlify.app'}/?reset=${token}`;
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    await transporter.sendMail({
      from: `"OlogyHQ" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'You\'ve been invited to OlogyHQ',
      html: `<p>Hi ${name},</p>
             <p>You've been added to OlogyHQ. Click the link below to set up your password and get started.</p>
             <p><a href="${setupUrl}">Set up your account</a></p>
             <p>This link expires in 7 days.</p>`,
    });

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Resend invite email
app.post('/api/users/:id/resend-invite', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT name, email, password FROM users WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const u = result.rows[0];
    if (u.password) return res.status(400).json({ message: 'User has already set their password.' });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query('UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3', [token, expires, req.params.id]);

    const setupUrl = `${process.env.CLIENT_URL || 'https://ologyhq.netlify.app'}/?reset=${token}`;
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    await transporter.sendMail({
      from: `"OlogyHQ" <${process.env.EMAIL_USER}>`,
      to: u.email,
      subject: 'Your OlogyHQ invite link',
      html: `<p>Hi ${u.name},</p>
             <p>Here's your updated link to set up your OlogyHQ account:</p>
             <p><a href="${setupUrl}">Set up your account</a></p>
             <p>This link expires in 7 days.</p>`,
    });
    res.json({ message: 'Invite resent.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a user's role
app.put('/api/users/:id', authenticateToken, async (req, res) => {
  const { role, name, email } = req.body;
  try {
    // Build dynamic update — only set fields that were provided
    const fields = [];
    const values = [];
    if (role  !== undefined) { fields.push(`role = $${fields.length + 1}`);  values.push(role); }
    if (name  !== undefined) { fields.push(`name = $${fields.length + 1}`);  values.push(name.trim()); }
    if (email !== undefined) {
      // Check for duplicate email (exclude current user)
      const dup = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2', [email.trim(), req.params.id]);
      if (dup.rows.length > 0) return res.status(400).json({ message: 'Email already in use.' });
      fields.push(`email = $${fields.length + 1}`);
      values.push(email.trim().toLowerCase());
    }
    if (fields.length === 0) return res.status(400).json({ message: 'Nothing to update.' });
    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING id, name, email, role`,
      values
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
    const target = await pool.query('SELECT email FROM users WHERE id = $1', [req.params.id]);
    if (target.rows.length > 0 && target.rows[0].email.toLowerCase() === 'david@ologybrewing.com') {
      return res.status(403).json({ message: 'This user cannot be deleted.' });
    }
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
       WHERE $1 = 'admin'
          OR t.visible_to_all = true
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
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const filename = unique + path.extname(req.file.originalname);
    await uploadToSupabase('hr-documents', filename, req.file.buffer, req.file.mimetype);

    const result = await pool.query(
      `INSERT INTO hr_documents (name, filename, mimetype, size, uploaded_by_id, uploaded_by_name, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM hr_documents))
       RETURNING *`,
      [displayName, filename, req.file.mimetype, req.file.size, req.user.id, req.user.name]
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
    const url = await getSignedUrl('hr-documents', doc.filename);
    res.redirect(url);
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
    const url = await getSignedUrl('hr-documents', doc.filename);
    res.redirect(url);
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
    await supabase.storage.from('hr-documents').remove([doc.filename]);
    await pool.query('DELETE FROM hr_documents WHERE id = $1', [req.params.id]);
    res.json({ message: 'Document deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Production Photos ─────────────────────────────────────────────────────────

const productionUploadDir = path.join(__dirname, 'uploads', 'production-photos');
const productionUpload = multer({ storage: memoryStorage, limits: { fileSize: 50 * 1024 * 1024 } });

// Serve a production photo inline — must come before /:id route
app.get('/api/production/photo/:filename', authenticateToken, async (req, res) => {
  try {
    const url = await getSignedUrl('production-photos', path.basename(req.params.filename));
    res.redirect(url);
  } catch (err) {
    res.status(404).json({ message: 'Not found' });
  }
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
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const filename = unique + path.extname(file.originalname);
      await uploadToSupabase('production-photos', filename, file.buffer, file.mimetype);
      await pool.query(
        'INSERT INTO production_photos (submission_id, is_packing_slip, filename, original_name, mimetype) VALUES ($1,true,$2,$3,$4)',
        [sub.id, filename, file.originalname, file.mimetype]
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
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const filename = unique + path.extname(file.originalname);
        await uploadToSupabase('production-photos', filename, file.buffer, file.mimetype);
        await pool.query(
          'INSERT INTO production_photos (submission_id, photo_set_id, is_packing_slip, filename, original_name, mimetype) VALUES ($1,$2,false,$3,$4,$5)',
          [sub.id, setId, filename, file.originalname, file.mimetype]
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
    const photos = await pool.query('SELECT filename FROM production_photos WHERE submission_id = $1', [req.params.id]);
    const filenames = photos.rows.map(p => p.filename);
    if (filenames.length) await supabase.storage.from('production-photos').remove(filenames);
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
const sopUpload = multer({ storage: memoryStorage });

function checkSOPPermission(req, res, next) {
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = $1 AND t.slug = 'sops' AND p.permission_level = 'upload'`,
    [req.user.role]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

// List SOPs (role-filtered for viewers, all for uploaders)
app.get('/api/sop-documents', authenticateToken, async (req, res) => {
  try {
    const isPrivileged = req.user.role === 'admin' || await pool.query(
      `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
       WHERE p.role = $1 AND t.slug = 'sops' AND p.permission_level = 'upload'`,
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

// Presign SOP upload URL — file goes directly from browser to Supabase, bypassing Lambda
app.post('/api/sop-documents/presign', authenticateToken, checkSOPPermission, async (req, res) => {
  try {
    const { filename } = req.body;
    const ext = (filename || 'file').split('.').pop().toLowerCase() || 'bin';
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { data, error } = await supabase.storage.from('sop-documents').createSignedUploadUrl(uniqueName);
    if (error) return res.status(500).json({ message: error.message });
    res.json({ signedUrl: data.signedUrl, token: data.token, path: data.path });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Commit SOP record after client-side direct upload
app.post('/api/sop-documents/commit', authenticateToken, checkSOPPermission, async (req, res) => {
  try {
    const { name, roles, filename, mimetype, size } = req.body;
    if (!name || !filename) return res.status(400).json({ message: 'Missing required fields.' });
    const parsedRoles = Array.isArray(roles) ? roles : JSON.parse(roles || '[]');
    const maxSort = await pool.query('SELECT COALESCE(MAX(sort_order),0) AS m FROM sop_documents');
    const doc = await pool.query(
      `INSERT INTO sop_documents (name, filename, mimetype, size, uploaded_by_id, uploaded_by_name, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, filename, mimetype, size, req.user.id, req.user.name, maxSort.rows[0].m + 1]
    );
    for (const role of parsedRoles) {
      await pool.query('INSERT INTO sop_document_roles (document_id, role) VALUES ($1,$2) ON CONFLICT DO NOTHING', [doc.rows[0].id, role]);
    }
    res.json({ ...doc.rows[0], roles: parsedRoles });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Upload SOP (legacy — still works for local dev / small files)
app.post('/api/sop-documents', authenticateToken, checkSOPPermission, sopUpload.single('file'), async (req, res) => {
  try {
    const { name, roles } = req.body;
    const parsedRoles = JSON.parse(roles || '[]');
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const filename = unique + path.extname(req.file.originalname);
    await uploadToSupabase('sop-documents', filename, req.file.buffer, req.file.mimetype);
    const maxSort = await pool.query('SELECT COALESCE(MAX(sort_order),0) AS m FROM sop_documents');
    const doc = await pool.query(
      `INSERT INTO sop_documents (name, filename, mimetype, size, uploaded_by_id, uploaded_by_name, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, filename, req.file.mimetype, req.file.size,
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
    const url = await getSignedUrl('sop-documents', doc.rows[0].filename);
    res.redirect(url);
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
    const url = await getSignedUrl('sop-documents', doc.rows[0].filename);
    res.redirect(url);
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
    await supabase.storage.from('sop-documents').remove([doc.rows[0].filename]);
    await pool.query('DELETE FROM sop_documents WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Checklists ─────────────────────────────────────────────────────────────────

function checkChecklistView(req, res, next) {
  if (req.user.role === 'admin') return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = $1 AND t.slug = 'checklists' AND p.permission_level IN ('view','upload')`,
    [req.user.role]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

function checkChecklistManage(req, res, next) {
  if (req.user.role === 'admin') return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = $1 AND t.slug = 'checklists' AND p.permission_level = 'upload'`,
    [req.user.role]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

app.get('/api/checklists', authenticateToken, checkChecklistView, async (req, res) => {
  try {
    const isPrivileged = req.user.role === 'admin' || await pool.query(
      `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
       WHERE p.role = $1 AND t.slug = 'checklists' AND p.permission_level = 'upload'`,
      [req.user.role]
    ).then(r => r.rows.length > 0);

    const cls   = await pool.query('SELECT * FROM checklists ORDER BY sort_order ASC, created_at ASC');
    const roles = await pool.query('SELECT * FROM checklist_roles');
    const items = await pool.query('SELECT * FROM checklist_items ORDER BY sort_order ASC');

    const roleMap = {};
    roles.rows.forEach(r => {
      if (!roleMap[r.checklist_id]) roleMap[r.checklist_id] = [];
      roleMap[r.checklist_id].push(r.role);
    });
    const itemMap = {};
    items.rows.forEach(i => {
      if (!itemMap[i.checklist_id]) itemMap[i.checklist_id] = [];
      itemMap[i.checklist_id].push(i);
    });

    let result = cls.rows.map(c => ({ ...c, roles: roleMap[c.id] || [], items: itemMap[c.id] || [] }));
    if (!isPrivileged) result = result.filter(c => c.roles.includes(req.user.role));
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// Run history — must be before /:id patterns
app.get('/api/checklists/runs', authenticateToken, checkChecklistView, async (req, res) => {
  try {
    const runs = await pool.query('SELECT * FROM checklist_runs ORDER BY created_at DESC LIMIT 200');
    res.json(runs.rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/checklists', authenticateToken, checkChecklistManage, async (req, res) => {
  try {
    const { name, category, description, roles, items } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Name required' });
    const maxSort = await pool.query('SELECT COALESCE(MAX(sort_order),0) AS m FROM checklists');
    const cl = await pool.query(
      `INSERT INTO checklists (name, category, description, sort_order, created_by_id, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name.trim(), category || 'other', description || '', maxSort.rows[0].m + 1, req.user.id, req.user.name]
    );
    const id = cl.rows[0].id;
    for (const role of (roles || [])) {
      await pool.query('INSERT INTO checklist_roles (checklist_id, role) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, role]);
    }
    for (let i = 0; i < (items || []).length; i++) {
      if (items[i]?.text?.trim()) await pool.query(
        'INSERT INTO checklist_items (checklist_id, text, sort_order) VALUES ($1,$2,$3)',
        [id, items[i].text.trim(), i]
      );
    }
    res.json({ ...cl.rows[0], roles: roles || [], items: items || [] });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// Reorder — must be before /:id
app.patch('/api/checklists/reorder', authenticateToken, checkChecklistManage, async (req, res) => {
  try {
    const { orderedIds } = req.body;
    for (let i = 0; i < orderedIds.length; i++) {
      await pool.query('UPDATE checklists SET sort_order=$1 WHERE id=$2', [i, orderedIds[i]]);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/checklists/:id', authenticateToken, checkChecklistManage, async (req, res) => {
  try {
    const { name, category, description, roles, items } = req.body;
    const id = parseInt(req.params.id);
    await pool.query(
      'UPDATE checklists SET name=$1, category=$2, description=$3, updated_at=NOW() WHERE id=$4',
      [name.trim(), category || 'other', description || '', id]
    );
    await pool.query('DELETE FROM checklist_roles WHERE checklist_id=$1', [id]);
    for (const role of (roles || [])) {
      await pool.query('INSERT INTO checklist_roles (checklist_id, role) VALUES ($1,$2)', [id, role]);
    }
    await pool.query('DELETE FROM checklist_items WHERE checklist_id=$1', [id]);
    for (let i = 0; i < (items || []).length; i++) {
      if (items[i]?.text?.trim()) await pool.query(
        'INSERT INTO checklist_items (checklist_id, text, sort_order) VALUES ($1,$2,$3)',
        [id, items[i].text.trim(), i]
      );
    }
    const updated = await pool.query('SELECT * FROM checklists WHERE id=$1', [id]);
    res.json({ ...updated.rows[0], roles: roles || [], items: items || [] });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/checklists/:id/runs', authenticateToken, checkChecklistView, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { notes, checkedItemIds, itemsTotal } = req.body;
    const cl = await pool.query('SELECT name FROM checklists WHERE id=$1', [id]);
    if (!cl.rows.length) return res.status(404).json({ message: 'Not found' });
    const run = await pool.query(
      `INSERT INTO checklist_runs
         (checklist_id, checklist_name, run_by_id, run_by_name, notes, checked_item_ids, items_total, items_completed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, cl.rows[0].name, req.user.id, req.user.name, notes || '',
       checkedItemIds || [], itemsTotal || 0, (checkedItemIds || []).length]
    );
    res.json(run.rows[0]);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/checklists/runs/:id', authenticateToken, checkChecklistManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM checklist_runs WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/checklists/:id', authenticateToken, checkChecklistManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM checklists WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// ── Label Inventory ───────────────────────────────────────────────────────────
const mailer = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const checkLabelManage = async (req, res, next) => {
  if (req.user.role === 'admin') return next();
  try {
    const r = await pool.query(
      `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
       WHERE p.role = $1 AND t.slug = 'label-inventory' AND p.permission_level = 'upload'`,
      [req.user.role]
    );
    if (r.rows.length === 0) return res.status(403).json({ message: 'Permission denied' });
    next();
  } catch { res.status(500).json({ message: 'Server error' }); }
};

app.get('/api/label-inventory', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM label_inventory ORDER BY sort_order ASC, id ASC');
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/label-inventory', authenticateToken, checkLabelManage, async (req, res) => {
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

app.patch('/api/label-inventory/reorder', authenticateToken, checkLabelManage, async (req, res) => {
  try {
    const { orderedIds } = req.body;
    for (let i = 0; i < orderedIds.length; i++) {
      await pool.query('UPDATE label_inventory SET sort_order=$1 WHERE id=$2', [i, orderedIds[i]]);
    }
    res.json({ message: 'Reordered' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/label-inventory/:id', authenticateToken, checkLabelManage, async (req, res) => {
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

app.delete('/api/label-inventory/:id', authenticateToken, checkLabelManage, async (req, res) => {
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

app.post('/api/label-email-list', authenticateToken, checkLabelManage, async (req, res) => {
  try {
    const result = await pool.query(
      'INSERT INTO label_email_list (email) VALUES ($1) ON CONFLICT DO NOTHING RETURNING *', [req.body.email]
    );
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/label-email-list/:id', authenticateToken, checkLabelManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM label_email_list WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// Shared helper — imported from labelEmail.js
const { sendLabelOrderEmail } = require('./labelEmail');

// Send order email (manual — accepts optional quantity overrides)
app.post('/api/label-inventory/send-order-email', authenticateToken, checkLabelManage, async (req, res) => {
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

app.get('/api/distro-orders/print-day', authenticateToken, async (req, res) => {
  try {
    const raw = req.query.fileIds || '';
    const fileIds = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (fileIds.length === 0) {
      return res.status(400).json({ message: 'fileIds required' });
    }
    const merged = await PDFDocument.create();
    for (const fileId of fileIds) {
      try {
        // confirm=t bypasses Google's virus-scan confirmation redirect
        const url = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
        const r = await fetch(url, {
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (!r.ok) { console.warn('Could not fetch PDF', fileId, r.status); continue; }
        const buf = await r.arrayBuffer();
        const header = Buffer.from(buf.slice(0, 5)).toString('ascii');
        if (header !== '%PDF-') {
          console.warn('Not a PDF for', fileId, '— header:', header);
          continue;
        }
        const pdf = await PDFDocument.load(buf, { ignoreEncryption: true });
        const pages = await merged.copyPages(pdf, pdf.getPageIndices());
        pages.forEach(p => merged.addPage(p));
        console.log('Merged', pdf.getPageCount(), 'pages from', fileId);
      } catch (e) {
        console.error('Failed to process PDF', fileId, e.message);
      }
    }
    if (merged.getPageCount() === 0) {
      console.warn('No pages merged — all PDF fetches failed');
      return res.status(502).json({ message: 'Could not download any invoices from Google Drive' });
    }
    console.log('Sending merged PDF with', merged.getPageCount(), 'total pages');
    const bytes = await merged.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="invoices.pdf"');
    res.send(Buffer.from(bytes));
  } catch (err) {
    console.error('print-day error:', err);
    res.status(500).json({ message: 'Failed to merge PDFs' });
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

// ── Taproom Inspections ────────────────────────────────────────────────────────

// List all inspections
app.get('/api/inspections', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM inspections ORDER BY created_at DESC LIMIT 100'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create inspection
app.post('/api/inspections', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `INSERT INTO inspections (location, date, improvements, score_pct, rated_count)
       VALUES ($1, $2, '', 0, 0) RETURNING *`,
      [req.body.location || '', req.body.date || new Date().toISOString().slice(0, 10)]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update inspection (location, date, improvements, score_pct, rated_count)
app.patch('/api/inspections/:id', authenticateToken, async (req, res) => {
  const { location, date, improvements, score_pct, rated_count } = req.body;
  try {
    const result = await pool.query(
      `UPDATE inspections SET
        location    = COALESCE($1, location),
        date        = COALESCE($2, date),
        improvements= COALESCE($3, improvements),
        score_pct   = COALESCE($4, score_pct),
        rated_count = COALESCE($5, rated_count)
       WHERE id = $6 RETURNING *`,
      [location, date, improvements, score_pct, rated_count, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete inspection
app.delete('/api/inspections/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM inspections WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get ratings for an inspection
app.get('/api/inspections/:id/ratings', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM inspection_ratings WHERE inspection_id = $1',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Upsert a rating
app.post('/api/inspections/:id/ratings', authenticateToken, async (req, res) => {
  const { section_id, item_index, rating, note } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO inspection_ratings (inspection_id, section_id, item_index, rating, note, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (inspection_id, section_id, item_index)
       DO UPDATE SET rating = EXCLUDED.rating, note = EXCLUDED.note, updated_at = now()
       RETURNING *`,
      [req.params.id, section_id, item_index, rating ?? null, note ?? '']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Recipes ───────────────────────────────────────────────────────────────────
const recipePhotoUpload = multer({ storage: memoryStorage, limits: { fileSize: 10 * 1024 * 1024 } });

function checkRecipesManage(req, res, next) {
  if (req.user.role === 'admin') return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = $1 AND t.slug = 'recipes' AND p.permission_level = 'upload'`,
    [req.user.role]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

// List all recipes
app.get('/api/recipes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM recipes ORDER BY sort_order ASC, created_at ASC');
    const allIds = [...new Set(result.rows.flatMap(r => r.linked_recipe_ids || []))];
    let linkedMap = {};
    if (allIds.length > 0) {
      const linked = await pool.query('SELECT id, name FROM recipes WHERE id = ANY($1)', [allIds]);
      linked.rows.forEach(r => { linkedMap[r.id] = r.name; });
    }
    const recipes = result.rows.map(r => ({
      ...r,
      linked_recipes: (r.linked_recipe_ids || []).map(id => ({ id, name: linkedMap[id] || '' })),
    }));
    res.json(recipes);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get recipe photo — download from Supabase and stream back (avoids signed URL redirect issues)
app.get('/api/recipes/:id/photo', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT image_filename FROM recipes WHERE id=$1', [req.params.id]);
    if (!r.rows.length || !r.rows[0].image_filename) return res.status(404).json({ message: 'No photo' });
    const { data, error } = await supabase.storage.from('recipe-photos').download(r.rows[0].image_filename);
    if (error || !data) return res.status(404).json({ message: 'Photo not found' });
    const buffer = Buffer.from(await data.arrayBuffer());
    const ext = path.extname(r.rows[0].image_filename).toLowerCase();
    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic', '.heif': 'image/heif' };
    res.setHeader('Content-Type', mimeMap[ext] || data.type || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create recipe
app.post('/api/recipes', authenticateToken, checkRecipesManage, recipePhotoUpload.single('photo'), async (req, res) => {
  try {
    const { name, category, cook_time, description, ingredients, instructions, plating, notes, linked_recipe_ids } = req.body;
    const linkedIds = JSON.parse(linked_recipe_ids || '[]');
    let imageFilename = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname) || '.jpg';
      imageFilename = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
      await uploadToSupabase('recipe-photos', imageFilename, req.file.buffer, req.file.mimetype);
    }
    const maxSort = await pool.query('SELECT COALESCE(MAX(sort_order),0) AS m FROM recipes');
    const recipe = await pool.query(
      `INSERT INTO recipes
         (name, category, cook_time, description, ingredients, instructions, plating, notes,
          image_filename, linked_recipe_ids, created_by_id, created_by_name, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [name, category || 'other', cook_time || '', description || '', ingredients || '',
       instructions || '', plating || '', notes || '', imageFilename, linkedIds,
       req.user.id, req.user.name, maxSort.rows[0].m + 1]
    );
    res.json(recipe.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reorder recipes — MUST be before /:id
app.patch('/api/recipes/reorder', authenticateToken, checkRecipesManage, async (req, res) => {
  try {
    const { orderedIds } = req.body;
    for (let i = 0; i < orderedIds.length; i++) {
      await pool.query('UPDATE recipes SET sort_order=$1 WHERE id=$2', [i, orderedIds[i]]);
    }
    res.json({ message: 'Reordered' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update recipe
app.patch('/api/recipes/:id', authenticateToken, checkRecipesManage, recipePhotoUpload.single('photo'), async (req, res) => {
  try {
    const { name, category, cook_time, description, ingredients, instructions, plating, notes, linked_recipe_ids, clear_photo } = req.body;
    const linkedIds = JSON.parse(linked_recipe_ids || '[]');
    const existing = await pool.query('SELECT * FROM recipes WHERE id=$1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ message: 'Not found' });
    let imageFilename = existing.rows[0].image_filename;
    if (req.file) {
      if (imageFilename) await supabase.storage.from('recipe-photos').remove([imageFilename]);
      const ext = path.extname(req.file.originalname) || '.jpg';
      imageFilename = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
      await uploadToSupabase('recipe-photos', imageFilename, req.file.buffer, req.file.mimetype);
    } else if (clear_photo === '1' && imageFilename) {
      await supabase.storage.from('recipe-photos').remove([imageFilename]);
      imageFilename = null;
    }
    const recipe = await pool.query(
      `UPDATE recipes SET name=$1, category=$2, cook_time=$3, description=$4, ingredients=$5,
       instructions=$6, plating=$7, notes=$8, image_filename=$9, linked_recipe_ids=$10,
       updated_at=NOW() WHERE id=$11 RETURNING *`,
      [name, category || 'other', cook_time || '', description || '', ingredients || '',
       instructions || '', plating || '', notes || '', imageFilename, linkedIds, req.params.id]
    );
    res.json(recipe.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete recipe
app.delete('/api/recipes/:id', authenticateToken, checkRecipesManage, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM recipes WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ message: 'Not found' });
    if (r.rows[0].image_filename) {
      await supabase.storage.from('recipe-photos').remove([r.rows[0].image_filename]);
    }
    await pool.query('DELETE FROM recipes WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Cocktail Keeper ──────────────────────────────────────────────────────────

function checkCocktailsView(req, res, next) {
  if (req.user.role === 'admin') return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = $1 AND t.slug = 'cocktail-keeper' AND p.permission_level IN ('view','upload')`,
    [req.user.role]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

function checkCocktailsManage(req, res, next) {
  if (req.user.role === 'admin') return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = $1 AND t.slug = 'cocktail-keeper' AND p.permission_level = 'upload'`,
    [req.user.role]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

const cocktailPhotoUpload = multer({ storage: memoryStorage, limits: { fileSize: 25 * 1024 * 1024 } });

// List catalog values
app.get('/api/cocktails/catalog', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cocktail_catalog ORDER BY category, sort_order');
    const catalog = {};
    for (const row of result.rows) {
      if (!catalog[row.category]) catalog[row.category] = [];
      catalog[row.category].push(row.value);
    }
    res.json(catalog);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// List tag definitions
app.get('/api/cocktails/tag-definitions', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cocktail_tag_definitions ORDER BY sort_order');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// List all cocktails
app.get('/api/cocktails', authenticateToken, async (req, res) => {
  try {
    const cocktails = await pool.query('SELECT * FROM cocktails ORDER BY sort_order ASC, created_at ASC');
    const ingredients = await pool.query('SELECT * FROM cocktail_ingredients ORDER BY cocktail_id, sort_order');
    const tags = await pool.query('SELECT * FROM cocktail_tags ORDER BY cocktail_id');

    const ingMap = {};
    for (const i of ingredients.rows) {
      if (!ingMap[i.cocktail_id]) ingMap[i.cocktail_id] = [];
      ingMap[i.cocktail_id].push(i);
    }
    const tagMap = {};
    for (const t of tags.rows) {
      if (!tagMap[t.cocktail_id]) tagMap[t.cocktail_id] = [];
      tagMap[t.cocktail_id].push({ name: t.tag_name, color: t.tag_color });
    }

    const batched = await pool.query('SELECT id, name FROM batched_cocktail_items ORDER BY sort_order');
    const batchedMap = {};
    for (const b of batched.rows) batchedMap[b.id] = b.name;

    res.json(cocktails.rows.map(c => ({
      ...c,
      ingredients: ingMap[c.id] || [],
      tags: tagMap[c.id] || [],
      linked_batched_items: (c.linked_batched_item_ids || []).map(id => ({ id, name: batchedMap[id] || '' })),
    })));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get cocktail photo
app.get('/api/cocktails/:id/photo', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT photo_filename FROM cocktails WHERE id=$1', [req.params.id]);
    if (!r.rows.length || !r.rows[0].photo_filename) return res.status(404).json({ message: 'No photo' });
    const { data, error } = await supabase.storage.from('cocktail-photos').download(r.rows[0].photo_filename);
    if (error || !data) return res.status(404).json({ message: 'Photo not found' });
    const buffer = Buffer.from(await data.arrayBuffer());
    const ext = path.extname(r.rows[0].photo_filename).toLowerCase();
    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic', '.heif': 'image/heif' };
    res.setHeader('Content-Type', mimeMap[ext] || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Cocktail settings (singleton row)
app.get('/api/cocktails/settings', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM cocktail_settings WHERE id = 1');
    res.json(r.rows[0] || { show_creator: true });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/cocktails/settings', authenticateToken, checkCocktailsManage, async (req, res) => {
  try {
    const { show_creator } = req.body;
    await pool.query(
      `INSERT INTO cocktail_settings (id, show_creator) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET show_creator = $1`,
      [show_creator]
    );
    res.json({ show_creator });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Ingredient list + merge — must be before /:id routes
app.get('/api/cocktails/ingredients', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT ingredient_name AS name, COUNT(*)::int AS count FROM cocktail_ingredients GROUP BY ingredient_name ORDER BY ingredient_name`
    );
    res.json(r.rows);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/cocktails/ingredients/merge', authenticateToken, async (req, res) => {
  try {
    const { from, to } = req.body; // from: string[], to: string
    if (!to || !Array.isArray(from) || from.length === 0) return res.status(400).json({ message: 'Invalid' });
    await pool.query(`UPDATE cocktail_ingredients SET ingredient_name=$1 WHERE ingredient_name = ANY($2::text[])`, [to, from]);
    res.json({ message: 'Merged' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Reorder cocktails — must be before /:id routes
app.patch('/api/cocktails/reorder', authenticateToken, checkCocktailsManage, async (req, res) => {
  try {
    const { ids } = req.body;
    for (let i = 0; i < ids.length; i++) {
      await pool.query('UPDATE cocktails SET sort_order=$1 WHERE id=$2', [i + 1, ids[i]]);
    }
    res.json({ message: 'Reordered' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create cocktail
app.post('/api/cocktails', authenticateToken, checkCocktailsView, cocktailPhotoUpload.single('photo'), async (req, res) => {
  try {
    // Determine if user has manage permission; view-only users get WIP + attribution
    const manageCheck = req.user.role === 'admin' ? { rows: [1] } : await pool.query(
      `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
       WHERE p.role = $1 AND t.slug = 'cocktail-keeper' AND p.permission_level = 'upload'`,
      [req.user.role]
    );
    const canManage = manageCheck.rows.length > 0;

    const { name, method, glass, ice, status, price, last_special_on, notes, suggested_by_name, linked_batched_item_ids, ingredients, tags } = req.body;
    const maxOrder = await pool.query('SELECT COALESCE(MAX(sort_order),0) AS m FROM cocktails');
    let photo_filename = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname) || '.jpg';
      photo_filename = `cocktail_${Date.now()}${ext}`;
      await uploadToSupabase('cocktail-photos', photo_filename, req.file.buffer, req.file.mimetype);
    }
    const batchIds = JSON.parse(linked_batched_item_ids || '[]');
    const effectiveStatus = canManage ? (status || 'menu') : 'wip';
    const suggestedByName = canManage ? (suggested_by_name || null) : req.user.name;
    const suggestedById   = canManage ? null : req.user.id;
    const result = await pool.query(
      `INSERT INTO cocktails (name, method, glass, ice, status, price, last_special_on, notes, photo_filename, linked_batched_item_ids, sort_order, suggested_by_name, suggested_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [name, method||null, glass||null, ice||null, effectiveStatus, canManage ? (price||null) : null, canManage ? (last_special_on||null) : null, notes||null, photo_filename, batchIds, maxOrder.rows[0].m + 1, suggestedByName, suggestedById]
    );
    const cocktail = result.rows[0];
    const ingList = JSON.parse(ingredients || '[]');
    for (let i = 0; i < ingList.length; i++) {
      const ing = ingList[i];
      await pool.query(
        'INSERT INTO cocktail_ingredients (cocktail_id, ingredient_name, amount, unit, sort_order) VALUES ($1,$2,$3,$4,$5)',
        [cocktail.id, ing.ingredient_name, ing.amount||null, ing.unit||null, i+1]
      );
    }
    const tagList = JSON.parse(tags || '[]');
    for (const tag of tagList) {
      const td = await pool.query('SELECT color FROM cocktail_tag_definitions WHERE name=$1', [tag]);
      await pool.query(
        'INSERT INTO cocktail_tags (cocktail_id, tag_name, tag_color) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [cocktail.id, tag, td.rows[0]?.color || '#6b7280']
      );
    }
    // Update reverse links on batched items
    for (const bid of batchIds) {
      await pool.query(
        `UPDATE batched_cocktail_items SET linked_cocktail_ids = array_append(linked_cocktail_ids, $1)
         WHERE id=$2 AND NOT ($1 = ANY(linked_cocktail_ids))`,
        [cocktail.id, bid]
      );
    }
    res.json(cocktail);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update cocktail
app.patch('/api/cocktails/:id', authenticateToken, checkCocktailsView, cocktailPhotoUpload.single('photo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, method, glass, ice, status, price, last_special_on, notes, suggested_by_name, linked_batched_item_ids, ingredients, tags, remove_photo } = req.body;
    const existing = await pool.query('SELECT * FROM cocktails WHERE id=$1', [id]);
    if (!existing.rows.length) return res.status(404).json({ message: 'Not found' });

    // Non-managers can only edit cocktails they submitted
    const canManage = await pool.query(
      `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
       WHERE p.role = $1 AND t.slug = 'cocktail-keeper' AND p.permission_level = 'upload'`,
      [req.user.role]
    );
    const isManager = req.user.role === 'admin' || canManage.rows.length > 0;
    if (!isManager && existing.rows[0].suggested_by_id !== req.user.id) {
      return res.status(403).json({ message: 'You can only edit cocktails you submitted.' });
    }

    let photo_filename = existing.rows[0].photo_filename;
    if (remove_photo === 'true' && photo_filename) {
      await supabase.storage.from('cocktail-photos').remove([photo_filename]);
      photo_filename = null;
    }
    if (req.file) {
      if (photo_filename) await supabase.storage.from('cocktail-photos').remove([photo_filename]);
      const ext = path.extname(req.file.originalname) || '.jpg';
      photo_filename = `cocktail_${Date.now()}${ext}`;
      await uploadToSupabase('cocktail-photos', photo_filename, req.file.buffer, req.file.mimetype);
    }

    const oldBatchIds = existing.rows[0].linked_batched_item_ids || [];
    const newBatchIds = JSON.parse(linked_batched_item_ids || '[]');

    // Non-managers cannot change status, price, or last_special_on
    const effectiveStatus     = isManager ? (status || 'menu')     : existing.rows[0].status;
    const effectivePrice      = isManager ? (price || null)        : existing.rows[0].price;
    const effectiveSpecialOn  = isManager ? (last_special_on||null): existing.rows[0].last_special_on;

    const effectiveSuggestedBy = isManager ? (suggested_by_name || null) : existing.rows[0].suggested_by_name;

    const result = await pool.query(
      `UPDATE cocktails SET name=$1, method=$2, glass=$3, ice=$4, status=$5, price=$6, last_special_on=$7, notes=$8, photo_filename=$9, linked_batched_item_ids=$10, suggested_by_name=$11
       WHERE id=$12 RETURNING *`,
      [name, method||null, glass||null, ice||null, effectiveStatus, effectivePrice, effectiveSpecialOn, notes||null, photo_filename, newBatchIds, effectiveSuggestedBy, id]
    );

    // Sync ingredients
    await pool.query('DELETE FROM cocktail_ingredients WHERE cocktail_id=$1', [id]);
    const ingList = JSON.parse(ingredients || '[]');
    for (let i = 0; i < ingList.length; i++) {
      const ing = ingList[i];
      await pool.query(
        'INSERT INTO cocktail_ingredients (cocktail_id, ingredient_name, amount, unit, sort_order) VALUES ($1,$2,$3,$4,$5)',
        [id, ing.ingredient_name, ing.amount||null, ing.unit||null, i+1]
      );
    }

    // Sync tags
    await pool.query('DELETE FROM cocktail_tags WHERE cocktail_id=$1', [id]);
    const tagList = JSON.parse(tags || '[]');
    for (const tag of tagList) {
      const td = await pool.query('SELECT color FROM cocktail_tag_definitions WHERE name=$1', [tag]);
      await pool.query(
        'INSERT INTO cocktail_tags (cocktail_id, tag_name, tag_color) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [id, tag, td.rows[0]?.color || '#6b7280']
      );
    }

    // Sync reverse batched item links
    const removedBatch = oldBatchIds.filter(b => !newBatchIds.includes(b));
    const addedBatch = newBatchIds.filter(b => !oldBatchIds.includes(b));
    for (const bid of removedBatch) {
      await pool.query(
        `UPDATE batched_cocktail_items SET linked_cocktail_ids = array_remove(linked_cocktail_ids, $1) WHERE id=$2`,
        [parseInt(id), bid]
      );
    }
    for (const bid of addedBatch) {
      await pool.query(
        `UPDATE batched_cocktail_items SET linked_cocktail_ids = array_append(linked_cocktail_ids, $1)
         WHERE id=$2 AND NOT ($1 = ANY(linked_cocktail_ids))`,
        [parseInt(id), bid]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete cocktail
app.delete('/api/cocktails/:id', authenticateToken, checkCocktailsManage, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM cocktails WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ message: 'Not found' });
    if (r.rows[0].photo_filename) {
      await supabase.storage.from('cocktail-photos').remove([r.rows[0].photo_filename]);
    }
    // Remove from batched item reverse links
    for (const bid of (r.rows[0].linked_batched_item_ids || [])) {
      await pool.query(
        `UPDATE batched_cocktail_items SET linked_cocktail_ids = array_remove(linked_cocktail_ids, $1) WHERE id=$2`,
        [parseInt(req.params.id), bid]
      );
    }
    await pool.query('DELETE FROM cocktails WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// List all batched items
app.get('/api/cocktails/batched', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM batched_cocktail_items ORDER BY sort_order ASC, created_at ASC');
    const allIds = [...new Set(result.rows.flatMap(r => r.linked_cocktail_ids || []))];
    let cocktailMap = {};
    if (allIds.length > 0) {
      const linked = await pool.query('SELECT id, name FROM cocktails WHERE id = ANY($1)', [allIds]);
      linked.rows.forEach(r => { cocktailMap[r.id] = r.name; });
    }
    res.json(result.rows.map(b => ({
      ...b,
      linked_cocktails: (b.linked_cocktail_ids || []).map(id => ({ id, name: cocktailMap[id] || '' })),
    })));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Reorder batched items — must be before /batched/:id routes
app.patch('/api/cocktails/batched/reorder', authenticateToken, checkCocktailsManage, async (req, res) => {
  try {
    const { ids } = req.body;
    for (let i = 0; i < ids.length; i++) {
      await pool.query('UPDATE batched_cocktail_items SET sort_order=$1 WHERE id=$2', [i + 1, ids[i]]);
    }
    res.json({ message: 'Reordered' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create batched item
app.post('/api/cocktails/batched', authenticateToken, checkCocktailsManage, async (req, res) => {
  try {
    const { name, recipe_notes, yield_amount, yield_unit, linked_cocktail_ids } = req.body;
    const maxOrder = await pool.query('SELECT COALESCE(MAX(sort_order),0) AS m FROM batched_cocktail_items');
    const ids = JSON.parse(linked_cocktail_ids || '[]');
    const result = await pool.query(
      `INSERT INTO batched_cocktail_items (name, recipe_notes, yield_amount, yield_unit, linked_cocktail_ids, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, recipe_notes||null, yield_amount||null, yield_unit||null, ids, maxOrder.rows[0].m + 1]
    );
    const item = result.rows[0];
    for (const cid of ids) {
      await pool.query(
        `UPDATE cocktails SET linked_batched_item_ids = array_append(linked_batched_item_ids, $1)
         WHERE id=$2 AND NOT ($1 = ANY(linked_batched_item_ids))`,
        [item.id, cid]
      );
    }
    res.json(item);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update batched item
app.patch('/api/cocktails/batched/:id', authenticateToken, checkCocktailsManage, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, recipe_notes, yield_amount, yield_unit, linked_cocktail_ids } = req.body;
    const existing = await pool.query('SELECT * FROM batched_cocktail_items WHERE id=$1', [id]);
    if (!existing.rows.length) return res.status(404).json({ message: 'Not found' });

    const oldIds = existing.rows[0].linked_cocktail_ids || [];
    const newIds = JSON.parse(linked_cocktail_ids || '[]');

    const result = await pool.query(
      `UPDATE batched_cocktail_items SET name=$1, recipe_notes=$2, yield_amount=$3, yield_unit=$4, linked_cocktail_ids=$5
       WHERE id=$6 RETURNING *`,
      [name, recipe_notes||null, yield_amount||null, yield_unit||null, newIds, id]
    );

    const removed = oldIds.filter(c => !newIds.includes(c));
    const added = newIds.filter(c => !oldIds.includes(c));
    for (const cid of removed) {
      await pool.query(
        `UPDATE cocktails SET linked_batched_item_ids = array_remove(linked_batched_item_ids, $1) WHERE id=$2`,
        [parseInt(id), cid]
      );
    }
    for (const cid of added) {
      await pool.query(
        `UPDATE cocktails SET linked_batched_item_ids = array_append(linked_batched_item_ids, $1)
         WHERE id=$2 AND NOT ($1 = ANY(linked_batched_item_ids))`,
        [parseInt(id), cid]
      );
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete batched item
app.delete('/api/cocktails/batched/:id', authenticateToken, checkCocktailsManage, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM batched_cocktail_items WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ message: 'Not found' });
    for (const cid of (r.rows[0].linked_cocktail_ids || [])) {
      await pool.query(
        `UPDATE cocktails SET linked_batched_item_ids = array_remove(linked_batched_item_ids, $1) WHERE id=$2`,
        [parseInt(req.params.id), cid]
      );
    }
    await pool.query('DELETE FROM batched_cocktail_items WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// List submissions (manage only)
app.get('/api/cocktails/submissions', authenticateToken, checkCocktailsManage, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, c.name AS cocktail_name_ref
       FROM cocktail_submissions s
       LEFT JOIN cocktails c ON c.id = s.cocktail_id
       ORDER BY s.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit a suggestion (view access)
app.post('/api/cocktails/submissions', authenticateToken, checkCocktailsView, async (req, res) => {
  try {
    const { type, cocktail_id, cocktail_name, description } = req.body;
    const result = await pool.query(
      `INSERT INTO cocktail_submissions (type, cocktail_id, submitted_by_id, submitted_by_name, cocktail_name, description)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [type || 'new', cocktail_id || null, req.user.id, req.user.name, cocktail_name || null, description || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark submission as reviewed / update status (manage only)
app.patch('/api/cocktails/submissions/:id', authenticateToken, checkCocktailsManage, async (req, res) => {
  try {
    const { status } = req.body;
    const result = await pool.query(
      `UPDATE cocktail_submissions SET status=$1 WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete submission (manage only)
app.delete('/api/cocktails/submissions/:id', authenticateToken, checkCocktailsManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM cocktail_submissions WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Sales CRM ──────────────────────────────────────────────────────────────


const checkCRMView = async (req, res, next) => {
  if (req.user.role === 'admin') return next();
  try {
    const r = await pool.query(
      `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
       WHERE p.role = $1 AND t.slug = 'sales-crm' AND p.permission_level = 'view'`,
      [req.user.role]
    );
    if (r.rows.length === 0) return res.status(403).json({ message: 'Permission denied' });
    next();
  } catch { res.status(500).json({ message: 'Server error' }); }
};

const checkCRMManage = async (req, res, next) => {
  if (req.user.role === 'admin') return next();
  try {
    const r = await pool.query(
      `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
       WHERE p.role = $1 AND t.slug = 'sales-crm' AND p.permission_level = 'upload'`,
      [req.user.role]
    );
    if (r.rows.length === 0) return res.status(403).json({ message: 'Permission denied' });
    next();
  } catch { res.status(500).json({ message: 'Server error' }); }
};

// Product lines
app.get('/api/crm/product-lines', authenticateToken, checkCRMView, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM crm_product_lines ORDER BY sort_order, name');
    res.json(r.rows);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/crm/product-lines', authenticateToken, checkCRMManage, async (req, res) => {
  try {
    const { name, type } = req.body;
    const r = await pool.query(
      `INSERT INTO crm_product_lines (name, type, sort_order)
       VALUES ($1, $2, (SELECT COALESCE(MAX(sort_order),0)+1 FROM crm_product_lines))
       RETURNING *`,
      [name, type || 'beer']
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/crm/product-lines/reorder', authenticateToken, checkCRMManage, async (req, res) => {
  try {
    const { ids } = req.body;
    await Promise.all(ids.map((id, i) =>
      pool.query('UPDATE crm_product_lines SET sort_order=$1 WHERE id=$2', [i, id])
    ));
    res.json({ message: 'Reordered' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/crm/product-lines/:id', authenticateToken, checkCRMManage, async (req, res) => {
  try {
    const { name, type } = req.body;
    const r = await pool.query(
      `UPDATE crm_product_lines SET name=COALESCE($1,name), type=COALESCE($2,type) WHERE id=$3 RETURNING *`,
      [name, type, req.params.id]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/crm/product-lines/:id', authenticateToken, checkCRMManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_product_lines WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Activity types
app.get('/api/crm/activity-types', authenticateToken, checkCRMView, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM crm_activity_types ORDER BY sort_order, name');
    res.json(r.rows);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/crm/activity-types', authenticateToken, checkCRMManage, async (req, res) => {
  try {
    const { name } = req.body;
    const r = await pool.query(
      `INSERT INTO crm_activity_types (name, sort_order)
       VALUES ($1, (SELECT COALESCE(MAX(sort_order),0)+1 FROM crm_activity_types))
       RETURNING *`,
      [name]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/crm/activity-types/:id', authenticateToken, checkCRMManage, async (req, res) => {
  try {
    const { name } = req.body;
    const r = await pool.query(
      `UPDATE crm_activity_types SET name=$1 WHERE id=$2 RETURNING *`,
      [name, req.params.id]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/crm/activity-types/:id', authenticateToken, checkCRMManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_activity_types WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Contact Roles
app.get('/api/crm/contact-roles', authenticateToken, checkCRMView, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM crm_contact_roles ORDER BY sort_order, name');
    res.json(r.rows);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/crm/contact-roles', authenticateToken, checkCRMManage, async (req, res) => {
  try {
    const r = await pool.query(
      `INSERT INTO crm_contact_roles (name, sort_order) VALUES ($1,(SELECT COALESCE(MAX(sort_order),0)+1 FROM crm_contact_roles)) RETURNING *`,
      [req.body.name]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/crm/contact-roles/:id', authenticateToken, checkCRMManage, async (req, res) => {
  try {
    const r = await pool.query('UPDATE crm_contact_roles SET name=$1 WHERE id=$2 RETURNING *', [req.body.name, req.params.id]);
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/crm/contact-roles/:id', authenticateToken, checkCRMManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_contact_roles WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Distributors
app.get('/api/crm/distributors', authenticateToken, checkCRMView, async (req, res) => {
  try {
    const dist = await pool.query('SELECT * FROM crm_distributors ORDER BY sort_order, name');
    const contacts = await pool.query(
      `SELECT dc.*, cr.name AS role_name
       FROM crm_distributor_contacts dc
       LEFT JOIN crm_contact_roles cr ON cr.id = dc.role_id
       ORDER BY dc.distributor_id, dc.is_primary DESC, dc.sort_order`
    );
    const prods = await pool.query(
      `SELECT dp.distributor_id, pl.id, pl.name, pl.type
       FROM crm_distributor_products dp JOIN crm_product_lines pl ON pl.id = dp.product_line_id`
    );
    const contactMap = {};
    contacts.rows.forEach(c => { (contactMap[c.distributor_id] ||= []).push(c); });
    const prodMap = {};
    prods.rows.forEach(p => { (prodMap[p.distributor_id] ||= []).push({ id: p.id, name: p.name, type: p.type }); });
    res.json(dist.rows.map(d => ({
      ...d,
      contacts: contactMap[d.id] || [],
      product_lines: prodMap[d.id] || [],
    })));
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/crm/distributors', authenticateToken, checkCRMManage, async (req, res) => {
  try {
    const { name, territory, notes } = req.body;
    const r = await pool.query(
      `INSERT INTO crm_distributors (name, territory, notes, sort_order)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order),0)+1 FROM crm_distributors))
       RETURNING *`,
      [name, territory || null, notes || null]
    );
    res.json({ ...r.rows[0], contacts: [], product_lines: [] });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/crm/distributors/:id', authenticateToken, checkCRMManage, async (req, res) => {
  try {
    const { name, territory, notes } = req.body;
    const r = await pool.query(
      `UPDATE crm_distributors SET name=COALESCE($1,name), territory=$2, notes=$3, updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [name, territory ?? null, notes ?? null, req.params.id]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/crm/distributors/:id', authenticateToken, checkCRMManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_distributors WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Distributor contacts
app.post('/api/crm/distributors/:id/contacts', authenticateToken, checkCRMView, async (req, res) => {
  try {
    const { name, title, phone, email, is_primary, role_id } = req.body;
    const distId = req.params.id;
    if (is_primary) {
      await pool.query('UPDATE crm_distributor_contacts SET is_primary=FALSE WHERE distributor_id=$1', [distId]);
    }
    const r = await pool.query(
      `INSERT INTO crm_distributor_contacts (distributor_id, name, title, phone, email, is_primary, role_id, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,(SELECT COALESCE(MAX(sort_order),0)+1 FROM crm_distributor_contacts WHERE distributor_id=$1))
       RETURNING *`,
      [distId, name, title || null, phone || null, email || null, !!is_primary, role_id || null]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/crm/distributors/:id/contacts/:contactId', authenticateToken, checkCRMView, async (req, res) => {
  try {
    const { name, title, phone, email, is_primary, role_id } = req.body;
    const distId = req.params.id;
    if (is_primary) {
      await pool.query('UPDATE crm_distributor_contacts SET is_primary=FALSE WHERE distributor_id=$1', [distId]);
    }
    const r = await pool.query(
      `UPDATE crm_distributor_contacts SET
         name=COALESCE($1,name), title=$2, phone=$3, email=$4,
         is_primary=COALESCE($5,is_primary), role_id=$6
       WHERE id=$7 RETURNING *`,
      [name, title ?? null, phone ?? null, email ?? null, is_primary ?? null, role_id ?? null, req.params.contactId]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/crm/distributors/:id/contacts/:contactId', authenticateToken, checkCRMView, async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_distributor_contacts WHERE id=$1', [req.params.contactId]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Distributor product lines (replace-all)
app.put('/api/crm/distributors/:id/products', authenticateToken, checkCRMManage, async (req, res) => {
  try {
    const { product_line_ids } = req.body;
    await pool.query('DELETE FROM crm_distributor_products WHERE distributor_id=$1', [req.params.id]);
    if (product_line_ids && product_line_ids.length > 0) {
      await Promise.all(product_line_ids.map(plId =>
        pool.query('INSERT INTO crm_distributor_products (distributor_id, product_line_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, plId])
      ));
    }
    res.json({ message: 'Updated' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Accounts
app.get('/api/crm/accounts', authenticateToken, checkCRMView, async (req, res) => {
  try {
    const [accts, prods, contacts] = await Promise.all([
      pool.query(`SELECT a.*, d.name AS distributor_name FROM crm_accounts a LEFT JOIN crm_distributors d ON d.id = a.distributor_id ORDER BY a.sort_order, a.name`),
      pool.query(`SELECT ap.account_id, pl.id, pl.name, pl.type FROM crm_account_products ap JOIN crm_product_lines pl ON pl.id = ap.product_line_id`),
      pool.query(`SELECT * FROM crm_account_contacts ORDER BY is_primary DESC, sort_order`),
    ]);
    const prodMap = {};
    prods.rows.forEach(p => { (prodMap[p.account_id] ||= []).push({ id: p.id, name: p.name, type: p.type }); });
    const contactMap = {};
    contacts.rows.forEach(c => { (contactMap[c.account_id] ||= []).push(c); });
    res.json(accts.rows.map(a => ({ ...a, product_lines: prodMap[a.id] || [], contacts: contactMap[a.id] || [] })));
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/crm/accounts', authenticateToken, checkCRMView, async (req, res) => {
  try {
    const { name, type, address, city, state, phone, email, contact_name, contact_title, distributor_id, notes } = req.body;
    const r = await pool.query(
      `INSERT INTO crm_accounts (name, type, address, city, state, phone, email, contact_name, contact_title, distributor_id, notes, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,(SELECT COALESCE(MAX(sort_order),0)+1 FROM crm_accounts))
       RETURNING *`,
      [name, type || 'bar', address || null, city || null, state || 'FL', phone || null, email || null,
       contact_name || null, contact_title || null, distributor_id || null, notes || null]
    );
    res.json({ ...r.rows[0], product_lines: [] });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/crm/accounts/:id', authenticateToken, checkCRMView, async (req, res) => {
  try {
    const { name, type, address, city, state, phone, email, contact_name, contact_title, distributor_id, notes } = req.body;
    const r = await pool.query(
      `UPDATE crm_accounts SET
         name=COALESCE($1,name), type=COALESCE($2,type),
         address=$3, city=$4, state=COALESCE($5,state),
         phone=$6, email=$7, contact_name=$8, contact_title=$9,
         distributor_id=$10, notes=$11, updated_at=NOW()
       WHERE id=$12 RETURNING *`,
      [name, type, address ?? null, city ?? null, state, phone ?? null, email ?? null,
       contact_name ?? null, contact_title ?? null, distributor_id ?? null, notes ?? null, req.params.id]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/crm/accounts/:id', authenticateToken, checkCRMManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_accounts WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Account contacts
app.post('/api/crm/accounts/:id/contacts', authenticateToken, checkCRMView, async (req, res) => {
  try {
    const { name, title, phone, email, is_primary } = req.body;
    const r = await pool.query(
      `INSERT INTO crm_account_contacts (account_id, name, title, phone, email, is_primary, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,(SELECT COALESCE(MAX(sort_order),0)+1 FROM crm_account_contacts WHERE account_id=$1))
       RETURNING *`,
      [req.params.id, name, title||null, phone||null, email||null, !!is_primary]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/crm/accounts/:id/contacts/:cid', authenticateToken, checkCRMView, async (req, res) => {
  try {
    const { name, title, phone, email, is_primary } = req.body;
    const r = await pool.query(
      `UPDATE crm_account_contacts SET name=$1, title=$2, phone=$3, email=$4, is_primary=$5 WHERE id=$6 AND account_id=$7 RETURNING *`,
      [name, title||null, phone||null, email||null, !!is_primary, req.params.cid, req.params.id]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/crm/accounts/:id/contacts/:cid', authenticateToken, checkCRMView, async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_account_contacts WHERE id=$1 AND account_id=$2', [req.params.cid, req.params.id]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Merge account: absorb source_id into :id
app.post('/api/crm/accounts/:id/merge', authenticateToken, checkCRMManage, async (req, res) => {
  const { source_id } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const [targetRow, sourceRow] = await Promise.all([
      client.query('SELECT notes FROM crm_accounts WHERE id=$1', [req.params.id]),
      client.query('SELECT name, notes FROM crm_accounts WHERE id=$1', [source_id]),
    ]);
    const sourceName = sourceRow.rows[0]?.name || '';
    const sourceNotes = sourceRow.rows[0]?.notes || '';
    const targetNotes = targetRow.rows[0]?.notes || '';
    await client.query('UPDATE crm_activities SET account_id=$1 WHERE account_id=$2', [req.params.id, source_id]);
    await client.query('UPDATE crm_account_contacts SET account_id=$1 WHERE account_id=$2', [req.params.id, source_id]);
    await client.query(
      `INSERT INTO crm_account_products (account_id, product_line_id)
       SELECT $1, product_line_id FROM crm_account_products WHERE account_id=$2 ON CONFLICT DO NOTHING`,
      [req.params.id, source_id]
    );
    if (sourceNotes) {
      const merged = targetNotes ? `${targetNotes}\n\n[Merged from ${sourceName}]\n${sourceNotes}` : sourceNotes;
      await client.query('UPDATE crm_accounts SET notes=$1 WHERE id=$2', [merged, req.params.id]);
    }
    await client.query('DELETE FROM crm_accounts WHERE id=$1', [source_id]);
    await client.query('COMMIT');
    res.json({ message: 'Merged' });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// Account product lines (replace-all)
app.put('/api/crm/accounts/:id/products', authenticateToken, checkCRMView, async (req, res) => {
  try {
    const { product_line_ids } = req.body;
    await pool.query('DELETE FROM crm_account_products WHERE account_id=$1', [req.params.id]);
    if (product_line_ids && product_line_ids.length > 0) {
      await Promise.all(product_line_ids.map(plId =>
        pool.query('INSERT INTO crm_account_products (account_id, product_line_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, plId])
      ));
    }
    res.json({ message: 'Updated' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Dashboard stats + chart data
app.get('/api/crm/dashboard', authenticateToken, checkCRMView, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const [statsRes, actByDayRes, newAccountsRes, scheduledRes, repSummaryRes] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(DISTINCT account_id) FILTER (WHERE activity_date >= CURRENT_DATE - $1 AND NOT is_scheduled) AS accounts_visited,
           COUNT(*)                   FILTER (WHERE activity_date >= CURRENT_DATE - $1 AND NOT is_scheduled) AS total_activities
         FROM crm_activities`,
        [days]
      ),
      pool.query(
        `SELECT activity_date::text AS date, created_by_name, COUNT(*)::int AS count
         FROM crm_activities
         WHERE activity_date >= CURRENT_DATE - $1 AND NOT is_scheduled
         GROUP BY activity_date, created_by_name
         ORDER BY activity_date`,
        [days]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM crm_accounts WHERE created_at >= NOW() - ($1 * INTERVAL '1 day')`,
        [days]
      ),
      pool.query(
        `SELECT a.id, a.activity_date::text AS date, a.notes,
                acc.name AS account_name, at.name AS activity_type_name, a.created_by_name
         FROM crm_activities a
         JOIN crm_accounts acc ON acc.id = a.account_id
         LEFT JOIN crm_activity_types at ON at.id = a.activity_type_id
         WHERE a.is_scheduled AND a.activity_date >= CURRENT_DATE
         ORDER BY a.activity_date LIMIT 15`
      ),
      pool.query(
        `SELECT created_by_name,
                COUNT(*)::int FILTER (WHERE NOT is_scheduled) AS total_activities,
                COUNT(DISTINCT account_id) FILTER (WHERE NOT is_scheduled) AS accounts_visited
         FROM crm_activities
         WHERE activity_date >= CURRENT_DATE - $1
         GROUP BY created_by_name
         ORDER BY total_activities DESC`,
        [days]
      ),
    ]);

    res.json({
      stats: { ...statsRes.rows[0], new_accounts: newAccountsRes.rows[0].count },
      activity_by_day: actByDayRes.rows,
      scheduled_visits: scheduledRes.rows,
      rep_summary: repSummaryRes.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Account activities
app.get('/api/crm/accounts/:id/activities', authenticateToken, checkCRMView, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT a.*, at.name AS activity_type_name
       FROM crm_activities a
       LEFT JOIN crm_activity_types at ON at.id = a.activity_type_id
       WHERE a.account_id=$1
       ORDER BY a.activity_date DESC, a.created_at DESC`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/crm/accounts/:id/activities', authenticateToken, checkCRMView, async (req, res) => {
  try {
    const { activity_type_id, activity_date, notes, contact_name, contact_title, samples } = req.body;
    const r = await pool.query(
      `INSERT INTO crm_activities (account_id, activity_type_id, activity_date, notes, contact_name, contact_title, samples, created_by_id, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.params.id, activity_type_id || null, activity_date, notes || null, contact_name || null, contact_title || null, samples || null, req.user.id, req.user.name]
    );
    const withType = await pool.query(
      `SELECT a.*, at.name AS activity_type_name FROM crm_activities a
       LEFT JOIN crm_activity_types at ON at.id = a.activity_type_id WHERE a.id=$1`,
      [r.rows[0].id]
    );
    res.json(withType.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/crm/accounts/:id/activities/:actId', authenticateToken, checkCRMView, async (req, res) => {
  try {
    const { activity_type_id, activity_date, notes, contact_name, contact_title, samples } = req.body;
    const r = await pool.query(
      `UPDATE crm_activities SET activity_type_id=$1, activity_date=$2, notes=$3,
       contact_name=$4, contact_title=$5, samples=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [activity_type_id || null, activity_date, notes || null, contact_name || null, contact_title || null, samples || null, req.params.actId]
    );
    const withType = await pool.query(
      `SELECT a.*, at.name AS activity_type_name FROM crm_activities a
       LEFT JOIN crm_activity_types at ON at.id = a.activity_type_id WHERE a.id=$1`,
      [r.rows[0].id]
    );
    res.json(withType.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/crm/accounts/:id/activities/:actId', authenticateToken, checkCRMView, async (req, res) => {
  try {
    await pool.query('DELETE FROM crm_activities WHERE id=$1', [req.params.actId]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── Production Schedule ──────────────────────────────────────────────────────

const checkProdView = (req, res, next) => {
  if (req.user.role === 'admin') return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id WHERE p.role = $1 AND t.slug = 'production-schedule' AND p.permission_level IN ('view','upload')`,
    [req.user.role]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'No access' }))
  .catch(() => res.status(500).json({ message: 'Server error' }));
};

const checkProdManage = (req, res, next) => {
  if (req.user.role === 'admin') return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id WHERE p.role = $1 AND t.slug = 'production-schedule' AND p.permission_level = 'upload'`,
    [req.user.role]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'No manage access' }))
  .catch(() => res.status(500).json({ message: 'Server error' }));
};

// Users (for task assignment)
app.get('/api/production-schedule/users', authenticateToken, checkProdView, async (req, res) => {
  try {
    const r = await pool.query('SELECT id, name, role FROM users ORDER BY name');
    res.json(r.rows);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Tanks
app.get('/api/production-schedule/tanks', authenticateToken, checkProdView, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM prod_tanks ORDER BY sort_order, name');
    res.json(r.rows);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/production-schedule/tanks', authenticateToken, checkProdManage, async (req, res) => {
  try {
    const { name, capacity_bbl } = req.body;
    const ord = await pool.query('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM prod_tanks');
    const r = await pool.query(
      'INSERT INTO prod_tanks (name, capacity_bbl, sort_order) VALUES ($1,$2,$3) RETURNING *',
      [name, capacity_bbl || null, ord.rows[0].n]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/production-schedule/tanks/reorder', authenticateToken, checkProdManage, async (req, res) => {
  try {
    const { ids } = req.body;
    for (let i = 0; i < ids.length; i++) {
      await pool.query('UPDATE prod_tanks SET sort_order=$1 WHERE id=$2', [i, ids[i]]);
    }
    res.json({ message: 'Reordered' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/production-schedule/tanks/:id', authenticateToken, checkProdManage, async (req, res) => {
  try {
    const { name, capacity_bbl, active } = req.body;
    const r = await pool.query(
      'UPDATE prod_tanks SET name=COALESCE($1,name), capacity_bbl=COALESCE($2,capacity_bbl), active=COALESCE($3,active) WHERE id=$4 RETURNING *',
      [name, capacity_bbl, active, req.params.id]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/production-schedule/tanks/:id', authenticateToken, checkProdManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM prod_tanks WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Beers
app.get('/api/production-schedule/beers', authenticateToken, checkProdView, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT b.*, bs.name AS style_name, COALESCE(b.color, bs.color, '#6366f1') AS resolved_color
       FROM prod_beers b LEFT JOIN prod_beer_styles bs ON bs.id = b.style_id
       WHERE b.status='active'
       ORDER BY b.name`
    );
    res.json(r.rows);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/production-schedule/beers', authenticateToken, checkProdManage, async (req, res) => {
  try {
    const { name, style, status, notes, style_id, color } = req.body;
    const r = await pool.query(
      'INSERT INTO prod_beers (name, style, status, notes, style_id, color) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, style || null, status || 'active', notes || null, style_id || null, color || null]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/production-schedule/beers/:id', authenticateToken, checkProdManage, async (req, res) => {
  try {
    const { name, style, status, notes, style_id, color } = req.body;
    const r = await pool.query(
      `UPDATE prod_beers SET name=COALESCE($1,name), style=COALESCE($2,style), status=COALESCE($3,status), notes=$4, style_id=$5, color=$6 WHERE id=$7 RETURNING *`,
      [name, style, status, notes !== undefined ? notes : null, style_id || null, color || null, req.params.id]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/production-schedule/beers/:id', authenticateToken, checkProdManage, async (req, res) => {
  try {
    await pool.query("UPDATE prod_beers SET status='archived' WHERE id=$1", [req.params.id]);
    res.json({ message: 'Archived' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Grid data (assignments + tasks for a date range)
app.get('/api/production-schedule/grid', authenticateToken, checkProdView, async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ message: 'start and end required' });
    const assignments = await pool.query(
      `SELECT a.*, b.name AS beer_name,
              COALESCE(b.color, bs.color, '#6366f1') AS beer_color
       FROM prod_tank_assignments a
       JOIN prod_beers b ON b.id = a.beer_id
       LEFT JOIN prod_beer_styles bs ON bs.id = b.style_id
       WHERE a.start_date <= $2 AND (a.end_date IS NULL OR a.end_date >= $1)
       ORDER BY a.start_date`,
      [start, end]
    );
    const tasks = await pool.query(
      `SELECT t.*, b.name AS beer_name, tk.name AS tank_name FROM prod_tasks t
       LEFT JOIN prod_beers b ON b.id = t.beer_id
       LEFT JOIN prod_tanks tk ON tk.id = t.tank_id
       WHERE t.date >= $1 AND t.date <= $2
       ORDER BY t.date, t.created_at`,
      [start, end]
    );
    res.json({ assignments: assignments.rows, tasks: tasks.rows });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Assignments
app.post('/api/production-schedule/assignments', authenticateToken, checkProdManage, async (req, res) => {
  try {
    const { beer_id, tank_id, start_date, end_date, notes } = req.body;
    const r = await pool.query(
      'INSERT INTO prod_tank_assignments (beer_id, tank_id, start_date, end_date, notes, created_by_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [beer_id, tank_id, start_date, end_date || null, notes || null, req.user.id]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Shift assignment (and optionally its tasks) by N days, optionally to a new tank
app.post('/api/production-schedule/assignments/:id/shift', authenticateToken, checkProdManage, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { days, new_tank_id, move_tasks } = req.body;
    if (!days && !new_tank_id) return res.status(400).json({ message: 'days or new_tank_id required' });
    // Get current assignment
    const cur = await client.query('SELECT * FROM prod_tank_assignments WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ message: 'Not found' });
    const asgn = cur.rows[0];
    const d = parseInt(days) || 0;
    const newTankId = new_tank_id || asgn.tank_id;
    const newStart = d ? asgn.start_date + '' : asgn.start_date; // will use SQL interval
    // Update assignment
    const r = await client.query(
      `UPDATE prod_tank_assignments SET
        start_date = start_date + ($1 * INTERVAL '1 day'),
        end_date = CASE WHEN end_date IS NOT NULL THEN end_date + ($1 * INTERVAL '1 day') ELSE NULL END,
        tank_id = $2
       WHERE id = $3 RETURNING *`,
      [d, newTankId, req.params.id]
    );
    // Move associated tasks
    if (move_tasks) {
      await client.query(
        `UPDATE prod_tasks SET
          date = date + ($1 * INTERVAL '1 day'),
          tank_id = $2
         WHERE tank_id = $3
           AND date >= $4
           AND ($5::date IS NULL OR date <= $5::date)`,
        [d, newTankId, asgn.tank_id, asgn.start_date, asgn.end_date]
      );
    }
    await client.query('COMMIT');
    res.json(r.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// Apply style presets to an assignment (auto-create tasks)
app.post('/api/production-schedule/assignments/:id/apply-presets', authenticateToken, checkProdManage, async (req, res) => {
  try {
    const asgn = await pool.query('SELECT * FROM prod_tank_assignments WHERE id=$1', [req.params.id]);
    if (!asgn.rows.length) return res.status(404).json({ message: 'Not found' });
    const a = asgn.rows[0];
    const beer = await pool.query('SELECT * FROM prod_beers WHERE id=$1', [a.beer_id]);
    if (!beer.rows.length) return res.status(404).json({ message: 'Beer not found' });
    const b = beer.rows[0];
    if (!b.style_id) return res.json({ created: 0, message: 'No style assigned to beer' });
    const presets = await pool.query(
      'SELECT * FROM prod_style_task_presets WHERE style_id=$1 ORDER BY day_offset, sort_order',
      [b.style_id]
    );
    let created = 0;
    for (const p of presets.rows) {
      const taskDate = await pool.query(
        `SELECT ($1::date + $2 * INTERVAL '1 day')::date AS d`,
        [a.start_date, p.day_offset]
      );
      const d = taskDate.rows[0].d;
      await pool.query(
        'INSERT INTO prod_tasks (beer_id, tank_id, date, task_type, assigned_user_ids, created_by_id) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
        [a.beer_id, a.tank_id, d, p.task_type, [], req.user.id]
      );
      created++;
    }
    res.json({ created });
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/production-schedule/assignments/:id', authenticateToken, checkProdManage, async (req, res) => {
  try {
    const { beer_id, tank_id, start_date, end_date, notes } = req.body;
    const r = await pool.query(
      `UPDATE prod_tank_assignments SET
        beer_id=COALESCE($1,beer_id), tank_id=COALESCE($2,tank_id),
        start_date=COALESCE($3,start_date), end_date=$4, notes=COALESCE($5,notes)
       WHERE id=$6 RETURNING *`,
      [beer_id, tank_id, start_date, end_date !== undefined ? end_date : null, notes, req.params.id]
    );
    const updated = r.rows[0];
    // If end_date was explicitly set, delete tasks that now fall outside the window
    if (end_date !== undefined && end_date !== null && updated) {
      await pool.query(
        `DELETE FROM prod_tasks WHERE tank_id=$1 AND beer_id=$2 AND date > $3`,
        [updated.tank_id, updated.beer_id, end_date]
      );
    }
    res.json(updated);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/production-schedule/assignments/:id', authenticateToken, checkProdManage, async (req, res) => {
  try {
    const asgn = await pool.query('SELECT * FROM prod_tank_assignments WHERE id=$1', [req.params.id]);
    if (!asgn.rows.length) return res.status(404).json({ message: 'Not found' });
    const { tank_id, beer_id, start_date, end_date } = asgn.rows[0];
    // Delete all tasks for this brew/tank within the assignment window
    await pool.query(
      `DELETE FROM prod_tasks
       WHERE tank_id=$1 AND beer_id=$2 AND date >= $3
       AND ($4::date IS NULL OR date <= $4)`,
      [tank_id, beer_id, start_date, end_date || null]
    );
    await pool.query('DELETE FROM prod_tank_assignments WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Tasks — complete route BEFORE /:id
app.patch('/api/production-schedule/tasks/:id/complete', authenticateToken, checkProdView, async (req, res) => {
  try {
    const { completed } = req.body;
    let r;
    if (completed) {
      r = await pool.query(
        'UPDATE prod_tasks SET completed=true, completed_by_id=$1, completed_at=NOW() WHERE id=$2 RETURNING *',
        [req.user.id, req.params.id]
      );
    } else {
      r = await pool.query(
        'UPDATE prod_tasks SET completed=false, completed_by_id=NULL, completed_at=NULL WHERE id=$1 RETURNING *',
        [req.params.id]
      );
    }
    if (!r.rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/production-schedule/tasks', authenticateToken, checkProdManage, async (req, res) => {
  try {
    const { beer_id, tank_id, date, task_type, custom_note, assigned_user_ids } = req.body;
    const r = await pool.query(
      'INSERT INTO prod_tasks (beer_id, tank_id, date, task_type, custom_note, assigned_user_ids, created_by_id) VALUES ($1,$2,$3,$4,$5,$6::integer[],$7) RETURNING *',
      [beer_id || null, tank_id || null, date, task_type, custom_note || null, assigned_user_ids || [], req.user.id]
    );
    // Package task → auto-end the assignment on that date and trim later tasks
    if (task_type === 'package' && tank_id && date) {
      const asgn = await pool.query(
        `SELECT * FROM prod_tank_assignments WHERE tank_id=$1 AND start_date <= $2 AND (end_date IS NULL OR end_date >= $2)`,
        [tank_id, date]
      );
      if (asgn.rows.length) {
        const a = asgn.rows[0];
        await pool.query('UPDATE prod_tank_assignments SET end_date=$1 WHERE id=$2', [date, a.id]);
        // Delete any tasks for this beer/tank scheduled after the package date
        await pool.query(
          'DELETE FROM prod_tasks WHERE tank_id=$1 AND beer_id=$2 AND date > $3',
          [tank_id, a.beer_id, date]
        );
      }
    }
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/production-schedule/tasks/:id', authenticateToken, checkProdManage, async (req, res) => {
  try {
    const { task_type, custom_note, assigned_user_ids, date, tank_id } = req.body;
    const r = await pool.query(
      `UPDATE prod_tasks SET
        task_type=COALESCE($1,task_type),
        custom_note=$2,
        assigned_user_ids=COALESCE($3::integer[],assigned_user_ids),
        date=COALESCE($4::date,date),
        tank_id=COALESCE($5,tank_id)
       WHERE id=$6 RETURNING *`,
      [task_type, custom_note !== undefined ? custom_note : null, assigned_user_ids, date || null, tank_id || null, req.params.id]
    );
    const updated = r.rows[0];
    // If this is a package task, keep the assignment end_date in sync
    if (updated && updated.task_type === 'package' && updated.tank_id && updated.date) {
      const asgn = await pool.query(
        `SELECT * FROM prod_tank_assignments WHERE tank_id=$1 AND start_date <= $2 AND (end_date IS NULL OR end_date >= $2)`,
        [updated.tank_id, updated.date]
      );
      if (asgn.rows.length) {
        const a = asgn.rows[0];
        await pool.query('UPDATE prod_tank_assignments SET end_date=$1 WHERE id=$2', [updated.date, a.id]);
        await pool.query(
          'DELETE FROM prod_tasks WHERE tank_id=$1 AND beer_id=$2 AND date > $3 AND id != $4',
          [updated.tank_id, a.beer_id, updated.date, updated.id]
        );
      }
    }
    res.json(updated);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/production-schedule/tasks/:id', authenticateToken, checkProdManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM prod_tasks WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── Beer Styles ──────────────────────────────────────────────────────────────

app.get('/api/production-schedule/styles', authenticateToken, checkProdView, async (req, res) => {
  try {
    const styles = await pool.query('SELECT * FROM prod_beer_styles ORDER BY sort_order, name');
    const presets = await pool.query('SELECT * FROM prod_style_task_presets ORDER BY style_id, day_offset, sort_order');
    const result = styles.rows.map(s => ({
      ...s,
      presets: presets.rows.filter(p => p.style_id === s.id),
    }));
    res.json(result);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/production-schedule/styles', authenticateToken, checkProdManage, async (req, res) => {
  try {
    const { name, color } = req.body;
    const max = await pool.query('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM prod_beer_styles');
    const r = await pool.query(
      'INSERT INTO prod_beer_styles (name, color, sort_order) VALUES ($1,$2,$3) RETURNING *',
      [name, color || '#6366f1', max.rows[0].n]
    );
    res.json({ ...r.rows[0], presets: [] });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/production-schedule/styles/:id', authenticateToken, checkProdManage, async (req, res) => {
  try {
    const { name, color } = req.body;
    const r = await pool.query(
      'UPDATE prod_beer_styles SET name=COALESCE($1,name), color=COALESCE($2,color) WHERE id=$3 RETURNING *',
      [name, color, req.params.id]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/production-schedule/styles/:id', authenticateToken, checkProdManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM prod_beer_styles WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/production-schedule/styles/:id/presets', authenticateToken, checkProdManage, async (req, res) => {
  try {
    const { task_type, day_offset } = req.body;
    const max = await pool.query('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM prod_style_task_presets WHERE style_id=$1', [req.params.id]);
    const r = await pool.query(
      'INSERT INTO prod_style_task_presets (style_id, task_type, day_offset, sort_order) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.params.id, task_type, day_offset || 0, max.rows[0].n]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/production-schedule/styles/:id/presets/:presetId', authenticateToken, checkProdManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM prod_style_task_presets WHERE id=$1 AND style_id=$2', [req.params.presetId, req.params.id]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Task type overrides
app.get('/api/production-schedule/task-types', authenticateToken, checkProdView, async (req, res) => {
  try {
    const rows = await pool.query('SELECT * FROM prod_task_type_overrides ORDER BY key');
    res.json(rows.rows);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/production-schedule/task-types/:key', authenticateToken, checkProdManage, async (req, res) => {
  try {
    const { label, short, color, bg } = req.body;
    await pool.query(
      `INSERT INTO prod_task_type_overrides (key, label, short, color, bg)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (key) DO UPDATE SET label=$2, short=$3, color=$4, bg=$5`,
      [req.params.key, label, short, color, bg]
    );
    res.json({ ok: true });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;