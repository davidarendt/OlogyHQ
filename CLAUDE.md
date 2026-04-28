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

### Database (local dev only)
```bash
PGPASSWORD=Post323! psql -h localhost -p 5432 -U postgres -d ologyhq
```
Production uses Supabase (project `ozuhfcinbelfxpidxdai`). Schema changes go through Supabase MCP `apply_migration`.

## Deployment

The app is deployed as a **single Netlify site** (`ologyhq.netlify.app`):
- **Frontend**: React build in `client/build`, published via Netlify
- **Backend**: Express app wrapped by `netlify/functions/api.js` using `serverless-http`
- **Database**: Supabase PostgreSQL via connection pooler (`aws-1-us-west-2.pooler.supabase.com:6543`, transaction mode, SSL required)
- **File storage**: Supabase Storage (private buckets: `hr-documents`, `sop-documents`, `production-photos`)

All `/api/*` requests redirect to `/.netlify/functions/api/:splat` via `netlify.toml`.

### Serverless Gotchas
- **Binary responses** (PDFs, images): `serverless-http` must be configured with `binary: ['application/pdf', 'image/*', 'application/octet-stream']` or bytes get corrupted as UTF-8 strings.
- **Body parsing**: Express 5 + serverless-http body stream incompatibility. The function handler manually parses JSON/form bodies before passing to Express; `express.json()` is skipped if `req.body` is already set.
- **Path prefix**: The function handler prepends `/api` to the path only if it doesn't already start with `/api` (avoids double-prefix `/api/api/...`).
- **node-cron**: Listed in `external_node_modules` in `netlify.toml` — esbuild cannot bundle it.
- **Filesystem**: Netlify Lambda has a read-only filesystem. All `mkdirSync` calls are wrapped in try/catch; uploads go to Supabase Storage, not local disk.

### Scheduled Functions
Label order emails run via Netlify Scheduled Functions (not node-cron in production):
- `netlify/functions/label-email-thursday.js` — every Thursday 18:00 UTC (2pm ET)
- `netlify/functions/label-email-friday.js` — every Friday 12:00 UTC (8am ET), sends only if inventory not updated since Thursday
- Shared logic lives in `server/labelEmail.js`

## Architecture

### Navigation
There is **no React Router**. `App.js` holds a `page` string state and a `pageProps` object. Navigation works via `handleNavigate(pageName, props)`. Browser back button is supported via `window.history.pushState` on each navigation and a `popstate` listener. Adding a new page requires: importing the component, adding an `if (page === '...')` branch in `App.js`, and adding an entry to `TOOL_META` in `Dashboard.js`.

### Auth
JWT stored in an **httpOnly cookie** (`token`). The server middleware `authenticateToken` validates it and attaches `req.user = { id, name, role }`. The client calls `GET /api/me` on mount to rehydrate session.

Password reset and user invite both use the same token mechanism: `reset_token` (64-char hex) + `reset_token_expires` columns on the `users` table. Forgot-password tokens expire in 1 hour; invite tokens expire in 7 days. New users are created with `password = NULL` and cannot log in until they set a password via the invite link.

### Permission System
Two layers:
1. **Tool-level** (`permissions` table): `role + tool_id + permission_level ('view'|'upload')`. Controls dashboard card visibility (`view`) and write access within a tool (`upload`). Managed via the Permissions page.
2. **Document-level** (`hr_document_roles` / `sop_document_roles` tables): per-document role visibility. Each document specifies which roles can see it.

`GET /api/my-tools` returns tools the user's role can access, with a `has_upload_permission` boolean. The Dashboard passes this as `canUpload` when navigating to a tool page.

### Admin Behavior
**Admin sees all tools always** — `GET /api/my-tools` includes `OR $1 = 'admin'` so admin's dashboard cards are never hidden by permission toggles. Admin also bypasses `checkHRView` middleware and sees all HR documents regardless of document-level role filters (`isPrivileged = true`).

For all other behavior, admin goes through the normal permission system — no blanket bypasses in other middleware. The `canUpload` prop still controls manage-view visibility for admin the same as any other role.

**Protected user**: `david@ologybrewing.com` cannot be deleted — the delete endpoint checks the target email before proceeding.

### Two-Level Permission Tools
HR Documents, SOPs & Checklists, Label Inventory, Taproom Inventory, and Cocktail Keeper use two permission levels:
- `view` — can see the tool card and access the tool
- `upload` — can access manage/upload areas within the tool (Manage tab, Edit/Delete, Send Order Email, etc.)

The `canUpload` prop comes from `pageProps.canUpload`, set by the dashboard via `has_upload_permission`.

### Database Schema (key tables)
- `users` — id, name, email, password (nullable for invited users), role, reset_token, reset_token_expires, created_at
- `tools` — id, name, slug, description, url, visible_to_all, created_at
- `permissions` — id, role, tool_id, permission_level ('view'|'upload'), created_at
- `hr_documents` — id, name, filename, mimetype, size, uploaded_by_id, uploaded_by_name, sort_order, uploaded_at
- `hr_document_roles` — document_id, role
- `sop_documents` — id, name, filename, mimetype, size, uploaded_by_id, uploaded_by_name, sort_order, uploaded_at
- `sop_document_roles` — document_id, role
- `production_submissions` — id, submitted_by_id, submitted_by_name, submission_date, submission_type ('distro'|'keg_return'), distributor, other_distributor, ology_halves, ology_sixths, kl_halves, kl_sixths, packing_slip_unavailable, created_at
- `production_photo_sets` — id, submission_id, sort_order, photo_type, product_date, created_at
- `production_photos` — id, submission_id, photo_set_id, is_packing_slip, filename, original_name, mimetype, created_at
- `label_inventory` — id, name, num_rolls, labels_per_roll, labels_on_order, low_par, high_par, sort_order, updated_at
- `label_email_list` — id, email
- `taproom_beers` — id, name, sort_order, created_at
- `taproom_beer_locations` — beer_id, location (PK: beer_id+location)
- `taproom_inventory_sessions` — id, location, session_date, submitted_by_id, submitted_by_name, notes, submitted_at
- `taproom_inventory_counts` — id, session_id, beer_id, four_pack, sixth_bbl, half_bbl
- `taproom_inventory_settings` — singleton row (id=1), four_pack_threshold, sixth_bbl_threshold, half_bbl_threshold
- `taproom_deliveries` — id, location, invoice_number, delivery_date, submitted_by_id, submitted_by_name, notes, submitted_at
- `taproom_delivery_items` — id, delivery_id, beer_id, beer_name, cases, sixth_bbl, half_bbl
- `inspections` — id, location, date, improvements, score_pct, rated_count, created_at
- `inspection_ratings` — id, inspection_id (→ inspections, cascade), section_id, item_index, rating ('1'–'5'|'NA'|null), note, updated_at; unique on (inspection_id, section_id, item_index)
- `recipes` — id, name, category ('brunch'|'shareables'|'flatbreads'|'specials'|'prep'), cook_time, description, ingredients, instructions, plating, notes, image_filename, linked_recipe_ids (INTEGER[]), sort_order, created_by_id, created_by_name, created_at, updated_at
- `cocktails` — id, name, status ('menu'|'special'|'wip'), description, price, glass, method, ice, garnish, last_special_on, photo_filename, linked_batched_item_ids (INTEGER[]), sort_order, suggested_by_name, suggested_by_id (→ users, SET NULL), created_at, updated_at
- `cocktail_ingredients` — id, cocktail_id (→ cocktails, cascade), ingredient_name, amount, unit, sort_order, is_garnish
- `cocktail_tag_definitions` — id, name, color, sort_order
- `cocktail_tags` — cocktail_id, tag_definition_id (PK: both)
- `cocktail_catalog` — id, name, description, sort_order (reference list of spirit/ingredient categories)
- `cocktail_settings` — singleton row (id=1), show_creator (boolean, default true)
- `batched_cocktail_items` — id, name, description, instructions, yield_amount, yield_unit, image_filename, linked_cocktail_ids (INTEGER[]), sort_order, created_at, updated_at
- `cocktail_submissions` — id, type ('new'|'change'), cocktail_id (nullable, for change requests), submitted_by_id, submitted_by_name, cocktail_name, description, status ('pending'|'reviewed'), created_at
- `crm_product_lines` — id, name, type ('beer'|'spirit'|'other'), sort_order
- `crm_activity_types` — id, name, sort_order
- `crm_contact_roles` — id, name, sort_order (e.g. Sales Staff, Sales Manager, Warehouse, Billing, Driver)
- `crm_distributors` — id, name, territory, notes, sort_order, created_at, updated_at
- `crm_distributor_contacts` — id, distributor_id (→ crm_distributors, cascade), name, title, phone, email, role_id (→ crm_contact_roles, SET NULL), is_primary, sort_order
- `crm_distributor_products` — distributor_id, product_line_id (PK: both)
- `crm_accounts` — id, name, type ('bar'|'restaurant'|'retail'|'hotel'|'other'), address, city, state, phone, email, contact_name, contact_title, distributor_id (→ crm_distributors, SET NULL), notes, sort_order, created_at, updated_at
- `crm_account_contacts` — id, account_id (→ crm_accounts, cascade), name, title, phone, email, is_primary, sort_order (multiple contacts per account)
- `crm_account_products` — account_id, product_line_id (PK: both)
- `crm_activities` — id, account_id (→ crm_accounts, cascade), activity_type_id (→ crm_activity_types, SET NULL), activity_date, contact_name, contact_title, samples (text, comma-joined product line names), notes, created_by_id, created_by_name, created_at, updated_at

- `prod_tanks` — id, name, capacity_bbl, active (bool), sort_order, created_at
- `prod_beers` — id, name, style (text, legacy), style_id (→ prod_beer_styles, nullable), color, status ('active'|'archived'), notes, created_at. No `sort_order` column — order by name.
- `prod_beer_styles` — id, name, color, sort_order
- `prod_tank_assignments` — id, beer_id (→ prod_beers), tank_id (→ prod_tanks), start_date (DATE), end_date (DATE, nullable), notes, created_by_id, created_at
- `prod_tasks` — id, beer_id, tank_id, date (DATE), task_type (text key), custom_note, assigned_user_ids (INTEGER[]), completed (bool), completed_by_id, completed_at, created_by_id, created_at. No `assignment_id` — tasks link to assignments via tank_id + beer_id + date range.
- `prod_style_task_presets` — id, style_id (→ prod_beer_styles), task_type, day_offset (INT)
- `prod_task_type_overrides` — key (TEXT PK), label, short, color, bg — stores user-customized display names/colors for the 13 built-in task types

### Roles
`admin`, `bar_manager`, `bartender`, `barista`, `coffee_manager`, `production`, `sales`, `hr`, `kitchen_manager`, `cook`

### Styling
Dark theme throughout. `tailwind.config.js` overrides three color families — do not use the Tailwind defaults for these:
- **`orange`**: overridden to `#F05A28` at `orange-500` (was `#FF6B00` / Tailwind default). All `orange-*` classes and inline `#F05A28` use this brand color.
- **`gray`**: overridden with zinc values (neutral/warm, no blue cast). All structural surfaces use `gray-*` classes.
- **`cream`** (`#F2EDE4`): custom color for page titles and "HQ" nav text (`text-cream`).
- **`midgray`** (`#636363`): custom color available for use.

Tailwind utility classes for layout/spacing; inline `style={{ color/backgroundColor: '#F05A28' }}` for dynamic brand color. Responsive design uses `sm:` breakpoint — mobile gets card layouts, desktop gets tables. Custom tool icons go in `client/public/icons/` as RGBA PNGs (256×256).

### File Uploads (Supabase Storage)
All uploads go to Supabase Storage private buckets. `multer.memoryStorage()` buffers the file, then `uploadToSupabase(bucket, filename, buffer, mimetype)` uploads it. Serving files uses `getSignedUrl(bucket, filename)` → `res.redirect(signedUrl)` (1-hour signed URLs). Buckets: `hr-documents`, `sop-documents`, `production-photos`, `recipe-photos`, `cocktail-photos`.

Recipe photos are served differently — the server downloads the file from Supabase Storage and streams the buffer directly back (no redirect), with MIME type inferred from file extension. This avoids cross-origin redirect issues with the `RecipeImg` authenticated fetch pattern.

Route ordering matters in `server/index.js`: `/api/production/photo/:filename` must be registered **before** `/api/production/:id`.

### pg DATE Type Parsing
`server/db.js` sets `types.setTypeParser(1082, val => val)` so PostgreSQL `DATE` columns come back as plain `'YYYY-MM-DD'` strings instead of JavaScript `Date` objects. Without this, dates JSON-serialize to ISO timestamps (`'2026-04-01T00:00:00.000Z'`) which break client date math that appends `'T12:00:00'`. This applies globally to all queries.

### Cross-Origin Authenticated Images
httpOnly cookies are not sent for cross-origin `<img>` sub-resource requests. Use the `PhotoImg` component pattern: `fetch(url, { credentials: 'include' })` → `.blob()` → `URL.createObjectURL()`, stored in state and revoked on unmount.

### Email
Nodemailer with Gmail SMTP (`smtp.gmail.com`, port 465). Credentials in `server/.env` as `EMAIL_USER` / `EMAIL_PASS` (Gmail App Password). The shared `sendLabelOrderEmail(overrides)` helper in `server/labelEmail.js` accepts optional quantity overrides.

### Recipes Tool
`Recipes.js` is split into two sections controlled by a `section` state (`'menu'|'prep'`):
- **Menu Items**: categories `brunch`, `shareables`, `flatbreads`, `specials` — defined in `MENU_CATS`
- **Prep**: category `prep` — displayed alphabetically in library view; manual sort_order in manage view

**Prep ↔ menu item linking** uses the `linked_recipe_ids INTEGER[]` column on both sides (bidirectional). `GET /api/recipes` joins names for all linked IDs and returns them as `linked_recipes: [{id, name}]`. The `PATCH /api/recipes/reorder` route must be registered **before** `PATCH /api/recipes/:id` to avoid Express matching `reorder` as an `:id`.

**Inline prep links**: `BulletedList` accepts `prepLinks` and `onViewRecipe` props. For menu items, ingredient lines that fuzzy-match a linked prep item's name render as clickable orange-tinted boxes that open the prep recipe detail. Fuzzy match: exact substring OR all significant words (4+ chars) from the prep name appear in the line.

**Auto-suggest on edit**: `RecipeModal` computes `autoMatchedIds` at init using the same fuzzy logic — prep items scan menu item ingredient text for their own name; menu items scan their own ingredients for prep item names. Auto-suggested items (not yet saved) show an orange `auto` badge in the checkbox list.

**Photo serving**: `GET /api/recipes/:id/photo` downloads from `recipe-photos` Supabase bucket and streams the buffer directly. The `RecipeImg` component uses `fetch(url, { credentials: 'include' }) → blob() → createObjectURL()` (same pattern as `PhotoImg`). Pass `bust={recipe.image_filename}` as a second `useEffect` dependency to force re-fetch when a photo is replaced on the same recipe.

### Cocktail Keeper Tool
`CocktailKeeper.js` manages cocktail recipes with two parallel hierarchies: **cocktails** and **house-made items** (batched syrups, infusions, juices, etc.).

**Tabs**: Cocktails | Syrups/Infusions | Manage (canUpload only)

**Cocktail categories** (controlled by `status` column, filter defaults to `'all'`):
- `menu` — currently on the menu
- `special` — rotating/seasonal specials
- `wip` — Work-In-Progress (suggestions and drafts)

**Syrups/Infusions ↔ cocktail linking** uses bidirectional arrays: `linked_batched_item_ids INTEGER[]` on cocktails, `linked_cocktail_ids INTEGER[]` on batched items. Same pattern as prep↔menu in Recipes. House-made chips in the cocktail detail view are clickable and navigate to that item.

**Suggestion flow**: View-only users (no `upload` permission) can click "Suggest a Cocktail" which opens the same `CocktailModal` with `isSuggestion=true`. The modal hides status/price/last_special_on/suggested_by_name and shows a "Work-In-Progress" badge. On submit, `POST /api/cocktails` checks manage permission internally — view-only users get `status='wip'` and `suggested_by_name=req.user.name` + `suggested_by_id=req.user.id` forced server-side. Managers can then edit/promote from the Manage → WIP tab.

**Ownership-based editing**: View-only users can edit cocktails they originally submitted (WIP only). The edit button is shown when `canUpload || cocktail.suggested_by_id === user?.id`. The `PATCH /api/cocktails/:id` endpoint uses `checkCocktailsView` and checks ownership server-side — non-managers who don't own the cocktail get 403. Non-managers cannot change `status`, `price`, `last_special_on`, or `suggested_by_name`.

**Recommend an Edit**: From the cocktail detail modal, view-only users see a "Recommend an Edit" button which opens `RecommendEditModal` — a focused text form that POSTs to `POST /api/cocktails/submissions` with `type='change'`.

**Submissions management**: Manage tab includes a Submissions sub-tab (with pending count badge) where managers can review/dismiss/delete suggestion submissions.

**Creator banner**: An orange diagonal ribbon in the top-right corner of each cocktail card shows the creator's name as "First L." format (e.g. "Sarah M."). The `formatCreatorName(name)` helper produces this format. Controlled by `cocktail_settings.show_creator` (toggled in Manage → Settings sub-tab). The detail modal also shows a creator banner using the same abbreviated name.

**Ingredient autocomplete**: `IngredientInput` component wraps the ingredient name field. Typing ≥ 1 character shows a fuzzy-matched dropdown. `fuzzyMatch(query, target)` uses subsequence matching (query chars must appear in order in target — e.g. `vdka` matches `Vodka`). On blur, if the typed value isn't an exact match but has fuzzy matches, a "Did you mean?" warning panel appears.

**Ingredient management**: Manage → Ingredients sub-tab renders `IngredientManager`. Lists all distinct ingredient names from `cocktail_ingredients`, searchable, multi-selectable. Selecting ≥ 2 shows a merge panel; `POST /api/cocktails/ingredients/merge` renames all matching rows to the canonical name.

**Route ordering** in `server/index.js`:
- `GET /api/cocktails/settings` and `GET /api/cocktails/ingredients` must be before `GET /api/cocktails/:id/photo`
- `PATCH /api/cocktails/reorder` must be before `PATCH /api/cocktails/:id`
- `PATCH /api/cocktails/batched/reorder` must be before `PATCH /api/cocktails/batched/:id`
- All `/api/cocktails/batched/*` and `/api/cocktails/submissions/*` routes must be before `/api/cocktails/:id`

**Manage sub-tabs**: Cocktails | Syrups/Infusions | Ingredients | Submissions | Settings

**Photo serving**: `GET /api/cocktails/:id/photo` streams buffer directly from `cocktail-photos` bucket (same pattern as recipe photos, no redirect). Uses `PhotoImg` component with auth fetch pattern.

**Permission middleware**: `checkCocktailsView` gates browse access; `checkCocktailsManage` gates edit/delete/reorder. The `POST /api/cocktails` endpoint uses `checkCocktailsView` and branches internally based on manage permission.

### Sales CRM Tool
`SalesCRM.js` manages distributor and account-level relationships for the sales team.

**Tabs**: Accounts | Distributors | Manage (`upload` only)

**Accounts** (full CRUD for `view` users): name, type, contact info, linked distributor, products carried, notes. Clicking an account opens `AccountDetail` — a single modal that shows contacts, account info, and the full activity history in one view (most recent activity first). No separate activity modal.

**Account contacts**: `AccountContactsSection` component within `AccountDetail`. Multiple contacts per account via `crm_account_contacts`. Both `view` and `upload` users can add/edit/delete account contacts.

**Account merge** (`upload` only): `MergeAccountModal` lets you pick a source account to merge into the current one. All activities, contacts, and product lines are moved; notes are appended; source account is deleted — all in a single transaction (`POST /api/crm/accounts/:id/merge`).

**Distributor auto-populate**: When typing a city into the account address field, `findDistributorForCity` checks each distributor's comma-separated `territory` field (case-insensitive) and pre-fills the distributor if there's a match.

**Activity logging**: Form captures activity type, date, who you talked to (`contact_name`), their position (`contact_title`), products tried/samples delivered (`samples`), and notes. The `samples` field is driven by toggle pill buttons — one per product line from `crm_product_lines` — and stored as a comma-joined string. Deleting an account requires `upload` permission; editing does not.

**Distributors** (browse for all; add/edit/delete for `upload` users): name, territory, notes, contacts (multiple per distributor with role category and is_primary flag), brands carried. The distributor detail view uses a `distDetailId` state (stores just the ID) — the full object is derived from the live `distributors` array so the detail modal auto-refreshes after contact changes. All phone numbers render as `tel:` links and are auto-formatted as `(XXX) XXX-XXXX` via the `formatPhone` helper.

**Distributor contacts**: `DistributorContactsSection` component. Both `view` and `upload` users can add/edit/delete contacts. Each contact has a `role_id` referencing `crm_contact_roles` (e.g. Sales Staff, Sales Manager, Warehouse, Billing, Driver).

**Manage tab** (`upload` only): Product Lines (name + type beer/spirit/other, drag-to-reorder), Activity Types, and Contact Roles — all fully editable reference lists.

**Location lookup**: "Find Locations Near Me" button uses the Overpass API to find nearby bars/restaurants. POST to `https://overpass-api.de/api/interpreter` with `Content-Type: application/x-www-form-urlencoded` and body `data=<encoded query>` (not raw body).

**Permission levels**:
- `view` — full CRUD on accounts, activities, account contacts, and distributor contacts
- `upload` — additionally: delete accounts, merge accounts, add/edit/delete distributors, access the Manage tab

**Route ordering** in `server/index.js`: all CRM routes follow the same middleware pattern — `checkCRMView` for account/activity/contact endpoints, `checkCRMManage` for distributor/product-line/activity-type/contact-role management. `POST /api/crm/accounts/:id/merge` uses `checkCRMManage`.

### Taproom Inspections — Real-Time Architecture
`TaproomInspections.js` is a multi-user bar inspection checklist. It uses a **split data pattern**:
- **All reads and writes** go through the OlogyHQ Express API (`/api/inspections`, `/api/inspections/:id/ratings`) — auth-gated like every other tool.
- **Live sync** uses `client/src/supabaseClient.js` — a Supabase JS client initialized with the OlogyHQ project's anon key, used only to subscribe to `postgres_changes` on `inspections` and `inspection_ratings`. The anon key is hardcoded (it's intentionally public; writes are still server-gated).

Both tables have RLS enabled with open policies and are published to `supabase_realtime`. Any write through the service-role Express API triggers WebSocket broadcasts to all subscribed clients.

### External Data
**Distro / Taproom Orders**: reads live from a Google Sheet via public CSV export URL. The server fetches and parses CSV on each request. PDF invoice links are Google Drive "anyone with link" URLs.

**Print invoices**: `GET /api/distro-orders/print-day?fileIds=id1,id2` downloads each PDF from `drive.usercontent.google.com/download?id=...&export=download&confirm=t` (returns `application/octet-stream`), merges with `pdf-lib`, and streams back a single `application/pdf`. The `binary` option in `serverless-http` config is required for this to work.

**Taproom Inventory import**: Google Sheet `1aJ2R6OEvO5ixG-AsWdJlRSIsiMczEBOi_pk9Ra8Xuu0`, one tab per location (Midtown, Power Mill, Northside, Tampa). Asterisks in counts mean "on tap" — stripped for numeric parsing.

### Production Schedule Tool
`ProductionSchedule.js` is a brewery tank scheduling board. All logic is in a single file (~1400 lines). Permission middleware: `checkProdView` / `checkProdManage`.

**Tabs**: Schedule | Tasks | Beers | Manage (`canUpload` only)

**Core data model**:
- `prod_tank_assignments` — a beer occupying a tank from `start_date` to `end_date`
- `prod_tasks` — individual brew tasks (brew, package, transfer, dry hop, etc.) tied to a tank + beer + date
- Tasks have no `assignment_id`; they're linked to assignments via matching `tank_id + beer_id` within the date range

**Task types**: 13 built-in types defined as `TASK_TYPES` constant (key, label, short, color, bg). Display names and colors can be customized per-installation via `prod_task_type_overrides` table. The main component loads overrides in `loadAll()`, merges with defaults, and threads the merged `taskTypes` array as a prop to every sub-component. Each sub-component derives its own `taskMap` via `useMemo`.

**Schedule grid** (`ScheduleGrid` component):
- HTML `<table>` with sticky header row and sticky date column
- `tableLayout: 'fixed'` with column widths calculated dynamically via `ResizeObserver` — tank columns fill the full container width (`overflowX: 'hidden'`)
- `ROW_H = 22px`, `DATE_W = 62px`; `colW` is computed state
- On the assignment start cell, if the primary task is `brew`, the beer name is shown instead of the "Brew" label
- Month boundaries get an indigo accent border row

**Drag and drop**: Mouse-based (`onMouseDown` + `document.addEventListener`). Three modes: `move_asgn` (drag whole assignment), `resize_asgn` (5px handle at bottom of last cell), `move_task` (drag individual task). Drag state shape: `{ mode, id, tankId, startDate, currentDate, currentTankId, originalStart, originalEnd }`. Uses `dragCommitted` ref to prevent double-firing on mouseup. Target cell detected via `document.elementFromPoint` reading `data-date` / `data-tank-id` attributes.

**Data loading**: `loadAll(showSpinner?)` fetches tanks, beers, users, grid data, styles, and task-type overrides in parallel. Only the initial mount call passes `showSpinner=true` — refreshes after saves/drags are silent (no loading flash). `loadGrid()` fetches only the visible window. `handleRefresh` calls both.

**Package task auto-end**: When a `package` task is created (`POST /tasks`) or moved/edited (`PATCH /tasks/:id`), the server finds the active assignment on that tank and sets its `end_date` to the package date, then deletes tasks scheduled after that date.

**Removing an assignment**: `DELETE /assignments/:id` fetches the assignment first, deletes all matching tasks (`tank_id + beer_id` within start/end range), then deletes the assignment row. `PATCH /assignments/:id` with an `end_date` trims tasks after that date.

**Beer styles and presets**: A style (`prod_beer_styles`) can have task presets (`prod_style_task_presets`, day_offset from brew day). When assigning a beer via `CellModal`, an "Apply style task presets" checkbox triggers `POST /assignments/:id/apply-presets` which creates tasks at `start_date + day_offset`.

**Manage sub-tabs**: Tanks | Beers | Styles | Tasks
- **Tasks sub-tab** (`TaskTypesTab` component): edits `prod_task_type_overrides` (label, short, bg color, text color per key). Keys are fixed — only display is customizable.
- **Beers sub-tab**: no free-text style field; only the style dropdown (linking to `prod_beer_styles`). Beer form sends only `name` and `style_id`.
- `manageTab` state is lifted to the parent `ProductionSchedule` component (not inside `ManageView`) so it survives `loadAll()` re-renders.

**Route ordering** in `server/index.js` for production-schedule routes:
- `GET /api/production-schedule/task-types` and all style/preset routes before `/:id` catch-alls
- `POST /api/production-schedule/assignments/:id/shift` and `/apply-presets` before `PATCH /assignments/:id`
