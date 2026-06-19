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

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

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
       WHERE p.role = ANY($1::text[]) AND t.slug = $2 AND p.permission_level = 'upload'`,
      [req.user.roles, 'hr-documents']
    );
    if (result.rows.length === 0) return res.status(403).json({ message: 'Permission denied' });
    next();
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Middleware to check HR Documents view permission
const checkHRView = async (req, res, next) => {
  if (req.user.roles.includes('admin')) return next();
  try {
    const result = await pool.query(
      `SELECT 1 FROM permissions p
       INNER JOIN tools t ON p.tool_id = t.id
       WHERE p.role = ANY($1::text[]) AND t.slug = $2 AND p.permission_level = 'view'`,
      [req.user.roles, 'hr-documents']
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
    // Ensure roles array always exists (handles tokens issued before multi-role support)
    if (!req.user.roles) req.user.roles = [req.user.role].filter(Boolean);
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
    const rolesResult = await pool.query('SELECT role FROM user_roles WHERE user_id=$1 ORDER BY role', [user.id]);
    const roles = rolesResult.rows.map(r => r.role);
    if (!roles.length) roles.push(user.role); // fallback
    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role, roles },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ user: { id: user.id, name: user.name, role: user.role, roles } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user from cookie
app.get('/api/me', authenticateToken, (req, res) => {
  res.json({ id: req.user.id, name: req.user.name, role: req.user.role, roles: req.user.roles });
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
      `SELECT u.id, u.name, u.email, u.role, u.created_at,
              (u.password IS NULL) AS invite_pending,
              COALESCE(NULLIF(array_agg(ur.role ORDER BY ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}'), ARRAY[u.role]) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       GROUP BY u.id ORDER BY u.name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add a new user
app.post('/api/users', authenticateToken, async (req, res) => {
  const { name, email, role, roles } = req.body;
  try {
    // Check for duplicate email
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) return res.status(400).json({ message: 'An account with that email already exists.' });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days for invite

    const primaryRole = (roles && roles.length) ? roles[0] : (role || 'bartender');
    const result = await pool.query(
      `INSERT INTO users (name, email, password, role, reset_token, reset_token_expires)
       VALUES ($1, $2, NULL, $3, $4, $5) RETURNING id, name, email, role`,
      [name, email, primaryRole, token, expires]
    );
    const userId = result.rows[0].id;
    const allRoles = [...new Set([primaryRole, ...(roles || [])])].filter(Boolean);
    for (const r of allRoles) {
      await pool.query('INSERT INTO user_roles (user_id, role) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, r]);
    }

    const setupUrl = `${process.env.CLIENT_URL || 'https://ologyhq.netlify.app'}/?reset=${token}`;
    let emailError = null;
    try {
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
    } catch (mailErr) {
      console.error('Invite email failed:', mailErr.message);
      emailError = mailErr.message;
    }

    res.json({ ...result.rows[0], _emailError: emailError });
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

// Update a user
app.put('/api/users/:id', authenticateToken, async (req, res) => {
  const { role, roles, name, email } = req.body;
  try {
    // Build dynamic update — only set fields that were provided
    const fields = [];
    const values = [];
    if (name  !== undefined) { fields.push(`name = $${fields.length + 1}`);  values.push(name.trim()); }
    if (email !== undefined) {
      const dup = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2', [email.trim(), req.params.id]);
      if (dup.rows.length > 0) return res.status(400).json({ message: 'Email already in use.' });
      fields.push(`email = $${fields.length + 1}`);
      values.push(email.trim().toLowerCase());
    }

    // Determine primary role from roles array or explicit role field
    const newRoles = roles && roles.length ? roles : (role ? [role] : null);
    const primaryRole = newRoles ? newRoles[0] : undefined;
    if (primaryRole !== undefined) {
      fields.push(`role = $${fields.length + 1}`);
      values.push(primaryRole);
    }

    if (fields.length === 0 && !newRoles) return res.status(400).json({ message: 'Nothing to update.' });
    let result;
    if (fields.length > 0) {
      values.push(req.params.id);
      result = await pool.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING id, name, email, role`,
        values
      );
    } else {
      result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [req.params.id]);
    }

    // Replace user_roles entries
    if (newRoles) {
      await pool.query('DELETE FROM user_roles WHERE user_id = $1', [req.params.id]);
      const allRoles = [...new Set(newRoles)].filter(Boolean);
      for (const r of allRoles) {
        await pool.query('INSERT INTO user_roles (user_id, role) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, r]);
      }
    }

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
          WHERE p.tool_id = t.id AND p.role = ANY($1::text[]) AND p.permission_level = 'upload'
        )) AS has_upload_permission
       FROM tools t
       WHERE 'admin' = ANY($1::text[])
          OR t.visible_to_all = true
          OR EXISTS (
            SELECT 1 FROM permissions p
            WHERE p.tool_id = t.id AND p.role = ANY($1::text[]) AND p.permission_level = 'view'
          )
       ORDER BY t.name`,
      [req.user.roles]
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
    const isPrivileged = req.user.roles.includes('admin') || await (async () => {
      const r = await pool.query(
        `SELECT 1 FROM permissions p INNER JOIN tools t ON p.tool_id = t.id
         WHERE p.role = ANY($1::text[]) AND t.slug = 'hr-documents' AND p.permission_level = 'upload'`,
        [req.user.roles]
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
         LEFT JOIN hr_document_roles dr ON dr.document_id = d.id
         WHERE EXISTS (
           SELECT 1 FROM hr_document_roles dr2
           WHERE dr2.document_id = d.id AND dr2.role = ANY($1::text[])
         )
         GROUP BY d.id ORDER BY d.sort_order ASC NULLS LAST, d.uploaded_at DESC`,
        [req.user.roles]
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

// Generate signed upload URLs so the browser can upload files directly to Supabase
app.post('/api/production/upload-tokens', authenticateToken, async (req, res) => {
  try {
    const files = Array.isArray(req.body.files) ? req.body.files : [];
    const tokens = await Promise.all(files.map(async ({ ext }) => {
      const cleanExt = (ext || 'jpg').replace(/^\./, '').toLowerCase();
      const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${cleanExt}`;
      const { data, error } = await supabase.storage
        .from('production-photos')
        .createSignedUploadUrl(filename, { expiresIn: 300 });
      if (error) throw error;
      return { filename, signedUrl: data.signedUrl };
    }));
    res.json(tokens);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not create upload URLs' });
  }
});

// Serve a production photo inline — must come before /:id route
app.get('/api/production/photo/:filename', authenticateToken, async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const { data, error } = await supabase.storage.from('production-photos').download(filename);
    if (error || !data) return res.status(404).json({ message: 'Not found' });
    const buffer = Buffer.from(await data.arrayBuffer());
    const ext = path.extname(filename).toLowerCase();
    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf', '.heic': 'image/heic', '.heif': 'image/heif' };
    res.setHeader('Content-Type', mimeMap[ext] || data.type || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  } catch (err) {
    console.error(err);
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

// KL keg inventory — must be before /:id
app.get('/api/production/kl-inventory', authenticateToken, async (req, res) => {
  try {
    // Most recent spot count becomes the baseline; fall back to kl_keg_settings if none recorded yet
    const spotResult = await pool.query('SELECT * FROM kl_spot_counts ORDER BY created_at DESC LIMIT 1');
    const lastSpot = spotResult.rows[0] || null;

    let baseHalves, baseSixths, baseCutoff;
    if (lastSpot) {
      baseHalves  = lastSpot.halves;
      baseSixths  = lastSpot.sixths;
      baseCutoff  = new Date(lastSpot.created_at);
    } else {
      const settings = await pool.query('SELECT * FROM kl_keg_settings WHERE id = 1');
      const s = settings.rows[0] || { starting_halves: 0, starting_sixths: 0 };
      baseHalves = s.starting_halves;
      baseSixths = s.starting_sixths;
      baseCutoff = null;
    }

    // All KL transactions (for the full log)
    const txns = await pool.query(`
      SELECT id, submission_date, submission_type, kl_halves, kl_sixths,
             submitted_by_name, distributor, other_distributor, shipper, created_at
      FROM production_submissions
      WHERE (submission_type = 'keg_logistics' AND (kl_halves > 0 OR kl_sixths > 0))
         OR (submission_type = 'distro' AND (kl_halves > 0 OR kl_sixths > 0))
      ORDER BY created_at DESC
    `);

    // All spot counts (for the full log)
    const spots = await pool.query('SELECT * FROM kl_spot_counts ORDER BY created_at DESC');

    // Running total: base + transactions since last spot count
    let halves = baseHalves;
    let sixths = baseSixths;
    const sinceBase = baseCutoff
      ? txns.rows.filter(t => new Date(t.created_at) > baseCutoff)
      : txns.rows;
    for (const t of [...sinceBase].reverse()) {
      if (t.submission_type === 'keg_logistics') { halves += t.kl_halves; sixths += t.kl_sixths; }
      else { halves -= t.kl_halves; sixths -= t.kl_sixths; }
    }

    // Merge transactions + spot counts into one chronological log
    const log = [
      ...txns.rows.map(t => ({ entry_type: 'transaction', ...t })),
      ...spots.rows.map(s => ({ entry_type: 'spot_count', ...s })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({ last_spot: lastSpot, current_halves: halves, current_sixths: sixths, log });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// Record a spot count — resets the running total baseline
app.post('/api/production/kl-inventory/spot-count', authenticateToken, async (req, res) => {
  const { halves, sixths } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO kl_spot_counts (halves, sixths, counted_by_name) VALUES ($1,$2,$3) RETURNING *',
      [parseInt(halves) || 0, parseInt(sixths) || 0, req.user.name]
    );
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
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

// Create a submission — files are pre-uploaded by browser; this endpoint only writes DB rows
app.post('/api/production', authenticateToken, async (req, res) => {
  const {
    submitted_by_name, submission_date, submission_type,
    distributor, other_distributor, shipper,
    ology_halves, ology_sixths, kl_halves, kl_sixths,
    packing_slip_unavailable,
    packing_slips,   // [{filename, original_name, mimetype}]
    photo_sets,      // [{type, product_date, photos: [{filename, original_name, mimetype}]}]
  } = req.body;

  try {
    const subResult = await pool.query(
      `INSERT INTO production_submissions
         (submitted_by_id, submitted_by_name, submission_date, submission_type,
          distributor, other_distributor, shipper, ology_halves, ology_sixths,
          kl_halves, kl_sixths, packing_slip_unavailable)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.user.id, submitted_by_name, submission_date, submission_type,
       distributor || null, other_distributor || null, shipper || null,
       parseInt(ology_halves) || 0, parseInt(ology_sixths) || 0,
       parseInt(kl_halves) || 0, parseInt(kl_sixths) || 0,
       !!packing_slip_unavailable]
    );
    const sub = subResult.rows[0];

    // Packing slips
    if (Array.isArray(packing_slips)) {
      await Promise.all(packing_slips.map(({ filename, original_name, mimetype }) =>
        pool.query(
          'INSERT INTO production_photos (submission_id, is_packing_slip, filename, original_name, mimetype) VALUES ($1,true,$2,$3,$4)',
          [sub.id, filename, original_name, mimetype]
        )
      ));
    }

    // Photo sets
    if (Array.isArray(photo_sets)) {
      for (let i = 0; i < photo_sets.length; i++) {
        const { type, product_date, photos } = photo_sets[i];
        if (!photos?.length && !type) continue;
        const setResult = await pool.query(
          'INSERT INTO production_photo_sets (submission_id, sort_order, photo_type, product_date) VALUES ($1,$2,$3,$4) RETURNING *',
          [sub.id, i, type || null, product_date || null]
        );
        const setId = setResult.rows[0].id;
        if (Array.isArray(photos)) {
          await Promise.all(photos.map(({ filename, original_name, mimetype }) =>
            pool.query(
              'INSERT INTO production_photos (submission_id, photo_set_id, is_packing_slip, filename, original_name, mimetype) VALUES ($1,$2,false,$3,$4,$5)',
              [sub.id, setId, filename, original_name, mimetype]
            )
          ));
        }
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
  if (!req.user.roles.includes('admin')) return res.status(403).json({ message: 'Forbidden' });
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
     WHERE p.role = ANY($1::text[]) AND t.slug = 'sops' AND p.permission_level = 'upload'`,
    [req.user.roles]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

// List SOPs (role-filtered for viewers, all for uploaders)
app.get('/api/sop-documents', authenticateToken, async (req, res) => {
  try {
    const isPrivileged = req.user.roles.includes('admin') || await pool.query(
      `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
       WHERE p.role = ANY($1::text[]) AND t.slug = 'sops' AND p.permission_level = 'upload'`,
      [req.user.roles]
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
      result = result.filter(d => d.roles.some(r => req.user.roles.includes(r)));
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
    const { name, roles } = req.body || {};
    const parsedRoles = Array.isArray(roles) ? roles : JSON.parse(roles || '[]');
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

// ── Equipment Manuals ──────────────────────────────────────────────────────────

function checkEquipmentView(req, res, next) {
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = ANY($1::text[]) AND t.slug = 'equipment-manuals' AND p.permission_level IN ('view','upload')`,
    [req.user.roles]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

function checkEquipmentManage(req, res, next) {
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = ANY($1::text[]) AND t.slug = 'equipment-manuals' AND p.permission_level = 'upload'`,
    [req.user.roles]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

// List manuals — privileged users see all; others see only docs matching their role
app.get('/api/equipment-manuals', authenticateToken, checkEquipmentView, async (req, res) => {
  try {
    const isPrivileged = req.user.roles.includes('admin') || await pool.query(
      `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
       WHERE p.role = ANY($1::text[]) AND t.slug = 'equipment-manuals' AND p.permission_level = 'upload'`,
      [req.user.roles]
    ).then(r => r.rows.length > 0);

    const result = isPrivileged
      ? await pool.query(
          `SELECT d.*, COALESCE(array_agg(r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles
           FROM equipment_manuals d
           LEFT JOIN equipment_manual_roles r ON r.document_id = d.id
           GROUP BY d.id ORDER BY d.category, d.sort_order, d.uploaded_at`)
      : await pool.query(
          `SELECT d.*, COALESCE(array_agg(r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles
           FROM equipment_manuals d
           LEFT JOIN equipment_manual_roles r ON r.document_id = d.id
           WHERE EXISTS (
             SELECT 1 FROM equipment_manual_roles r2
             WHERE r2.document_id = d.id AND r2.role = ANY($1::text[])
           )
           GROUP BY d.id ORDER BY d.category, d.sort_order, d.uploaded_at`,
          [req.user.roles]);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// Get signed upload URL
app.post('/api/equipment-manuals/presign', authenticateToken, checkEquipmentManage, async (req, res) => {
  try {
    const ext = (req.body.ext || 'pdf').replace(/^\./, '').toLowerCase();
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
    const { data, error } = await supabase.storage.from('equipment-manuals').createSignedUploadUrl(filename);
    if (error) throw error;
    res.json({ filename, signedUrl: data.signedUrl });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// Commit after direct upload — saves doc record + role visibility
app.post('/api/equipment-manuals/commit', authenticateToken, checkEquipmentManage, async (req, res) => {
  const { name, category, filename, original_name, mimetype, size, roles } = req.body;
  try {
    const maxSort = await pool.query(`SELECT COALESCE(MAX(sort_order),0) AS m FROM equipment_manuals WHERE category=$1`, [category]);
    const result = await pool.query(
      `INSERT INTO equipment_manuals (name, category, filename, original_name, mimetype, size, uploaded_by_id, uploaded_by_name, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, category, filename, original_name, mimetype, parseInt(size) || 0,
       req.user.id, req.user.name, maxSort.rows[0].m + 1]
    );
    const doc = result.rows[0];
    if (Array.isArray(roles)) {
      for (const role of roles)
        await pool.query('INSERT INTO equipment_manual_roles (document_id, role) VALUES ($1,$2) ON CONFLICT DO NOTHING', [doc.id, role]);
    }
    res.json({ ...doc, roles: roles || [] });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// Reorder — must be before /:id
app.patch('/api/equipment-manuals/reorder', authenticateToken, checkEquipmentManage, async (req, res) => {
  const { orderedIds } = req.body;
  try {
    for (let i = 0; i < orderedIds.length; i++)
      await pool.query('UPDATE equipment_manuals SET sort_order=$1 WHERE id=$2', [i, orderedIds[i]]);
    res.json({ message: 'Reordered' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// Update name / category / roles
app.patch('/api/equipment-manuals/:id', authenticateToken, checkEquipmentManage, async (req, res) => {
  const { name, category, roles } = req.body;
  try {
    const result = await pool.query(
      'UPDATE equipment_manuals SET name=$1, category=$2 WHERE id=$3 RETURNING *',
      [name, category, req.params.id]
    );
    await pool.query('DELETE FROM equipment_manual_roles WHERE document_id=$1', [req.params.id]);
    if (Array.isArray(roles)) {
      for (const role of roles)
        await pool.query('INSERT INTO equipment_manual_roles (document_id, role) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, role]);
    }
    res.json({ ...result.rows[0], roles: roles || [] });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// View inline (signed URL redirect)
app.get('/api/equipment-manuals/:id/view', authenticateToken, checkEquipmentView, async (req, res) => {
  try {
    const doc = await pool.query('SELECT * FROM equipment_manuals WHERE id=$1', [req.params.id]);
    if (!doc.rows.length) return res.status(404).json({ message: 'Not found' });
    const url = await getSignedUrl('equipment-manuals', doc.rows[0].filename);
    res.redirect(url);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// Download
app.get('/api/equipment-manuals/:id/download', authenticateToken, checkEquipmentView, async (req, res) => {
  try {
    const doc = await pool.query('SELECT * FROM equipment_manuals WHERE id=$1', [req.params.id]);
    if (!doc.rows.length) return res.status(404).json({ message: 'Not found' });
    const url = await getSignedUrl('equipment-manuals', doc.rows[0].filename);
    res.redirect(url);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// Delete
app.delete('/api/equipment-manuals/:id', authenticateToken, checkEquipmentManage, async (req, res) => {
  try {
    const doc = await pool.query('SELECT filename FROM equipment_manuals WHERE id=$1', [req.params.id]);
    if (!doc.rows.length) return res.status(404).json({ message: 'Not found' });
    await supabase.storage.from('equipment-manuals').remove([doc.rows[0].filename]);
    await pool.query('DELETE FROM equipment_manuals WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// ── Checklists ─────────────────────────────────────────────────────────────────

function checkChecklistView(req, res, next) {
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = ANY($1::text[]) AND t.slug = 'checklists' AND p.permission_level IN ('view','upload')`,
    [req.user.roles]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

function checkChecklistManage(req, res, next) {
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = ANY($1::text[]) AND t.slug = 'checklists' AND p.permission_level = 'upload'`,
    [req.user.roles]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

async function autoArchiveChecklists() {
  try {
    const clRows = await pool.query('SELECT id, name, frequency FROM checklists');
    for (const cl of clRows.rows) {
      const now = new Date();
      let cutoff;
      if (cl.frequency === 'weekly') {
        const day = now.getDay();
        const diff = day === 0 ? -6 : 1 - day; // days back to Monday
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
      } else if (cl.frequency === 'monthly') {
        cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
      } else {
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      }
      const cutoffStr = cutoff.toISOString().split('T')[0];

      const stale = await pool.query(
        `SELECT DISTINCT run_date FROM checklist_daily_state WHERE checklist_id=$1 AND run_date < $2::date ORDER BY run_date`,
        [cl.id, cutoffStr]
      );
      if (!stale.rows.length) continue;

      const periodMap = new Map();
      for (const row of stale.rows) {
        const rd = new Date(row.run_date + 'T12:00:00');
        let key;
        if (cl.frequency === 'weekly') {
          const d2 = rd.getDay();
          const diff2 = d2 === 0 ? -6 : 1 - d2;
          const mon = new Date(rd.getFullYear(), rd.getMonth(), rd.getDate() + diff2);
          key = mon.toISOString().split('T')[0];
        } else if (cl.frequency === 'monthly') {
          key = `${rd.getFullYear()}-${String(rd.getMonth()+1).padStart(2,'0')}-01`;
        } else {
          key = row.run_date;
        }
        if (!periodMap.has(key)) periodMap.set(key, []);
        periodMap.get(key).push(row.run_date);
      }

      for (const [periodKey, dates] of periodMap.entries()) {
        const exists = await pool.query(
          'SELECT 1 FROM checklist_runs WHERE checklist_id=$1 AND run_date=$2 AND auto_saved=true',
          [cl.id, periodKey]
        );
        if (!exists.rows.length) {
          const state = await pool.query(
            `SELECT DISTINCT item_id FROM checklist_daily_state WHERE checklist_id=$1 AND run_date = ANY($2::date[])`,
            [cl.id, dates]
          );
          const items = await pool.query('SELECT COUNT(*)::int AS cnt FROM checklist_items WHERE checklist_id=$1', [cl.id]);
          await pool.query(
            `INSERT INTO checklist_runs (checklist_id, checklist_name, run_by_name, notes, items_completed, items_total, run_date, auto_saved)
             VALUES ($1,$2,'Auto-saved','',  $3,$4,$5,true)`,
            [cl.id, cl.name, state.rows.length, items.rows[0].cnt, periodKey]
          );
        }
        await pool.query(
          'DELETE FROM checklist_daily_state WHERE checklist_id=$1 AND run_date = ANY($2::date[])',
          [cl.id, dates]
        );
      }
    }
  } catch (err) { console.error('autoArchiveChecklists error:', err); }
}

app.get('/api/checklists', authenticateToken, checkChecklistView, async (req, res) => {
  try {
    autoArchiveChecklists(); // background, no await
    const isPrivileged = req.user.roles.includes('admin') || await pool.query(
      `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
       WHERE p.role = ANY($1::text[]) AND t.slug = 'checklists' AND p.permission_level = 'upload'`,
      [req.user.roles]
    ).then(r => r.rows.length > 0);

    const cls   = await pool.query('SELECT * FROM checklists ORDER BY sort_order ASC, created_at ASC');
    const roles = await pool.query('SELECT * FROM checklist_roles');
    const items = await pool.query('SELECT * FROM checklist_items ORDER BY sort_order ASC');
    const todayCounts = await pool.query(
      `SELECT checklist_id, COUNT(*)::int AS count FROM checklist_daily_state WHERE run_date = CURRENT_DATE GROUP BY checklist_id`
    );

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
    const todayCountMap = {};
    todayCounts.rows.forEach(r => { todayCountMap[r.checklist_id] = r.count; });

    let result = cls.rows.map(c => ({
      ...c,
      roles: roleMap[c.id] || [],
      items: itemMap[c.id] || [],
      today_checked_count: todayCountMap[c.id] || 0,
    }));
    if (!isPrivileged) result = result.filter(c => c.roles.some(r => req.user.roles.includes(r)));
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// Location roles — must be before /:id patterns
app.get('/api/checklists/location-roles', authenticateToken, checkChecklistView, async (req, res) => {
  try {
    const r = await pool.query('SELECT location, role FROM checklist_location_roles ORDER BY location, role');
    const map = {};
    for (const row of r.rows) {
      if (!map[row.location]) map[row.location] = [];
      map[row.location].push(row.role);
    }
    res.json(map);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

app.put('/api/checklists/location-roles/:location', authenticateToken, checkChecklistManage, async (req, res) => {
  try {
    const { location } = req.params;
    const valid = ['midtown', 'northside', 'power_mill', 'tampa'];
    if (!valid.includes(location)) return res.status(400).json({ message: 'Invalid location.' });
    const { roles } = req.body;
    await pool.query('DELETE FROM checklist_location_roles WHERE location=$1', [location]);
    if (Array.isArray(roles) && roles.length > 0) {
      const vals = roles.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
      const params = roles.flatMap(r => [location, r]);
      await pool.query(`INSERT INTO checklist_location_roles (location, role) VALUES ${vals}`, params);
    }
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// Run history — must be before /:id patterns
app.get('/api/checklists/runs', authenticateToken, checkChecklistView, async (req, res) => {
  try {
    const runs = await pool.query(
      `SELECT r.*, c.frequency FROM checklist_runs r
       LEFT JOIN checklists c ON c.id = r.checklist_id
       ORDER BY r.run_date DESC NULLS LAST, r.created_at DESC LIMIT 200`
    );
    res.json(runs.rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// Notification config — must be before /:id patterns
app.get('/api/checklists/notification-config', authenticateToken, checkChecklistManage, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT send_hour FROM checklist_notification_config WHERE id = 1');
    res.json(rows[0] || { send_hour: 22 });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.put('/api/checklists/notification-config', authenticateToken, checkChecklistManage, async (req, res) => {
  try {
    const { send_hour } = req.body;
    if (typeof send_hour !== 'number' || send_hour < 0 || send_hour > 23)
      return res.status(400).json({ message: 'Invalid hour' });
    await pool.query(
      `INSERT INTO checklist_notification_config (id, send_hour) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET send_hour = $1`,
      [send_hour]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.get('/api/checklists/notification-subscriptions', authenticateToken, checkChecklistManage, async (req, res) => {
  try {
    const forUserId = req.query.forUserId && req.user.roles.includes('admin')
      ? parseInt(req.query.forUserId) : req.user.id;
    const { rows } = await pool.query(
      'SELECT checklist_id, threshold FROM checklist_notification_subscriptions WHERE user_id = $1',
      [forUserId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.put('/api/checklists/notification-subscriptions', authenticateToken, checkChecklistManage, async (req, res) => {
  try {
    const forUserId = req.query.forUserId && req.user.roles.includes('admin')
      ? parseInt(req.query.forUserId) : req.user.id;
    const { subscriptions } = req.body;
    await pool.query('DELETE FROM checklist_notification_subscriptions WHERE user_id = $1', [forUserId]);
    for (const sub of (subscriptions || [])) {
      await pool.query(
        'INSERT INTO checklist_notification_subscriptions (user_id, checklist_id, threshold) VALUES ($1, $2, $3)',
        [forUserId, sub.checklist_id, sub.threshold]
      );
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// Admin: all users with subscription counts
app.get('/api/checklists/notification-users', authenticateToken, async (req, res) => {
  if (!req.user.roles.includes('admin')) return res.status(403).json({ message: 'Forbidden' });
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.name, u.email,
        COUNT(s.checklist_id)::int AS subscription_count
      FROM users u
      LEFT JOIN checklist_notification_subscriptions s ON s.user_id = u.id
      WHERE u.id IN (
        SELECT ur.user_id FROM user_roles ur
        WHERE ur.role = 'admin'
           OR EXISTS (
             SELECT 1 FROM permissions p
             JOIN tools t ON t.id = p.tool_id
             WHERE p.role = ur.role
               AND t.slug = 'checklists'
               AND p.permission_level = 'upload'
           )
      )
      GROUP BY u.id, u.name, u.email
      ORDER BY u.name
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// Day overrides — must be before /:id patterns
app.get('/api/checklists/day-overrides', authenticateToken, checkChecklistView, async (req, res) => {
  try {
    const { start, end } = req.query;
    const { rows } = await pool.query(`
      SELECT o.*, c.name AS checklist_name,
        (oc.override_id IS NOT NULL) AS checked
      FROM checklist_day_overrides o
      JOIN checklists c ON c.id = o.checklist_id
      LEFT JOIN checklist_day_override_checks oc ON oc.override_id = o.id
      WHERE o.override_date BETWEEN $1 AND $2
      ORDER BY o.override_date, o.checklist_id, o.sort_order
    `, [start, end]);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/checklists/day-overrides', authenticateToken, checkChecklistManage, async (req, res) => {
  try {
    const { checklist_id, override_date, type, text } = req.body;
    if (!checklist_id || !override_date || !type || !text?.trim())
      return res.status(400).json({ message: 'Missing required fields' });
    const { rows: [{ m }] } = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) AS m FROM checklist_day_overrides WHERE checklist_id=$1 AND override_date=$2',
      [checklist_id, override_date]
    );
    const { rows: [row] } = await pool.query(
      `INSERT INTO checklist_day_overrides (checklist_id, override_date, type, text, sort_order, created_by_id, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [checklist_id, override_date, type, text.trim(), m + 1, req.user.id, req.user.name]
    );
    res.json(row);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/checklists/day-overrides/:oid', authenticateToken, checkChecklistManage, async (req, res) => {
  try {
    const { text, type } = req.body;
    const { rows: [row] } = await pool.query(
      `UPDATE checklist_day_overrides
       SET text = COALESCE($1, text), type = COALESCE($2, type)
       WHERE id = $3 RETURNING *`,
      [text?.trim() || null, type || null, req.params.oid]
    );
    if (!row) return res.status(404).json({ message: 'Not found' });
    res.json(row);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/checklists/day-overrides/:oid', authenticateToken, checkChecklistManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM checklist_day_overrides WHERE id=$1', [req.params.oid]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/checklists/day-overrides/:oid/check', authenticateToken, checkChecklistView, async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO checklist_day_override_checks (override_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [req.params.oid]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/checklists/day-overrides/:oid/check', authenticateToken, checkChecklistView, async (req, res) => {
  try {
    await pool.query('DELETE FROM checklist_day_override_checks WHERE override_id=$1', [req.params.oid]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/checklists', authenticateToken, checkChecklistManage, async (req, res) => {
  try {
    const { name, category, description, roles, items, frequency, location, display_name, notify_hour } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Name required' });
    const maxSort = await pool.query('SELECT COALESCE(MAX(sort_order),0) AS m FROM checklists');
    const cl = await pool.query(
      `INSERT INTO checklists (name, display_name, category, description, frequency, location, notify_hour, sort_order, created_by_id, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [name.trim(), display_name?.trim() || null, category || 'other', description || '', frequency || 'daily', location || 'all', notify_hour ?? null, maxSort.rows[0].m + 1, req.user.id, req.user.name]
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
    const { name, category, description, roles, items, frequency, location, display_name, notify_hour } = req.body;
    const id = parseInt(req.params.id);
    await pool.query(
      'UPDATE checklists SET name=$1, display_name=$2, category=$3, description=$4, frequency=$5, location=$6, notify_hour=$7, updated_at=NOW() WHERE id=$8',
      [name.trim(), display_name?.trim() || null, category || 'other', description || '', frequency || 'daily', location || 'all', notify_hour ?? null, id]
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

// Day overrides for a specific checklist + date (RunModal)
app.get('/api/checklists/:id/overrides/:date', authenticateToken, checkChecklistView, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT o.*, (oc.override_id IS NOT NULL) AS checked
      FROM checklist_day_overrides o
      LEFT JOIN checklist_day_override_checks oc ON oc.override_id = o.id
      WHERE o.checklist_id = $1 AND o.override_date = $2
      ORDER BY o.type DESC, o.sort_order
    `, [req.params.id, req.params.date]);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// Daily state — must be before /:id
app.get('/api/checklists/:id/today', authenticateToken, checkChecklistView, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT item_id FROM checklist_daily_state WHERE checklist_id=$1 AND run_date=CURRENT_DATE',
      [req.params.id]
    );
    const checked = {};
    r.rows.forEach(row => { checked[row.item_id] = true; });
    res.json(checked);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/checklists/:id/items/:itemId/check', authenticateToken, checkChecklistView, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO checklist_daily_state (checklist_id, run_date, item_id, checked_by_name)
       VALUES ($1, CURRENT_DATE, $2, $3) ON CONFLICT DO NOTHING`,
      [req.params.id, req.params.itemId, req.user.name]
    );
    res.json({ ok: true });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/checklists/:id/items/:itemId/check', authenticateToken, checkChecklistView, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM checklist_daily_state WHERE checklist_id=$1 AND run_date=CURRENT_DATE AND item_id=$2',
      [req.params.id, req.params.itemId]
    );
    res.json({ ok: true });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/checklists/:id/add-item', authenticateToken, checkChecklistManage, async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ message: 'Text required' });
  try {
    const maxSort = await pool.query('SELECT COALESCE(MAX(sort_order),0) AS m FROM checklist_items WHERE checklist_id=$1', [req.params.id]);
    await pool.query('INSERT INTO checklist_items (checklist_id, text, sort_order) VALUES ($1,$2,$3)',
      [req.params.id, text.trim(), maxSort.rows[0].m + 1]);
    res.json({ message: 'Added' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/checklists/:id', authenticateToken, checkChecklistManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM checklists WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// ── Packaging Log ─────────────────────────────────────────────────────────────

const PACKAGING_SHEET_ID = '1t_jz1Jr0x9hEmsekmGifotuS4lroqS1bARzTZ7hudQs';
const PACKAGING_TAB      = 'Schedule / Distro';

// Get a short-lived Google OAuth access token using the service account JWT flow.
// Uses jsonwebtoken (already a dependency) — no googleapis package needed.
async function getGoogleAccessToken() {
  const privateKey  = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  if (!privateKey || !clientEmail) throw new Error('Google service account credentials not configured');

  const now = Math.floor(Date.now() / 1000);
  const jwtToken = jwt.sign(
    { iss: clientEmail, scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now },
    privateKey,
    { algorithm: 'RS256' }
  );

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwtToken,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

// Google Sheets serial date (days since Dec 30 1899) → 'YYYY-MM-DD'
function sheetSerialToYMD(serial) {
  if (typeof serial !== 'number') return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  return d.toISOString().split('T')[0];
}

// Write packaging numbers (and actual date) back to the sheet row
async function writePackagingRow(rowIndex, actualDate, halfBbl, sixthBbl, cases) {
  if (!rowIndex) return { skipped: true };
  const token = await getGoogleAccessToken();
  const [y, m, d] = actualDate.split('-');
  const dateStr = `${parseInt(m)}/${parseInt(d)}/${y}`;
  const range = encodeURIComponent(`'${PACKAGING_TAB}'!Z${rowIndex}:AC${rowIndex}`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${PACKAGING_SHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [[dateStr, halfBbl || 0, sixthBbl || 0, cases || 0]] }),
    }
  );
  const body = await res.json();
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

// Clear packaging numbers from the sheet row (on delete)
async function clearPackagingRow(rowIndex) {
  if (!rowIndex) return;
  const token = await getGoogleAccessToken();
  const range = encodeURIComponent(`'${PACKAGING_TAB}'!Z${rowIndex}:AC${rowIndex}`);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${PACKAGING_SHEET_ID}/values/${range}:clear`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
  );
  const body = await res.json();
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${JSON.stringify(body)}`);
}

const checkPackagingView = (req, res, next) =>
  pool.query(`SELECT 1 FROM permissions p JOIN tools t ON t.id=p.tool_id WHERE p.role=ANY($1::text[]) AND t.slug='packaging-log' AND p.permission_level IN ('view','upload')`, [req.user.roles])
    .then(r => (r.rows.length || req.user.roles.includes('admin')) ? next() : res.status(403).json({ message: 'Forbidden' }))
    .catch(() => res.status(500).json({ message: 'Server error' }));

const checkPackagingManage = (req, res, next) =>
  pool.query(`SELECT 1 FROM permissions p JOIN tools t ON t.id=p.tool_id WHERE p.role=ANY($1::text[]) AND t.slug='packaging-log' AND p.permission_level='upload'`, [req.user.roles])
    .then(r => (r.rows.length || req.user.roles.includes('admin')) ? next() : res.status(403).json({ message: 'Forbidden' }))
    .catch(() => res.status(500).json({ message: 'Server error' }));

// Read upcoming beers from the sheet — must be before /:id
app.get('/api/packaging-log/sheet-beers', authenticateToken, checkPackagingView, async (req, res) => {
  try {
    const token = await getGoogleAccessToken();
    const range = encodeURIComponent(`'${PACKAGING_TAB}'!A:AC`);
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${PACKAGING_SHEET_ID}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const json = await response.json();
    const rows = json.values || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

    const result = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const plannedDateYMD = sheetSerialToYMD(row[3]); // col D
      if (!plannedDateYMD) continue;

      const plannedDate = new Date(plannedDateYMD + 'T12:00:00');
      if (Math.abs(plannedDate - today) > TEN_DAYS_MS) continue;

      // Skip rows that already have packaging numbers written
      if (row[26] || row[27] || row[28]) continue; // AA, AB, AC

      const beerName = row[9]; // col J
      if (!beerName) continue;

      result.push({
        rowIndex:    i + 1,                         // 1-based sheet row
        beerName:    String(beerName).trim(),
        plannedDate: plannedDateYMD,
        tankSize:    row[6] != null ? String(row[6]) : null, // col G (yield in bbl)
      });
    }
    res.json(result);
  } catch (err) {
    console.error('sheet-beers error:', err);
    res.status(500).json({ message: 'Could not read packaging schedule from sheet' });
  }
});

app.get('/api/packaging-log', authenticateToken, checkPackagingView, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM packaging_logs ORDER BY package_date DESC, created_at DESC LIMIT 500`
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/packaging-log', authenticateToken, checkPackagingManage, async (req, res) => {
  try {
    const { beer_name, package_date, half_bbl, sixth_bbl, cases, notes, sheet_row_index } = req.body;
    if (!beer_name?.trim()) return res.status(400).json({ message: 'Beer is required' });
    if (!package_date)      return res.status(400).json({ message: 'Date is required' });

    const r = await pool.query(
      `INSERT INTO packaging_logs
         (beer_name, package_date, half_bbl, sixth_bbl, cases, notes,
          sheet_row_index, submitted_by_id, submitted_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [beer_name.trim(), package_date,
       half_bbl || 0, sixth_bbl || 0, cases || 0,
       notes || null, sheet_row_index || null,
       req.user.id, req.user.name]
    );

    let sheetError = null;
    try {
      await writePackagingRow(sheet_row_index, package_date, half_bbl || 0, sixth_bbl || 0, cases || 0);
    } catch (e) {
      sheetError = e.message;
      console.error('Sheet write error (post):', e.message);
    }

    const row = r.rows[0];
    if (sheetError) row._sheetError = sheetError;
    res.json(row);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/packaging-log/:id', authenticateToken, checkPackagingManage, async (req, res) => {
  try {
    const { beer_name, package_date, half_bbl, sixth_bbl, cases, notes } = req.body;

    const existing = await pool.query('SELECT sheet_row_index FROM packaging_logs WHERE id=$1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ message: 'Not found' });
    const { sheet_row_index } = existing.rows[0];

    const r = await pool.query(
      `UPDATE packaging_logs SET
         beer_name=$1, package_date=$2, half_bbl=$3, sixth_bbl=$4, cases=$5, notes=$6
       WHERE id=$7 RETURNING *`,
      [beer_name.trim(), package_date,
       half_bbl || 0, sixth_bbl || 0, cases || 0,
       notes || null, req.params.id]
    );

    let sheetError = null;
    try {
      await writePackagingRow(sheet_row_index, package_date, half_bbl || 0, sixth_bbl || 0, cases || 0);
    } catch (e) {
      sheetError = e.message;
      console.error('Sheet write error (patch):', e.message);
    }

    const row = r.rows[0];
    if (sheetError) row._sheetError = sheetError;
    res.json(row);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/packaging-log/:id', authenticateToken, checkPackagingManage, async (req, res) => {
  try {
    const existing = await pool.query('SELECT sheet_row_index FROM packaging_logs WHERE id=$1', [req.params.id]);
    const rowIndex = existing.rows[0]?.sheet_row_index;

    await pool.query('DELETE FROM packaging_logs WHERE id=$1', [req.params.id]);

    let sheetError = null;
    try {
      await clearPackagingRow(rowIndex);
    } catch (e) {
      sheetError = e.message;
      console.error('Sheet clear error (delete):', e.message);
    }

    res.json({ ok: true, _sheetError: sheetError || undefined });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// ── Production Weekly ─────────────────────────────────────────────────────────

const WEEKLY_SHEET_ID = '1Pk-ij63R4X5-X-7OVBgq8PKAsZ6DB51SzlHanPRplqk';
const WEEKLY_SCHED_TAB = 'Brew/Production Schedule';
const WEEKLY_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

function checkProdWeeklyView(req, res, next) {
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = ANY($1::text[]) AND t.slug = 'production-weekly' AND p.permission_level IN ('view','upload')`,
    [req.user.roles]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

function checkProdWeeklyManage(req, res, next) {
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = ANY($1::text[]) AND t.slug = 'production-weekly' AND p.permission_level = 'upload'`,
    [req.user.roles]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

async function parseWeeklySheet(weekOffset = 0) {
  const token = await getGoogleAccessToken();

  // Fetch entire sheet with serial date numbers for col B date matching
  const range = encodeURIComponent(`'${WEEKLY_SCHED_TAB}'!A1:BH`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${WEEKLY_SHEET_ID}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`Sheets API error: ${resp.status}`);
  const data = await resp.json();
  const rows = data.values || [];

  if (rows.length < 2) return { weekStart: null, sections: [], people: [] };

  // Row 0 = header: tank names at cols D:U (indices 3–20)
  const headerRow = rows[0] || [];
  const tankHeaders = {};
  for (let ci = 3; ci <= 20; ci++) {
    tankHeaders[ci] = headerRow[ci] ? String(headerRow[ci]).trim() : '';
  }

  // Compute target week Mon–Fri as Excel serials (epoch = Dec 30, 1899 UTC)
  const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = new Date(todayUTC).getUTCDay(); // 0=Sun
  const mondayUTC = todayUTC + (dow === 0 ? -6 : 1 - dow) * 86400000 + weekOffset * 7 * 86400000;
  const weekSerials = [];
  for (let i = 0; i < 5; i++) {
    weekSerials.push(Math.round((mondayUTC + i * 86400000 - EXCEL_EPOCH) / 86400000));
  }
  const weekStart = sheetSerialToYMD(weekSerials[0]);

  // Map serial → data row (col B = index 1 holds date serial)
  const dayRowBySerial = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const serial = row[1];
    if (typeof serial === 'number') {
      const s = Math.floor(serial);
      if (weekSerials.includes(s)) dayRowBySerial[s] = row;
    }
  }

  const brewDayTasks    = {};
  const packDayTasks    = {};
  const timeoffDayTasks = {};
  WEEKLY_DAYS.forEach(d => { brewDayTasks[d] = []; packDayTasks[d] = []; timeoffDayTasks[d] = []; });

  // initials → { day → [taskText] } for person grouping
  const personMap = {};

  weekSerials.forEach((serial, dayIdx) => {
    const day = WEEKLY_DAYS[dayIdx];
    const row = dayRowBySerial[serial];
    if (!row) return;

    // Brews & Packaging: scan cols D:U (indices 3–20)
    for (let ci = 3; ci <= 20; ci++) {
      const cell = row[ci];
      if (!cell) continue;
      const text = String(cell).trim();
      const tankName = tankHeaders[ci];

      if (/brew\s*$/i.test(text)) {
        const m = text.match(/^(.*?)\s*(?:-\s*)?brew\s*$/i);
        const beerName = m ? m[1].trim() : text;
        if (beerName) brewDayTasks[day].push(tankName ? `[${tankName}] ${beerName}` : beerName);
      } else if (/pack\s*$/i.test(text)) {
        const m = text.match(/^(.*?)\s*(?:-\s*)?pack\s*$/i);
        const beerName = m ? m[1].trim() : text;
        if (beerName) packDayTasks[day].push(tankName ? `[${tankName}] ${beerName}` : beerName);
      }
    }

    // Time Off: col AC (index 28)
    const timeoff = row[28];
    if (timeoff && String(timeoff).trim()) timeoffDayTasks[day].push(String(timeoff).trim());

    // Individual tasks: cols AZ:BH (indices 51–59)
    for (let ci = 51; ci <= 59; ci++) {
      const cell = row[ci];
      if (!cell) continue;
      const text = String(cell).trim();
      if (!text) continue;
      // Extract initials from "(R, C)" at end
      const im = text.match(/\(([^)]+)\)\s*$/);
      if (!im) continue;
      im[1].split(',').map(s => s.trim()).filter(Boolean).forEach(initial => {
        if (!personMap[initial]) personMap[initial] = {};
        if (!personMap[initial][day]) personMap[initial][day] = [];
        personMap[initial][day].push(text);
      });
    }
  });

  const sections = [
    { key: 'brews',     label: 'Brews',     dayTasks: brewDayTasks    },
    { key: 'packaging', label: 'Packaging', dayTasks: packDayTasks    },
    { key: 'timeoff',   label: 'Time Off',  dayTasks: timeoffDayTasks },
  ];

  const people = Object.entries(personMap).map(([initial, byDay]) => {
    const dayTasks = {};
    WEEKLY_DAYS.forEach(d => { dayTasks[d] = byDay[d] || []; });
    return { name: initial, dayTasks };
  });

  return { weekStart, sections, people };
}

// GET /api/prod-weekly/sheet
app.get('/api/prod-weekly/sheet', authenticateToken, checkProdWeeklyView, async (req, res) => {
  try {
    const weekOffset = parseInt(req.query.weekOffset) || 0;
    const sheetData = await parseWeeklySheet(weekOffset);

    // Load initials mapping
    const initialsRows = await pool.query('SELECT * FROM prod_weekly_initials ORDER BY sort_order ASC, id ASC');
    const initialsMap = {};
    const initialsOrder = {};
    for (const r of initialsRows.rows) {
      initialsMap[r.initials] = r.display_name;
      initialsOrder[r.initials] = r.sort_order;
    }

    // Sort people by initials sort_order (stable across weeks), then resolve display names
    sheetData.people = sheetData.people
      .sort((a, b) => (initialsOrder[a.name] ?? 9999) - (initialsOrder[b.name] ?? 9999))
      .map(p => ({ ...p, name: initialsMap[p.name] || p.name }));

    // Load checks for this week
    const weekStart = sheetData.weekStart;
    let checks = [];
    if (weekStart) {
      const cr = await pool.query('SELECT * FROM prod_weekly_checks WHERE week_start=$1', [weekStart]);
      checks = cr.rows;
    }

    res.json({ ...sheetData, initialsMap, checks });
  } catch (err) {
    console.error('prod-weekly sheet error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/prod-weekly/checks — get checks for a week
app.get('/api/prod-weekly/checks', authenticateToken, checkProdWeeklyView, async (req, res) => {
  try {
    const { week_start } = req.query;
    if (!week_start) return res.status(400).json({ message: 'week_start required' });
    const r = await pool.query('SELECT * FROM prod_weekly_checks WHERE week_start=$1', [week_start]);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// POST /api/prod-weekly/checks — check a task
app.post('/api/prod-weekly/checks', authenticateToken, checkProdWeeklyView, async (req, res) => {
  try {
    const { week_start, row_type, row_key, day, task_text } = req.body;
    if (!week_start || !row_type || !row_key || !task_text) return res.status(400).json({ message: 'Missing fields' });
    const r = await pool.query(
      `INSERT INTO prod_weekly_checks (week_start, row_type, row_key, day, task_text, checked_by_id, checked_by_name, checked_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (week_start, row_type, row_key, day, task_text) DO UPDATE
         SET checked_by_id=$6, checked_by_name=$7, checked_at=NOW()
       RETURNING *`,
      [week_start, row_type, row_key, day || null, task_text, req.user.id, req.user.name]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/prod-weekly/checks — uncheck a task
app.delete('/api/prod-weekly/checks', authenticateToken, checkProdWeeklyView, async (req, res) => {
  try {
    const { week_start, row_type, row_key, day, task_text } = req.body;
    await pool.query(
      `DELETE FROM prod_weekly_checks WHERE week_start=$1 AND row_type=$2 AND row_key=$3 AND (day=$4 OR (day IS NULL AND $4 IS NULL)) AND task_text=$5`,
      [week_start, row_type, row_key, day || null, task_text]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// GET /api/prod-weekly/initials
app.get('/api/prod-weekly/initials', authenticateToken, checkProdWeeklyView, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM prod_weekly_initials ORDER BY sort_order ASC, id ASC');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// POST /api/prod-weekly/initials
app.post('/api/prod-weekly/initials', authenticateToken, checkProdWeeklyManage, async (req, res) => {
  try {
    const { initials, display_name, user_id, email } = req.body;
    const maxSort = await pool.query('SELECT COALESCE(MAX(sort_order),0) AS m FROM prod_weekly_initials');
    const r = await pool.query(
      `INSERT INTO prod_weekly_initials (initials, display_name, user_id, sort_order, email) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [initials.trim().toUpperCase(), display_name.trim(), user_id || null, maxSort.rows[0].m + 1, email || null]
    );
    res.json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Initials already exist' });
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/prod-weekly/initials/reorder
app.patch('/api/prod-weekly/initials/reorder', authenticateToken, checkProdWeeklyManage, async (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) return res.status(400).json({ message: 'orderedIds required' });
    for (let i = 0; i < orderedIds.length; i++) {
      await pool.query('UPDATE prod_weekly_initials SET sort_order=$1 WHERE id=$2', [i + 1, orderedIds[i]]);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// PATCH /api/prod-weekly/initials/:id
app.patch('/api/prod-weekly/initials/:id', authenticateToken, checkProdWeeklyManage, async (req, res) => {
  try {
    const { initials, display_name, user_id, email } = req.body;
    const r = await pool.query(
      `UPDATE prod_weekly_initials SET initials=$1, display_name=$2, user_id=$3, email=$4 WHERE id=$5 RETURNING *`,
      [initials.trim().toUpperCase(), display_name.trim(), user_id || null, email || null, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Initials already exist' });
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/prod-weekly/initials/:id
app.delete('/api/prod-weekly/initials/:id', authenticateToken, checkProdWeeklyManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM prod_weekly_initials WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// ── Prod Weekly: notification recipients ──────────────────────────────────────

app.get('/api/prod-weekly/notification-recipients', authenticateToken, checkProdWeeklyView, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM prod_weekly_notification_recipients ORDER BY sort_order ASC, id ASC');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/prod-weekly/notification-recipients', authenticateToken, checkProdWeeklyManage, async (req, res) => {
  try {
    const { name, email, active } = req.body;
    if (!name || !email) return res.status(400).json({ message: 'name and email required' });
    const maxSort = await pool.query('SELECT COALESCE(MAX(sort_order),0) AS m FROM prod_weekly_notification_recipients');
    const r = await pool.query(
      `INSERT INTO prod_weekly_notification_recipients (name, email, active, sort_order) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name.trim(), email.trim(), active !== false, maxSort.rows[0].m + 1]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/prod-weekly/notification-recipients/reorder', authenticateToken, checkProdWeeklyManage, async (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) return res.status(400).json({ message: 'orderedIds required' });
    for (let i = 0; i < orderedIds.length; i++) {
      await pool.query('UPDATE prod_weekly_notification_recipients SET sort_order=$1 WHERE id=$2', [i + 1, orderedIds[i]]);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/prod-weekly/notification-recipients/:id', authenticateToken, checkProdWeeklyManage, async (req, res) => {
  try {
    const { name, email, active } = req.body;
    const r = await pool.query(
      `UPDATE prod_weekly_notification_recipients SET name=$1, email=$2, active=$3 WHERE id=$4 RETURNING *`,
      [name.trim(), email.trim(), active, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/prod-weekly/notification-recipients/:id', authenticateToken, checkProdWeeklyManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM prod_weekly_notification_recipients WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/prod-weekly/send-test-reminder', authenticateToken, checkProdWeeklyManage, async (req, res) => {
  try {
    const { sendDailyProdWeeklyReminder } = require('./prodWeeklyEmail');
    const result = await sendDailyProdWeeklyReminder();
    res.json(result);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/prod-weekly/auto-complete', authenticateToken, checkProdWeeklyManage, async (req, res) => {
  try {
    const { autoCompleteOldTasks } = require('./prodWeeklyEmail');
    const count = await autoCompleteOldTasks();
    res.json({ count, message: `Auto-completed ${count} past task${count !== 1 ? 's' : ''}.` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Label Inventory ───────────────────────────────────────────────────────────
const mailer = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const checkLabelManage = async (req, res, next) => {
  if (req.user.roles.includes('admin')) return next();
  try {
    const r = await pool.query(
      `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
       WHERE p.role = ANY($1::text[]) AND t.slug = 'label-inventory' AND p.permission_level = 'upload'`,
      [req.user.roles]
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
const { sendLabelOrderEmail, sendLabelReminder } = require('./labelEmail');

// Send order email (manual — accepts optional quantity overrides)
app.post('/api/label-inventory/send-order-email', authenticateToken, checkLabelManage, async (req, res) => {
  try {
    await sendLabelOrderEmail(req.body.overrides || {});
    await pool.query(
      `INSERT INTO label_order_settings (id, last_order_sent_at)
       VALUES (1, NOW()) ON CONFLICT (id) DO UPDATE SET last_order_sent_at = NOW()`
    );
    res.json({ message: 'Email sent.' });
  } catch (err) { console.error(err); res.status(500).json({ message: `Failed to send email: ${err.message}` }); }
});

// ── Label reminder check — local dev only (production uses Netlify Scheduled Function) ──
if (require.main === module) {
  const cron = require('node-cron');
  // Daily at 8:00 AM ET — send reminder if no order email in 7+ days
  cron.schedule('0 8 * * *', async () => {
    console.log('[cron] Checking label order reminder');
    try {
      const r = await pool.query('SELECT last_order_sent_at, last_reminder_sent_at FROM label_order_settings WHERE id=1');
      const { last_order_sent_at, last_reminder_sent_at } = r.rows[0] || {};
      if (!last_order_sent_at) return;
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const overdue = new Date(last_order_sent_at) < sevenDaysAgo;
      const notYetReminded = !last_reminder_sent_at || new Date(last_reminder_sent_at) < new Date(last_order_sent_at);
      const remindAgain = last_reminder_sent_at && new Date(last_reminder_sent_at) < threeDaysAgo;
      if (overdue && (notYetReminded || remindAgain)) {
        await sendLabelReminder();
        await pool.query('UPDATE label_order_settings SET last_reminder_sent_at=NOW() WHERE id=1');
        console.log('[cron] Label reminder sent');
      }
    } catch (err) { console.error('[cron] Label reminder check failed:', err.message); }
  }, { timezone: 'America/New_York' });
}

// ── Distro / Taproom Orders (Google Sheet) ────────────────────────────────────
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1Teo4JcdQRY8mmnUZOcS3NTZIIhhwWj6YoqFom6tqp6E/gviz/tq?tqx=out:csv&sheet=Invoice%20Log';
const BOL_EXCLUDED_SERVER = ['northside', 'midtown', 'power mill', 'tampa', 'tri-eagle', 'johnson', 'progressive'];

const checkBOLView = (req, res, next) => {
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = ANY($1::text[]) AND t.slug = 'distro-taproom-orders'
       AND p.permission_level IN ('view','upload')`,
    [req.user.roles]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
};

const checkBOLManage = (req, res, next) => {
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = ANY($1::text[]) AND t.slug = 'distro-taproom-orders'
       AND p.permission_level = 'upload'`,
    [req.user.roles]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
};

const bolUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

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
    const [response, bolResult] = await Promise.all([
      fetch(SHEET_CSV_URL),
      pool.query('SELECT invoice_number, is_amended, uploaded_by_name, uploaded_at FROM bol_attachments'),
    ]);
    const csv = await response.text();
    const lines = csv.split('\n').filter(l => l.trim());
    const bolMap = {};
    bolResult.rows.forEach(b => { bolMap[b.invoice_number] = b; });
    const orders = lines.slice(1).map(line => {
      const cols = parseCSVLine(line);
      const inv = cols[1] || '';
      return {
        invoice_number: inv,
        date:           cols[2] || '',
        recipient:      cols[3] || '',
        pdf_url:        cols[8] || '',
        status:         cols[10] || '',
        bol:            bolMap[inv] || null,
      };
    }).filter(o => o.date && o.recipient);
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
});

// Activity badge — lightweight, used by Dashboard to show notification dot
app.get('/api/distro-orders/activity-badge', authenticateToken, async (req, res) => {
  try {
    const [bolRes, sheetRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM bol_attachments WHERE uploaded_at > NOW() - INTERVAL '7 days'`),
      fetch(SHEET_CSV_URL),
    ]);
    const recentBols = parseInt(bolRes.rows[0].count, 10);

    const csv = await sheetRes.text();
    const lines = csv.split('\n').filter(l => l.trim());
    const today = new Date(); today.setHours(0,0,0,0);
    const todayStr = `${today.getMonth()+1}/${today.getDate()}/${today.getFullYear()}`;
    const bolInvoices = new Set((await pool.query('SELECT invoice_number FROM bol_attachments')).rows.map(r => r.invoice_number));
    let ordersMissingBol = 0;
    lines.slice(1).forEach(line => {
      const cols = parseCSVLine(line);
      const date = cols[2] || '';
      const inv  = cols[1] || '';
      const recipient = (cols[3] || '').toLowerCase();
      const excluded = BOL_EXCLUDED_SERVER.some(e => recipient.includes(e));
      if (!excluded && date === todayStr && inv && !bolInvoices.has(inv)) ordersMissingBol++;
    });
    res.json({ recentBols, ordersMissingBol });
  } catch { res.json({ recentBols: 0, ordersMissingBol: 0 }); }
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

// ── BOL Attachments ───────────────────────────────────────────────────────────

// Presign upload URL — client uploads directly to Supabase
app.post('/api/bol/presign', authenticateToken, checkBOLManage, async (req, res) => {
  try {
    const { invoice_number } = req.body;
    if (!invoice_number) return res.status(400).json({ message: 'invoice_number required' });
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
    const { data, error } = await supabase.storage.from('bol-documents').createSignedUploadUrl(uniqueName);
    if (error) return res.status(500).json({ message: error.message });
    res.json({ signedUrl: data.signedUrl, path: data.path });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Commit BOL record after direct upload — insert or replace (sets is_amended on replace)
app.post('/api/bol/commit', authenticateToken, checkBOLManage, async (req, res) => {
  try {
    const { invoice_number, filename } = req.body;
    if (!invoice_number || !filename) return res.status(400).json({ message: 'invoice_number and filename required' });
    const existing = await pool.query('SELECT filename FROM bol_attachments WHERE invoice_number=$1', [invoice_number]);
    if (existing.rows.length) {
      await supabase.storage.from('bol-documents').remove([existing.rows[0].filename]);
      const r = await pool.query(
        `UPDATE bol_attachments SET filename=$1, is_amended=TRUE, uploaded_by_id=$2, uploaded_by_name=$3, uploaded_at=NOW()
         WHERE invoice_number=$4 RETURNING *`,
        [filename, req.user.id, req.user.name, invoice_number]
      );
      return res.json(r.rows[0]);
    }
    const r = await pool.query(
      `INSERT INTO bol_attachments (invoice_number, filename, is_amended, uploaded_by_id, uploaded_by_name)
       VALUES ($1,$2,FALSE,$3,$4) RETURNING *`,
      [invoice_number, filename, req.user.id, req.user.name]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Serve BOL file — signed URL redirect
app.get('/api/bol/:invoiceNumber/file', authenticateToken, checkBOLView, async (req, res) => {
  try {
    const r = await pool.query('SELECT filename FROM bol_attachments WHERE invoice_number=$1', [req.params.invoiceNumber]);
    if (!r.rows.length) return res.status(404).json({ message: 'Not found' });
    const { data, error } = await supabase.storage.from('bol-documents').createSignedUrl(r.rows[0].filename, 3600);
    if (error) return res.status(500).json({ message: 'Could not generate URL' });
    res.redirect(data.signedUrl);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Stream BOL bytes directly — used by client print workflow (blob URL → window.print())
app.get('/api/bol/:invoiceNumber/stream', authenticateToken, checkBOLView, async (req, res) => {
  try {
    const r = await pool.query('SELECT filename FROM bol_attachments WHERE invoice_number=$1', [req.params.invoiceNumber]);
    if (!r.rows.length) return res.status(404).json({ message: 'Not found' });
    const { data, error } = await supabase.storage.from('bol-documents').download(r.rows[0].filename);
    if (error || !data) return res.status(404).json({ message: 'File not found' });
    const buf = Buffer.from(await data.arrayBuffer());
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', 'inline');
    res.send(buf);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Delete BOL
app.delete('/api/bol/:invoiceNumber', authenticateToken, checkBOLManage, async (req, res) => {
  try {
    const r = await pool.query('SELECT filename FROM bol_attachments WHERE invoice_number=$1', [req.params.invoiceNumber]);
    if (!r.rows.length) return res.status(404).json({ message: 'Not found' });
    await supabase.storage.from('bol-documents').remove([r.rows[0].filename]);
    await pool.query('DELETE FROM bol_attachments WHERE invoice_number=$1', [req.params.invoiceNumber]);
    res.json({ ok: true });
  } catch { res.status(500).json({ message: 'Server error' }); }
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
  if (!req.user.roles.includes('admin')) return res.status(403).json({ message: 'Admin only' });
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
  if (!req.user.roles.includes('admin')) return res.status(403).json({ message: 'Admin only' });
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
  if (!req.user.roles.includes('admin')) return res.status(403).json({ message: 'Admin only' });
  try {
    await pool.query('DELETE FROM taproom_beers WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT toggle a beer's presence at a location
app.put('/api/taproom-beer-locations', authenticateToken, async (req, res) => {
  if (!req.user.roles.includes('admin')) return res.status(403).json({ message: 'Admin only' });
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
  if (!req.user.roles.includes('admin')) return res.status(403).json({ message: 'Admin only' });
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
  if (!req.user.roles.includes('admin')) return res.status(403).json({ message: 'Admin only' });
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
      `SELECT c.beer_id, SUM(c.four_pack) AS four_pack, SUM(c.sixth_bbl) AS sixth_bbl, SUM(c.half_bbl) AS half_bbl
       FROM taproom_inventory_counts c WHERE c.session_id = $1
       GROUP BY c.beer_id`,
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
      `SELECT c.beer_id, b.name, SUM(c.four_pack) AS four_pack, SUM(c.sixth_bbl) AS sixth_bbl, SUM(c.half_bbl) AS half_bbl
       FROM taproom_inventory_counts c
       JOIN taproom_beers b ON b.id = c.beer_id
       WHERE c.session_id = $1
       GROUP BY c.beer_id, b.name
       ORDER BY b.name`,
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
          `INSERT INTO taproom_inventory_counts (session_id, beer_id, storage_area, four_pack, sixth_bbl, half_bbl)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [sessionId, c.beer_id, c.storage_area || null, c.four_pack || 0, c.sixth_bbl || 0, c.half_bbl || 0]
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
  if (!req.user.roles.includes('admin')) return res.status(403).json({ message: 'Admin only' });
  try {
    await pool.query('DELETE FROM taproom_inventory_sessions WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Taproom Deliveries ─────────────────────────────────────────────────────

const { DELIVERY_LOCATIONS, parseTaproomDeliveryPDF, saveTaproomDelivery, syncDeliveriesFromSheet } = require('./taproomDeliverySync');

// Multer storage for delivery PDF uploads (memory only — don't save to disk)
const deliveryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });


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
  if (!req.user.roles.includes('admin')) return res.status(403).json({ message: 'Admin only' });
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
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = ANY($1::text[]) AND t.slug = 'recipes' AND p.permission_level = 'upload'`,
    [req.user.roles]
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
    const recipes = await Promise.all(result.rows.map(async (r) => {
      let photo_url = null;
      if (r.image_filename) {
        const { data } = await supabase.storage.from('recipe-photos').createSignedUrl(r.image_filename, 3600);
        photo_url = data?.signedUrl || null;
      }
      return {
        ...r,
        photo_url,
        linked_recipes: (r.linked_recipe_ids || []).map(id => ({ id, name: linkedMap[id] || '' })),
      };
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
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = ANY($1::text[]) AND t.slug = 'cocktail-keeper' AND p.permission_level IN ('view','upload')`,
    [req.user.roles]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

function checkCocktailsManage(req, res, next) {
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = ANY($1::text[]) AND t.slug = 'cocktail-keeper' AND p.permission_level = 'upload'`,
    [req.user.roles]
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
    const manageCheck = req.user.roles.includes('admin') ? { rows: [1] } : await pool.query(
      `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
       WHERE p.role = ANY($1::text[]) AND t.slug = 'cocktail-keeper' AND p.permission_level = 'upload'`,
      [req.user.roles]
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
       WHERE p.role = ANY($1::text[]) AND t.slug = 'cocktail-keeper' AND p.permission_level = 'upload'`,
      [req.user.roles]
    );
    const isManager = req.user.roles.includes('admin') || canManage.rows.length > 0;
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

// ── Coffee Keeper ───────────────────────────────────────────────────────────

function checkCoffeeView(req, res, next) {
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = ANY($1::text[]) AND t.slug = 'coffee-keeper' AND p.permission_level IN ('view','upload')`,
    [req.user.roles]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

function checkCoffeeManage(req, res, next) {
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = ANY($1::text[]) AND t.slug = 'coffee-keeper' AND p.permission_level = 'upload'`,
    [req.user.roles]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

const coffeePhotoUpload = multer({ storage: memoryStorage, limits: { fileSize: 25 * 1024 * 1024 } });

// List catalog values
app.get('/api/coffee/catalog', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM coffee_catalog ORDER BY category, sort_order');
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
app.get('/api/coffee/tag-definitions', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM coffee_tag_definitions ORDER BY sort_order');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Coffee settings (singleton row) — before /:id
app.get('/api/coffee/settings', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM coffee_settings WHERE id = 1');
    res.json(r.rows[0] || { show_creator: true });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/coffee/settings', authenticateToken, checkCoffeeManage, async (req, res) => {
  try {
    const { show_creator } = req.body;
    await pool.query(
      `INSERT INTO coffee_settings (id, show_creator) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET show_creator = $1`,
      [show_creator]
    );
    res.json({ show_creator });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Ingredient list + merge — before /:id
app.get('/api/coffee/ingredients', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT ingredient_name AS name, COUNT(*)::int AS count FROM coffee_beverage_ingredients GROUP BY ingredient_name ORDER BY ingredient_name`
    );
    res.json(r.rows);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/coffee/ingredients/merge', authenticateToken, async (req, res) => {
  try {
    const { from, to } = req.body;
    if (!to || !Array.isArray(from) || from.length === 0) return res.status(400).json({ message: 'Invalid' });
    await pool.query(`UPDATE coffee_beverage_ingredients SET ingredient_name=$1 WHERE ingredient_name = ANY($2::text[])`, [to, from]);
    res.json({ message: 'Merged' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Reorder beverages — before /:id
app.patch('/api/coffee/reorder', authenticateToken, checkCoffeeManage, async (req, res) => {
  try {
    const { ids } = req.body;
    for (let i = 0; i < ids.length; i++) {
      await pool.query('UPDATE coffee_beverages SET sort_order=$1 WHERE id=$2', [i + 1, ids[i]]);
    }
    res.json({ message: 'Reordered' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// List submissions (manage only) — before /:id
app.get('/api/coffee/submissions', authenticateToken, checkCoffeeManage, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, b.name AS beverage_name_ref
       FROM coffee_submissions s
       LEFT JOIN coffee_beverages b ON b.id = s.beverage_id
       ORDER BY s.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit a suggestion (view access)
app.post('/api/coffee/submissions', authenticateToken, checkCoffeeView, async (req, res) => {
  try {
    const { type, beverage_id, beverage_name, description } = req.body;
    const result = await pool.query(
      `INSERT INTO coffee_submissions (type, beverage_id, submitted_by_id, submitted_by_name, beverage_name, description)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [type || 'new', beverage_id || null, req.user.id, req.user.name, beverage_name || null, description || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark submission as reviewed (manage only)
app.patch('/api/coffee/submissions/:id', authenticateToken, checkCoffeeManage, async (req, res) => {
  try {
    const { status } = req.body;
    const result = await pool.query(
      `UPDATE coffee_submissions SET status=$1 WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete submission (manage only)
app.delete('/api/coffee/submissions/:id', authenticateToken, checkCoffeeManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM coffee_submissions WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// List all batched items — before /batched/:id
app.get('/api/coffee/batched', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM coffee_batched_items ORDER BY sort_order ASC, created_at ASC');
    const allIds = [...new Set(result.rows.flatMap(r => r.linked_beverage_ids || []))];
    let bevMap = {};
    if (allIds.length > 0) {
      const linked = await pool.query('SELECT id, name FROM coffee_beverages WHERE id = ANY($1)', [allIds]);
      linked.rows.forEach(r => { bevMap[r.id] = r.name; });
    }
    res.json(result.rows.map(b => ({
      ...b,
      linked_beverages: (b.linked_beverage_ids || []).map(id => ({ id, name: bevMap[id] || '' })),
    })));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Reorder batched items — before /batched/:id
app.patch('/api/coffee/batched/reorder', authenticateToken, checkCoffeeManage, async (req, res) => {
  try {
    const { ids } = req.body;
    for (let i = 0; i < ids.length; i++) {
      await pool.query('UPDATE coffee_batched_items SET sort_order=$1 WHERE id=$2', [i + 1, ids[i]]);
    }
    res.json({ message: 'Reordered' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create batched item
app.post('/api/coffee/batched', authenticateToken, checkCoffeeManage, async (req, res) => {
  try {
    const { name, recipe_notes, yield_amount, yield_unit, linked_beverage_ids } = req.body;
    const maxOrder = await pool.query('SELECT COALESCE(MAX(sort_order),0) AS m FROM coffee_batched_items');
    const ids = JSON.parse(linked_beverage_ids || '[]');
    const result = await pool.query(
      `INSERT INTO coffee_batched_items (name, recipe_notes, yield_amount, yield_unit, linked_beverage_ids, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, recipe_notes||null, yield_amount||null, yield_unit||null, ids, maxOrder.rows[0].m + 1]
    );
    const item = result.rows[0];
    for (const bid of ids) {
      await pool.query(
        `UPDATE coffee_beverages SET linked_batched_item_ids = array_append(linked_batched_item_ids, $1)
         WHERE id=$2 AND NOT ($1 = ANY(linked_batched_item_ids))`,
        [item.id, bid]
      );
    }
    res.json(item);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update batched item
app.patch('/api/coffee/batched/:id', authenticateToken, checkCoffeeManage, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, recipe_notes, yield_amount, yield_unit, linked_beverage_ids } = req.body;
    const existing = await pool.query('SELECT * FROM coffee_batched_items WHERE id=$1', [id]);
    if (!existing.rows.length) return res.status(404).json({ message: 'Not found' });

    const oldIds = existing.rows[0].linked_beverage_ids || [];
    const newIds = JSON.parse(linked_beverage_ids || '[]');

    const result = await pool.query(
      `UPDATE coffee_batched_items SET name=$1, recipe_notes=$2, yield_amount=$3, yield_unit=$4, linked_beverage_ids=$5
       WHERE id=$6 RETURNING *`,
      [name, recipe_notes||null, yield_amount||null, yield_unit||null, newIds, id]
    );

    const removed = oldIds.filter(c => !newIds.includes(c));
    const added = newIds.filter(c => !oldIds.includes(c));
    for (const bid of removed) {
      await pool.query(
        `UPDATE coffee_beverages SET linked_batched_item_ids = array_remove(linked_batched_item_ids, $1) WHERE id=$2`,
        [parseInt(id), bid]
      );
    }
    for (const bid of added) {
      await pool.query(
        `UPDATE coffee_beverages SET linked_batched_item_ids = array_append(linked_batched_item_ids, $1)
         WHERE id=$2 AND NOT ($1 = ANY(linked_batched_item_ids))`,
        [parseInt(id), bid]
      );
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete batched item
app.delete('/api/coffee/batched/:id', authenticateToken, checkCoffeeManage, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM coffee_batched_items WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ message: 'Not found' });
    for (const bid of (r.rows[0].linked_beverage_ids || [])) {
      await pool.query(
        `UPDATE coffee_beverages SET linked_batched_item_ids = array_remove(linked_batched_item_ids, $1) WHERE id=$2`,
        [parseInt(req.params.id), bid]
      );
    }
    await pool.query('DELETE FROM coffee_batched_items WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// List all beverages
app.get('/api/coffee', authenticateToken, async (req, res) => {
  try {
    const beverages = await pool.query('SELECT * FROM coffee_beverages ORDER BY sort_order ASC, created_at ASC');
    const ingredients = await pool.query('SELECT * FROM coffee_beverage_ingredients ORDER BY beverage_id, sort_order');
    const tags = await pool.query('SELECT * FROM coffee_tags ORDER BY beverage_id');

    const ingMap = {};
    for (const i of ingredients.rows) {
      if (!ingMap[i.beverage_id]) ingMap[i.beverage_id] = [];
      ingMap[i.beverage_id].push(i);
    }
    const tagMap = {};
    for (const t of tags.rows) {
      if (!tagMap[t.beverage_id]) tagMap[t.beverage_id] = [];
      tagMap[t.beverage_id].push({ name: t.tag_name, color: t.tag_color });
    }

    const batched = await pool.query('SELECT id, name FROM coffee_batched_items ORDER BY sort_order');
    const batchedMap = {};
    for (const b of batched.rows) batchedMap[b.id] = b.name;

    res.json(beverages.rows.map(c => ({
      ...c,
      ingredients: ingMap[c.id] || [],
      tags: tagMap[c.id] || [],
      linked_batched_items: (c.linked_batched_item_ids || []).map(id => ({ id, name: batchedMap[id] || '' })),
    })));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get beverage photo — must be before /:id
app.get('/api/coffee/:id/photo', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT photo_filename FROM coffee_beverages WHERE id=$1', [req.params.id]);
    if (!r.rows.length || !r.rows[0].photo_filename) return res.status(404).json({ message: 'No photo' });
    const { data, error } = await supabase.storage.from('coffee-photos').download(r.rows[0].photo_filename);
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

// Create beverage
app.post('/api/coffee', authenticateToken, checkCoffeeView, coffeePhotoUpload.single('photo'), async (req, res) => {
  try {
    const manageCheck = req.user.roles.includes('admin') ? { rows: [1] } : await pool.query(
      `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
       WHERE p.role = ANY($1::text[]) AND t.slug = 'coffee-keeper' AND p.permission_level = 'upload'`,
      [req.user.roles]
    );
    const canManage = manageCheck.rows.length > 0;

    const { name, method, glass, garnish, status, price, last_special_on, notes, suggested_by_name, linked_batched_item_ids, ingredients, tags } = req.body;
    const maxOrder = await pool.query('SELECT COALESCE(MAX(sort_order),0) AS m FROM coffee_beverages');
    let photo_filename = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname) || '.jpg';
      photo_filename = `coffee_${Date.now()}${ext}`;
      await uploadToSupabase('coffee-photos', photo_filename, req.file.buffer, req.file.mimetype);
    }
    const batchIds = JSON.parse(linked_batched_item_ids || '[]');
    const effectiveStatus = canManage ? (status || 'menu') : 'wip';
    const suggestedByName = canManage ? (suggested_by_name || null) : req.user.name;
    const suggestedById   = canManage ? null : req.user.id;
    const result = await pool.query(
      `INSERT INTO coffee_beverages (name, method, glass, garnish, status, price, last_special_on, notes, photo_filename, linked_batched_item_ids, sort_order, suggested_by_name, suggested_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [name, method||null, glass||null, garnish||null, effectiveStatus, canManage ? (price||null) : null, canManage ? (last_special_on||null) : null, notes||null, photo_filename, batchIds, maxOrder.rows[0].m + 1, suggestedByName, suggestedById]
    );
    const beverage = result.rows[0];
    const ingList = JSON.parse(ingredients || '[]');
    for (let i = 0; i < ingList.length; i++) {
      const ing = ingList[i];
      await pool.query(
        'INSERT INTO coffee_beverage_ingredients (beverage_id, ingredient_name, amount, unit, sort_order) VALUES ($1,$2,$3,$4,$5)',
        [beverage.id, ing.ingredient_name, ing.amount||null, ing.unit||null, i+1]
      );
    }
    const tagList = JSON.parse(tags || '[]');
    for (const tag of tagList) {
      const td = await pool.query('SELECT color FROM coffee_tag_definitions WHERE name=$1', [tag]);
      await pool.query(
        'INSERT INTO coffee_tags (beverage_id, tag_name, tag_color) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [beverage.id, tag, td.rows[0]?.color || '#6b7280']
      );
    }
    for (const bid of batchIds) {
      await pool.query(
        `UPDATE coffee_batched_items SET linked_beverage_ids = array_append(linked_beverage_ids, $1)
         WHERE id=$2 AND NOT ($1 = ANY(linked_beverage_ids))`,
        [beverage.id, bid]
      );
    }
    res.json(beverage);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update beverage
app.patch('/api/coffee/:id', authenticateToken, checkCoffeeView, coffeePhotoUpload.single('photo'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, method, glass, garnish, status, price, last_special_on, notes, suggested_by_name, linked_batched_item_ids, ingredients, tags, remove_photo } = req.body;
    const existing = await pool.query('SELECT * FROM coffee_beverages WHERE id=$1', [id]);
    if (!existing.rows.length) return res.status(404).json({ message: 'Not found' });

    const canManage = await pool.query(
      `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
       WHERE p.role = ANY($1::text[]) AND t.slug = 'coffee-keeper' AND p.permission_level = 'upload'`,
      [req.user.roles]
    );
    const isManager = req.user.roles.includes('admin') || canManage.rows.length > 0;
    if (!isManager && existing.rows[0].suggested_by_id !== req.user.id) {
      return res.status(403).json({ message: 'You can only edit beverages you submitted.' });
    }

    let photo_filename = existing.rows[0].photo_filename;
    if (remove_photo === 'true' || remove_photo === true) {
      if (photo_filename) await supabase.storage.from('coffee-photos').remove([photo_filename]);
      photo_filename = null;
    }
    if (req.file) {
      if (photo_filename) await supabase.storage.from('coffee-photos').remove([photo_filename]);
      const ext = path.extname(req.file.originalname) || '.jpg';
      photo_filename = `coffee_${Date.now()}${ext}`;
      await uploadToSupabase('coffee-photos', photo_filename, req.file.buffer, req.file.mimetype);
    }

    const oldBatchIds = existing.rows[0].linked_batched_item_ids || [];
    const newBatchIds = JSON.parse(linked_batched_item_ids || '[]');

    const effectiveStatus    = isManager ? (status || 'menu')      : existing.rows[0].status;
    const effectivePrice     = isManager ? (price || null)         : existing.rows[0].price;
    const effectiveSpecialOn = isManager ? (last_special_on||null) : existing.rows[0].last_special_on;
    const effectiveSuggestedBy = isManager ? (suggested_by_name || null) : existing.rows[0].suggested_by_name;

    const result = await pool.query(
      `UPDATE coffee_beverages SET name=$1, method=$2, glass=$3, garnish=$4, status=$5, price=$6, last_special_on=$7, notes=$8, photo_filename=$9, linked_batched_item_ids=$10, suggested_by_name=$11
       WHERE id=$12 RETURNING *`,
      [name, method||null, glass||null, garnish||null, effectiveStatus, effectivePrice, effectiveSpecialOn, notes||null, photo_filename, newBatchIds, effectiveSuggestedBy, id]
    );

    await pool.query('DELETE FROM coffee_beverage_ingredients WHERE beverage_id=$1', [id]);
    const ingList = JSON.parse(ingredients || '[]');
    for (let i = 0; i < ingList.length; i++) {
      const ing = ingList[i];
      await pool.query(
        'INSERT INTO coffee_beverage_ingredients (beverage_id, ingredient_name, amount, unit, sort_order) VALUES ($1,$2,$3,$4,$5)',
        [id, ing.ingredient_name, ing.amount||null, ing.unit||null, i+1]
      );
    }

    await pool.query('DELETE FROM coffee_tags WHERE beverage_id=$1', [id]);
    const tagList = JSON.parse(tags || '[]');
    for (const tag of tagList) {
      const td = await pool.query('SELECT color FROM coffee_tag_definitions WHERE name=$1', [tag]);
      await pool.query(
        'INSERT INTO coffee_tags (beverage_id, tag_name, tag_color) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [id, tag, td.rows[0]?.color || '#6b7280']
      );
    }

    const removedBatch = oldBatchIds.filter(b => !newBatchIds.includes(b));
    const addedBatch = newBatchIds.filter(b => !oldBatchIds.includes(b));
    for (const bid of removedBatch) {
      await pool.query(
        `UPDATE coffee_batched_items SET linked_beverage_ids = array_remove(linked_beverage_ids, $1) WHERE id=$2`,
        [parseInt(id), bid]
      );
    }
    for (const bid of addedBatch) {
      await pool.query(
        `UPDATE coffee_batched_items SET linked_beverage_ids = array_append(linked_beverage_ids, $1)
         WHERE id=$2 AND NOT ($1 = ANY(linked_beverage_ids))`,
        [parseInt(id), bid]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete beverage
app.delete('/api/coffee/:id', authenticateToken, checkCoffeeManage, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM coffee_beverages WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ message: 'Not found' });
    if (r.rows[0].photo_filename) {
      await supabase.storage.from('coffee-photos').remove([r.rows[0].photo_filename]);
    }
    for (const bid of (r.rows[0].linked_batched_item_ids || [])) {
      await pool.query(
        `UPDATE coffee_batched_items SET linked_beverage_ids = array_remove(linked_beverage_ids, $1) WHERE id=$2`,
        [parseInt(req.params.id), bid]
      );
    }
    await pool.query('DELETE FROM coffee_beverages WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Sales CRM ──────────────────────────────────────────────────────────────


const checkCRMView = async (req, res, next) => {
  if (req.user.roles.includes('admin')) return next();
  try {
    const r = await pool.query(
      `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
       WHERE p.role = ANY($1::text[]) AND t.slug = 'sales-crm' AND p.permission_level = 'view'`,
      [req.user.roles]
    );
    if (r.rows.length === 0) return res.status(403).json({ message: 'Permission denied' });
    next();
  } catch { res.status(500).json({ message: 'Server error' }); }
};

const checkCRMManage = async (req, res, next) => {
  if (req.user.roles.includes('admin')) return next();
  try {
    const r = await pool.query(
      `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
       WHERE p.role = ANY($1::text[]) AND t.slug = 'sales-crm' AND p.permission_level = 'upload'`,
      [req.user.roles]
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
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id WHERE p.role = ANY($1::text[]) AND t.slug = 'production-schedule' AND p.permission_level IN ('view','upload')`,
    [req.user.roles]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'No access' }))
  .catch(() => res.status(500).json({ message: 'Server error' }));
};

const checkProdManage = (req, res, next) => {
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id WHERE p.role = ANY($1::text[]) AND t.slug = 'production-schedule' AND p.permission_level = 'upload'`,
    [req.user.roles]
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

// ==================== 86ed Customers ====================
function check86edView(req, res, next) {
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = ANY($1::text[]) AND t.slug = '86ed-customers' AND p.permission_level IN ('view','upload')`,
    [req.user.roles]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

function check86edManage(req, res, next) {
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = ANY($1::text[]) AND t.slug = '86ed-customers' AND p.permission_level = 'upload'`,
    [req.user.roles]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

const eightySixedPhotoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.get('/api/86ed', authenticateToken, check86edView, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM eighty_sixed_customers ORDER BY created_at DESC');
    const rows = await Promise.all(r.rows.map(async (row) => {
      if (!row.photo_filename) return row;
      const { data } = await supabase.storage.from('eightysixed-photos').createSignedUrl(row.photo_filename, 3600);
      return { ...row, photo_url: data?.signedUrl || null };
    }));
    res.json(rows);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.get('/api/86ed/:id/photo', authenticateToken, check86edView, async (req, res) => {
  try {
    const r = await pool.query('SELECT photo_filename FROM eighty_sixed_customers WHERE id=$1', [req.params.id]);
    if (!r.rows.length || !r.rows[0].photo_filename) return res.status(404).json({ message: 'Not found' });
    const { data, error } = await supabase.storage.from('eightysixed-photos').download(r.rows[0].photo_filename);
    if (error) return res.status(404).json({ message: 'Photo not found' });
    const buf = Buffer.from(await data.arrayBuffer());
    const ext = path.extname(r.rows[0].photo_filename).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buf);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/86ed', authenticateToken, check86edManage, eightySixedPhotoUpload.single('photo'), async (req, res) => {
  try {
    const { name, description, incident_date, reason } = req.body;
    if (!incident_date) return res.status(400).json({ message: 'incident_date is required' });
    let photo_filename = null;
    if (req.file) {
      const ext = path.extname(req.file.originalname) || '.jpg';
      const filename = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
      await uploadToSupabase('eightysixed-photos', filename, req.file.buffer, req.file.mimetype);
      photo_filename = filename;
    }
    const r = await pool.query(
      `INSERT INTO eighty_sixed_customers (name, description, photo_filename, incident_date, reason, created_by_id, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name || null, description || null, photo_filename, incident_date, reason || null, req.user.id, req.user.name]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/86ed/:id', authenticateToken, check86edManage, eightySixedPhotoUpload.single('photo'), async (req, res) => {
  try {
    const cur = await pool.query('SELECT * FROM eighty_sixed_customers WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ message: 'Not found' });
    const existing = cur.rows[0];
    const { name, description, incident_date, reason, status, remove_photo } = req.body;

    let photo_filename = existing.photo_filename;
    if (remove_photo === 'true' && existing.photo_filename) {
      await supabase.storage.from('eightysixed-photos').remove([existing.photo_filename]);
      photo_filename = null;
    }
    if (req.file) {
      const ext = path.extname(req.file.originalname) || '.jpg';
      const filename = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
      await uploadToSupabase('eightysixed-photos', filename, req.file.buffer, req.file.mimetype);
      if (existing.photo_filename) {
        await supabase.storage.from('eightysixed-photos').remove([existing.photo_filename]);
      }
      photo_filename = filename;
    }

    const newStatus = status || existing.status;
    let lifted_at = existing.lifted_at;
    if (newStatus !== existing.status) {
      lifted_at = newStatus === 'lifted' ? new Date().toISOString() : null;
    }

    const r = await pool.query(
      `UPDATE eighty_sixed_customers SET
        name=$1, description=$2, photo_filename=$3, incident_date=$4, reason=$5, status=$6, lifted_at=$7
       WHERE id=$8 RETURNING *`,
      [
        name !== undefined ? (name || null) : existing.name,
        description !== undefined ? (description || null) : existing.description,
        photo_filename,
        incident_date || existing.incident_date,
        reason !== undefined ? (reason || null) : existing.reason,
        newStatus,
        lifted_at,
        req.params.id,
      ]
    );
    res.json(r.rows[0]);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/86ed/:id', authenticateToken, check86edManage, async (req, res) => {
  try {
    const r = await pool.query('SELECT photo_filename FROM eighty_sixed_customers WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ message: 'Not found' });
    if (r.rows[0].photo_filename) {
      await supabase.storage.from('eightysixed-photos').remove([r.rows[0].photo_filename]);
    }
    await pool.query('DELETE FROM eighty_sixed_customers WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── Tank Maintenance ──────────────────────────────────────────────────────────

function checkTankMaintenanceView(req, res, next) {
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = ANY($1::text[]) AND t.slug = 'tank-maintenance' AND p.permission_level IN ('view','upload')`,
    [req.user.roles]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

function checkTankMaintenanceManage(req, res, next) {
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = ANY($1::text[]) AND t.slug = 'tank-maintenance' AND p.permission_level = 'upload'`,
    [req.user.roles]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

// Status overview — active tanks × all task types with last log date and days since
app.get('/api/tank-maintenance/status', authenticateToken, checkTankMaintenanceView, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        mt.id AS tank_id, mt.name AS tank_name, mt.sort_order AS tank_sort,
        tt.id AS task_type_id, tt.name AS task_type_name, tt.frequency_days, tt.sort_order AS tt_sort,
        MAX(ml.performed_date) AS last_performed_date,
        (CURRENT_DATE - MAX(ml.performed_date)) AS days_since
      FROM maintenance_tanks mt
      CROSS JOIN tank_maintenance_task_types tt
      LEFT JOIN tank_maintenance_logs ml ON ml.tank_id = mt.id AND ml.task_type_id = tt.id
      WHERE mt.active = true
      GROUP BY mt.id, mt.name, mt.sort_order, tt.id, tt.name, tt.frequency_days, tt.sort_order
      ORDER BY mt.sort_order, mt.name, tt.sort_order
    `);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// Tanks CRUD
app.get('/api/tank-maintenance/tanks', authenticateToken, checkTankMaintenanceView, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM maintenance_tanks ORDER BY sort_order, name');
    res.json(rows);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/tank-maintenance/tanks', authenticateToken, checkTankMaintenanceManage, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: 'Name required' });
  try {
    const { rows: [max] } = await pool.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM maintenance_tanks');
    const { rows: [tank] } = await pool.query(
      'INSERT INTO maintenance_tanks (name, sort_order) VALUES ($1, $2) RETURNING *',
      [name.trim(), max.next]
    );
    res.json(tank);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/tank-maintenance/tanks/reorder', authenticateToken, checkTankMaintenanceManage, async (req, res) => {
  const { orderedIds } = req.body;
  try {
    await Promise.all(orderedIds.map((id, i) =>
      pool.query('UPDATE maintenance_tanks SET sort_order=$1 WHERE id=$2', [i, id])
    ));
    res.json({ message: 'Reordered' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/tank-maintenance/tanks/:id', authenticateToken, checkTankMaintenanceManage, async (req, res) => {
  const { name, active } = req.body;
  try {
    const { rows: [tank] } = await pool.query(
      `UPDATE maintenance_tanks SET
        name = COALESCE($1, name),
        active = COALESCE($2, active)
       WHERE id=$3 RETURNING *`,
      [name?.trim() || null, active !== undefined ? active : null, req.params.id]
    );
    if (!tank) return res.status(404).json({ message: 'Not found' });
    res.json(tank);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/tank-maintenance/tanks/:id', authenticateToken, checkTankMaintenanceManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM maintenance_tanks WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Task types CRUD — reorder must be before :id
app.get('/api/tank-maintenance/task-types', authenticateToken, checkTankMaintenanceView, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tank_maintenance_task_types ORDER BY sort_order, name');
    res.json(rows);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/tank-maintenance/task-types', authenticateToken, checkTankMaintenanceManage, async (req, res) => {
  const { name, frequency_days } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: 'Name required' });
  try {
    const { rows: [max] } = await pool.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM tank_maintenance_task_types');
    const { rows: [tt] } = await pool.query(
      'INSERT INTO tank_maintenance_task_types (name, frequency_days, sort_order) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), frequency_days || 90, max.next]
    );
    res.json(tt);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/tank-maintenance/task-types/reorder', authenticateToken, checkTankMaintenanceManage, async (req, res) => {
  const { orderedIds } = req.body;
  try {
    await Promise.all(orderedIds.map((id, i) =>
      pool.query('UPDATE tank_maintenance_task_types SET sort_order=$1 WHERE id=$2', [i, id])
    ));
    res.json({ message: 'Reordered' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/tank-maintenance/task-types/:id', authenticateToken, checkTankMaintenanceManage, async (req, res) => {
  const { name, frequency_days } = req.body;
  try {
    const { rows: [tt] } = await pool.query(
      `UPDATE tank_maintenance_task_types SET
        name = COALESCE($1, name),
        frequency_days = COALESCE($2, frequency_days)
       WHERE id=$3 RETURNING *`,
      [name?.trim() || null, frequency_days || null, req.params.id]
    );
    if (!tt) return res.status(404).json({ message: 'Not found' });
    res.json(tt);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/tank-maintenance/task-types/:id', authenticateToken, checkTankMaintenanceManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM tank_maintenance_task_types WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Logs — :tankId/:taskTypeId must be before :id
app.get('/api/tank-maintenance/logs/:tankId/:taskTypeId', authenticateToken, checkTankMaintenanceView, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM tank_maintenance_logs
       WHERE tank_id=$1 AND task_type_id=$2
       ORDER BY performed_date DESC, created_at DESC`,
      [req.params.tankId, req.params.taskTypeId]
    );
    res.json(rows);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/tank-maintenance/logs', authenticateToken, checkTankMaintenanceManage, async (req, res) => {
  const { tank_id, task_type_id, performed_date, notes } = req.body;
  if (!tank_id || !task_type_id || !performed_date) return res.status(400).json({ message: 'tank_id, task_type_id, and performed_date required' });
  try {
    const { rows: [log] } = await pool.query(
      `INSERT INTO tank_maintenance_logs (tank_id, task_type_id, performed_date, notes, performed_by_id, performed_by_name)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [tank_id, task_type_id, performed_date, notes || null, req.user.id, req.user.name]
    );
    res.json(log);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/tank-maintenance/logs/:id', authenticateToken, checkTankMaintenanceManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM tank_maintenance_logs WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── Distillery Inventory ──────────────────────────────────────────────────────

function checkDistilleryView(req, res, next) {
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = ANY($1::text[]) AND t.slug = 'distillery-inventory' AND p.permission_level IN ('view','upload')`,
    [req.user.roles]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

function checkDistilleryManage(req, res, next) {
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id = p.tool_id
     WHERE p.role = ANY($1::text[]) AND t.slug = 'distillery-inventory' AND p.permission_level = 'upload'`,
    [req.user.roles]
  ).then(r => r.rows.length ? next() : res.status(403).json({ message: 'Forbidden' }))
   .catch(() => res.status(500).json({ message: 'Server error' }));
}

// Products
app.get('/api/distillery/products', authenticateToken, checkDistilleryView, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM distillery_products WHERE active=true ORDER BY name`
    );
    res.json(rows);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/distillery/products', authenticateToken, checkDistilleryManage, async (req, res) => {
  const { name, category, unit_size, current_quantity } = req.body;
  if (!name?.trim() || !unit_size?.trim()) return res.status(400).json({ message: 'Name and unit size required' });
  try {
    const { rows: [p] } = await pool.query(
      `INSERT INTO distillery_products (name, category, unit_size, current_quantity)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name.trim(), category?.trim() || null, unit_size.trim(), current_quantity || 0]
    );
    res.json(p);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/distillery/products/:id', authenticateToken, checkDistilleryManage, async (req, res) => {
  const { name, category, unit_size, active } = req.body;
  try {
    const { rows: [p] } = await pool.query(
      `UPDATE distillery_products SET
        name = COALESCE($1, name),
        category = COALESCE($2, category),
        unit_size = COALESCE($3, unit_size),
        active = COALESCE($4, active)
       WHERE id=$5 RETURNING *`,
      [name?.trim() || null, category !== undefined ? (category?.trim() || null) : undefined, unit_size?.trim() || null, active !== undefined ? active : null, req.params.id]
    );
    if (!p) return res.status(404).json({ message: 'Not found' });
    res.json(p);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.delete('/api/distillery/products/:id', authenticateToken, checkDistilleryManage, async (req, res) => {
  try {
    await pool.query('DELETE FROM distillery_products WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Stock adjustment
app.post('/api/distillery/stock', authenticateToken, checkDistilleryManage, async (req, res) => {
  const { product_id, type, quantity, notes } = req.body;
  if (!product_id || !type || quantity === undefined) return res.status(400).json({ message: 'product_id, type, and quantity required' });
  try {
    const { rows: [product] } = await pool.query('SELECT * FROM distillery_products WHERE id=$1', [product_id]);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const before = parseFloat(product.current_quantity);
    let after;
    let change;
    if (type === 'add')    { change = parseFloat(quantity); after = before + change; }
    else if (type === 'remove') { change = -parseFloat(quantity); after = before + change; }
    else if (type === 'adjust') { after = parseFloat(quantity); change = after - before; }
    else return res.status(400).json({ message: 'Invalid type' });

    await pool.query('UPDATE distillery_products SET current_quantity=$1 WHERE id=$2', [after, product_id]);
    const { rows: [tx] } = await pool.query(
      `INSERT INTO distillery_transactions (product_id, product_name, type, quantity_change, quantity_before, quantity_after, notes, created_by_id, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [product_id, product.name, type, change, before, after, notes || null, req.user.id, req.user.name]
    );
    res.json({ transaction: tx, new_quantity: after });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Transactions
app.get('/api/distillery/transactions', authenticateToken, checkDistilleryManage, async (req, res) => {
  try {
    const { product_id } = req.query;
    const { rows } = await pool.query(
      `SELECT * FROM distillery_transactions
       ${product_id ? 'WHERE product_id=$1' : ''}
       ORDER BY created_at DESC LIMIT 500`,
      product_id ? [product_id] : []
    );
    res.json(rows);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// Orders — list and create before /:id
app.get('/api/distillery/orders', authenticateToken, checkDistilleryView, async (req, res) => {
  try {
    const { status } = req.query;
    const { rows } = await pool.query(
      `SELECT o.*,
         COUNT(oi.id)::int AS item_count,
         SUM(oi.quantity) AS total_qty
       FROM distillery_orders o
       LEFT JOIN distillery_order_items oi ON oi.order_id = o.id
       ${status ? 'WHERE o.status=$1' : ''}
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      status ? [status] : []
    );
    res.json(rows);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.post('/api/distillery/orders', authenticateToken, checkDistilleryView, async (req, res) => {
  const { recipient, requested_date, notes, items } = req.body;
  if (!recipient?.trim()) return res.status(400).json({ message: 'Recipient required' });
  if (!items?.length) return res.status(400).json({ message: 'At least one item required' });
  try {
    const { rows: [order] } = await pool.query(
      `INSERT INTO distillery_orders (requested_by_id, requested_by_name, recipient, requested_date, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, req.user.name, recipient.trim(), requested_date || null, notes?.trim() || null]
    );
    for (const item of items) {
      const { rows: [prod] } = await pool.query('SELECT name, unit_size FROM distillery_products WHERE id=$1', [item.product_id]);
      if (!prod) continue;
      await pool.query(
        `INSERT INTO distillery_order_items (order_id, product_id, product_name, unit_size, quantity)
         VALUES ($1,$2,$3,$4,$5)`,
        [order.id, item.product_id, prod.name, prod.unit_size, item.quantity]
      );
    }
    res.json(order);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.get('/api/distillery/orders/:id', authenticateToken, checkDistilleryView, async (req, res) => {
  try {
    const { rows: [order] } = await pool.query('SELECT * FROM distillery_orders WHERE id=$1', [req.params.id]);
    if (!order) return res.status(404).json({ message: 'Not found' });
    const { rows: items } = await pool.query(
      'SELECT * FROM distillery_order_items WHERE order_id=$1 ORDER BY id',
      [req.params.id]
    );
    res.json({ ...order, items });
  } catch { res.status(500).json({ message: 'Server error' }); }
});

app.patch('/api/distillery/orders/:id', authenticateToken, checkDistilleryManage, async (req, res) => {
  const { action } = req.body;
  if (!['fulfill', 'cancel'].includes(action)) return res.status(400).json({ message: 'action must be fulfill or cancel' });
  try {
    const { rows: [order] } = await pool.query('SELECT * FROM distillery_orders WHERE id=$1', [req.params.id]);
    if (!order) return res.status(404).json({ message: 'Not found' });
    if (order.status !== 'pending') return res.status(400).json({ message: 'Order is not pending' });

    if (action === 'fulfill') {
      const { rows: items } = await pool.query('SELECT * FROM distillery_order_items WHERE order_id=$1', [req.params.id]);
      for (const item of items) {
        if (!item.product_id) continue;
        const { rows: [prod] } = await pool.query('SELECT * FROM distillery_products WHERE id=$1', [item.product_id]);
        if (!prod) continue;
        const before = parseFloat(prod.current_quantity);
        const change = -parseFloat(item.quantity);
        const after = before + change;
        await pool.query('UPDATE distillery_products SET current_quantity=$1 WHERE id=$2', [after, item.product_id]);
        await pool.query(
          `INSERT INTO distillery_transactions (product_id, product_name, type, quantity_change, quantity_before, quantity_after, notes, order_id, created_by_id, created_by_name)
           VALUES ($1,$2,'remove',$3,$4,$5,$6,$7,$8,$9)`,
          [item.product_id, item.product_name, change, before, after, `Order #${order.id} to ${order.recipient}`, order.id, req.user.id, req.user.name]
        );
      }
      await pool.query(
        `UPDATE distillery_orders SET status='fulfilled', fulfilled_by_id=$1, fulfilled_by_name=$2, fulfilled_at=NOW() WHERE id=$3`,
        [req.user.id, req.user.name, req.params.id]
      );
    } else {
      await pool.query(`UPDATE distillery_orders SET status='cancelled' WHERE id=$1`, [req.params.id]);
    }
    const { rows: [updated] } = await pool.query('SELECT * FROM distillery_orders WHERE id=$1', [req.params.id]);
    res.json(updated);
  } catch { res.status(500).json({ message: 'Server error' }); }
});

// ── Coffee Site ───────────────────────────────────────────────────────────────
const CS_BUCKET = 'coffee-site-photos';
const CS_PUB_BASE = `${process.env.SUPABASE_URL || 'https://ozuhfcinbelfxpidxdai.supabase.co'}/storage/v1/object/public/${CS_BUCKET}`;
const CS_COLS = `id, coffee_name, roaster_name, origin, process, tasting_notes, price::float AS price, photo_filename, go_live_date, sold_out, sold_out_at, is_featured, archived, archived_at, created_by_name, created_at`;

function csBagUrl(filename) { return filename ? `${CS_PUB_BASE}/${filename}` : null; }
function csWithUrl(b) { return { ...b, photo_url: csBagUrl(b.photo_filename) }; }

function checkCoffeeSiteView(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id=p.tool_id
     WHERE t.slug='coffee-site' AND p.role=ANY($1) AND p.permission_level IN ('view','upload')`,
    [req.user.roles]
  ).then(r => r.rows.length ? next() : res.status(403).json({ error: 'Forbidden' }))
   .catch(() => res.status(500).json({ error: 'Server error' }));
}

function checkCoffeeSiteManage(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.roles.includes('admin')) return next();
  pool.query(
    `SELECT 1 FROM permissions p JOIN tools t ON t.id=p.tool_id
     WHERE t.slug='coffee-site' AND p.role=ANY($1) AND p.permission_level='upload'`,
    [req.user.roles]
  ).then(r => r.rows.length ? next() : res.status(403).json({ error: 'Forbidden' }))
   .catch(() => res.status(500).json({ error: 'Server error' }));
}

async function autoArchiveCoffeeSiteBags() {
  try {
    await pool.query(
      `UPDATE coffee_site_bags
       SET archived=true, archived_at=NOW(), is_featured=false, updated_at=NOW()
       WHERE archived=false AND sold_out=true AND sold_out_at < NOW() - INTERVAL '14 days'`
    );
  } catch {}
}

// Public — no auth, CORS open
app.get('/api/public/coffee-site', async (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    const { rows } = await pool.query(
      `SELECT ${CS_COLS} FROM coffee_site_bags WHERE archived=false ORDER BY is_featured DESC, created_at DESC`
    );
    const featured = rows.find(b => b.is_featured)
      || rows.find(b => !b.sold_out)
      || null;
    res.json({ featured: featured ? csWithUrl(featured) : null, coffees: rows.map(csWithUrl) });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/coffee-site/bags', authenticateToken, checkCoffeeSiteView, async (req, res) => {
  try {
    await autoArchiveCoffeeSiteBags();
    const { rows } = await pool.query(
      `SELECT ${CS_COLS} FROM coffee_site_bags ORDER BY archived ASC, is_featured DESC, created_at DESC`
    );
    res.json(rows.map(csWithUrl));
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/coffee-site/bags/presign', authenticateToken, checkCoffeeSiteManage, async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ error: 'Storage not configured' });
    const { filename } = req.body;
    const ext = (filename || 'photo.jpg').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const unique = `bag-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { data, error } = await supabase.storage.from(CS_BUCKET).createSignedUploadUrl(unique);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ signedUrl: data.signedUrl, path: data.path, filename: unique });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/coffee-site/bags', authenticateToken, checkCoffeeSiteManage, async (req, res) => {
  try {
    const { coffee_name, roaster_name, origin, process: proc, tasting_notes, price, photo_filename, go_live_date } = req.body;
    if (!coffee_name?.trim()) return res.status(400).json({ error: 'coffee_name required' });
    const { rows } = await pool.query(
      `INSERT INTO coffee_site_bags (coffee_name, roaster_name, origin, process, tasting_notes, price, photo_filename, go_live_date, created_by_id, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${CS_COLS}`,
      [coffee_name.trim(), roaster_name||null, origin||null, proc||null, tasting_notes||null, price != null && price !== '' ? price : null, photo_filename||null, go_live_date||null, req.user.id, req.user.name]
    );
    res.status(201).json(csWithUrl(rows[0]));
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.patch('/api/coffee-site/bags/:id/sold-out', authenticateToken, checkCoffeeSiteView, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE coffee_site_bags SET sold_out=$1, sold_out_at=CASE WHEN $1 THEN NOW() ELSE NULL END, updated_at=NOW()
       WHERE id=$2 RETURNING ${CS_COLS}`,
      [!!req.body.sold_out, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(csWithUrl(rows[0]));
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.patch('/api/coffee-site/bags/:id/feature', authenticateToken, checkCoffeeSiteManage, async (req, res) => {
  try {
    const { featured } = req.body;
    if (featured) {
      await pool.query('UPDATE coffee_site_bags SET is_featured=false, updated_at=NOW()');
    }
    const { rows } = await pool.query(
      `UPDATE coffee_site_bags SET is_featured=$1, updated_at=NOW() WHERE id=$2 RETURNING ${CS_COLS}`,
      [!!featured, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(csWithUrl(rows[0]));
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.patch('/api/coffee-site/bags/:id/archive', authenticateToken, checkCoffeeSiteManage, async (req, res) => {
  try {
    const archive = req.body.archived !== false;
    const { rows } = await pool.query(
      `UPDATE coffee_site_bags
       SET archived=$1, archived_at=CASE WHEN $1 THEN NOW() ELSE NULL END,
           is_featured=CASE WHEN $1 THEN false ELSE is_featured END,
           updated_at=NOW()
       WHERE id=$2 RETURNING ${CS_COLS}`,
      [archive, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(csWithUrl(rows[0]));
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.patch('/api/coffee-site/bags/:id', authenticateToken, checkCoffeeSiteManage, async (req, res) => {
  try {
    const { coffee_name, roaster_name, origin, process: proc, tasting_notes, price, photo_filename, go_live_date } = req.body;
    const { rows } = await pool.query(
      `UPDATE coffee_site_bags
       SET coffee_name   = COALESCE($1, coffee_name),
           roaster_name  = $2,
           origin        = $3,
           process       = $4,
           tasting_notes = $5,
           price         = $6,
           photo_filename = COALESCE($7, photo_filename),
           go_live_date  = $8,
           updated_at    = NOW()
       WHERE id=$9 RETURNING ${CS_COLS}`,
      [coffee_name?.trim()||null, roaster_name||null, origin||null, proc||null, tasting_notes||null, price != null && price !== '' ? price : null, photo_filename||null, go_live_date||null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(csWithUrl(rows[0]));
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/coffee-site/bags/:id', authenticateToken, checkCoffeeSiteManage, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT photo_filename FROM coffee_site_bags WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].photo_filename && supabase) {
      await supabase.storage.from(CS_BUCKET).remove([rows[0].photo_filename]).catch(() => {});
    }
    await pool.query('DELETE FROM coffee_site_bags WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;