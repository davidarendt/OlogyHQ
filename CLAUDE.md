# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Server (run from `server/`)
```bash
npm run dev      # start with nodemon (auto-reload)
npm start        # start without auto-reload
```

### Client (run from `client/`)
```bash
npm start        # start React dev server on port 3000
npm run build    # production build
```

There are no tests. Both processes must run simultaneously during development — server on port 5000, client on port 3000.

### Database
```bash
# Connect to local PostgreSQL
PGPASSWORD=Post323! psql -h localhost -p 5432 -U postgres -d ologyhq
```

## Architecture

### Navigation
There is **no React Router**. `App.js` holds a `page` string state and a `pageProps` object. Navigation works via `handleNavigate(pageName, props)` passed down as `onNavigate`. Adding a new page requires: importing the component, adding an `if (page === '...')` branch in `App.js`, and adding an entry to `TOOL_META` in `Dashboard.js`.

### Auth
JWT stored in an **httpOnly cookie** (`token`). The server middleware `authenticateToken` validates it and attaches `req.user = { id, name, role }`. The client calls `GET /api/me` on mount to rehydrate session — no localStorage involved.

### Permission System
Two layers:
1. **Tool-level** (`permissions` table): `role + tool_id + permission_level ('view'|'upload')`. Controls dashboard card visibility (`view`) and write access within a tool (`upload`). Managed via the Permissions page.
2. **Document-level** (`hr_document_roles` table): per-document role visibility for HR Documents. Each document specifies which roles can see it.

`GET /api/my-tools` returns tools the user's role can access, with a `has_upload_permission` boolean. The Dashboard passes this as `canUpload` when navigating to a tool page.

### Adding a New Tool
1. Insert into `tools` table with a unique `slug`. Set `url` for external tools, leave null for internal pages.
2. Add the slug to `TOOL_META` in `Dashboard.js` with icon, description, and `page` (internal route name) or null.
3. For internal tools: create the page component, add the `if (page === '...')` route in `App.js`.
4. Tools with `url` open externally. Tools with `page` navigate internally. Tools with neither show a "Coming Soon" ribbon and are non-clickable.
5. `visible_to_all` on the `tools` table makes a card appear for everyone regardless of permissions (currently unused — HR Documents was changed to use permission toggles instead).

### Database Schema (key tables)
- `users` — id, name, email, password, role, created_at
- `tools` — id, name, slug, description, url, visible_to_all, created_at
- `permissions` — id, role, tool_id, permission_level ('view'|'upload'), created_at
- `hr_documents` — id, name, filename, mimetype, size, uploaded_by_id, uploaded_by_name, sort_order, uploaded_at
- `hr_document_roles` — document_id, role (controls per-document visibility)
- `sop_documents` — id, name, filename, mimetype, size, uploaded_by_id, uploaded_by_name, sort_order, uploaded_at
- `sop_document_roles` — document_id, role (controls per-document visibility)
- `production_submissions` — id, submitted_by_id, submitted_by_name, submission_date, submission_type ('distro'|'keg_return'), distributor, other_distributor, ology_halves, ology_sixths, kl_halves, kl_sixths, packing_slip_unavailable, created_at
- `production_photo_sets` — id, submission_id, sort_order, photo_type, product_date, created_at
- `production_photos` — id, submission_id, photo_set_id, is_packing_slip, filename, original_name, mimetype, created_at
- `label_inventory` — id, name, num_rolls, labels_per_roll, labels_on_order, low_par, high_par, sort_order, updated_at
- `label_email_list` — id, email
- `taproom_beers` — id, name, sort_order, created_at
- `taproom_beer_locations` — beer_id, location (PK: beer_id+location) — controls which beers appear at each location's count form
- `taproom_inventory_sessions` — id, location, session_date, submitted_by_id, submitted_by_name, notes, submitted_at
- `taproom_inventory_counts` — id, session_id, beer_id, four_pack, sixth_bbl, half_bbl

### Roles
`admin`, `bar_manager`, `bartender`, `barista`, `coffee_manager`, `production`, `sales`, `hr`

**Admin has no permission bypasses.** Admin uses the same permission system as all other roles — no `if (req.user.role === 'admin') return next()` in middleware, no `|| user.role === 'admin'` on the client. David tests features as admin with permissions toggled, so bypasses break testing. The only admin-exclusive features are the User Management dashboard card and explicit delete-only endpoints.

### Two-Level Permission Tools
HR Documents and SOPs & Checklists both use two permission levels per role in the Permissions page:
- `view` — can see the tool card and access the tool
- `upload` — can access the manage/upload area within the tool

In `Permissions.js`, these tools are separated from `otherTools` and rendered as two sub-rows. The `canUpload` prop passed from `App.js` comes purely from `pageProps.canUpload` (set by the dashboard via `has_upload_permission`).

### Styling
Dark theme throughout. Brand color `#FF6B00` (Ology orange). Tailwind utility classes for layout/spacing; inline styles used for dynamic values (hex colors, filter effects, clip-path shapes). The hex card grid in HR Documents uses inline styles exclusively for the honeycomb geometry. Custom tool icons go in `client/public/icons/` as RGBA PNGs (256×256).

### File Uploads
- HR Documents: `server/uploads/hr-documents/` — served inline or as attachment via `/view` and `/download` endpoints
- SOPs: `server/uploads/sop-documents/` — same pattern
- Production Photos: `server/uploads/production-photos/` — packing slips and photo-set images share `production_photos` table, distinguished by `is_packing_slip`. Route ordering matters: `/api/production/photo/:filename` must be registered **before** `/api/production/:id`.

### Cross-Origin Authenticated Images
`<img src="http://localhost:5000/...">` does not send httpOnly cookies for cross-origin sub-resource requests. Use the `PhotoImg` component pattern: `fetch(url, { credentials: 'include' })` → `.blob()` → `URL.createObjectURL()`, stored in state and revoked on unmount. Used in Production Photos.

### Email
Nodemailer with Gmail SMTP (`smtp.gmail.com`, port 465). Credentials in `server/.env` as `EMAIL_USER` / `EMAIL_PASS` (Gmail App Password). Scheduled label order emails use `node-cron`: Thursday 2pm ET (automatic send) and Friday 8am ET (sends only if inventory not updated since Thursday). Both use `America/New_York` timezone. The shared `sendLabelOrderEmail(overrides)` helper accepts optional quantity overrides for manual pre-send edits.

### External Data
Distro / Taproom Orders reads live from a Google Sheet via the public CSV export URL (no API key needed — sheet is set to "anyone with link"). The server fetches and parses CSV on each request. PDF invoice links are Google Drive "anyone with link" URLs transformed to `/preview` format for iframe embedding.

Taproom Inventory imports from a Google Sheet (`1aJ2R6OEvO5ixG-AsWdJlRSIsiMczEBOi_pk9Ra8Xuu0`) with one tab per location (Midtown, Power Mill, Northside, Tampa). Each tab: rows 1-2 are headers (location name + date), one row is the asterisk note, then beer rows (col A = name, B = 4-pack, C = 1/6 BBL, D = 1/2 BBL). Asterisks in counts mean "on tap" — stripped for numeric parsing. "Import from Sheet" creates beer records, `taproom_beer_locations` rows, and a baseline session per location. Ongoing counts are submitted via the HQ tool.
