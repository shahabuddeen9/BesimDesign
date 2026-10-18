# Besim Design & Commercial Interiors

> A full-stack web application, interactive space & budget estimation engine, automated lead qualification system, and administration portal built for **Besim Design** — specializing in commercial, hospitality (fine dining restaurants, boutique hotels, speakeasy bars), and pre-engineered industrial facilities.

---

## Table of Contents
1. [Architecture Overview & Tech Stack](#architecture-overview--tech-stack)
2. [Local Setup & Getting Started](#local-setup--getting-started)
3. [Configuring Email (Gmail App Password)](#configuring-email-gmail-app-password)
4. [Creating & Managing the Admin Account](#creating--managing-the-admin-account)
5. [Using the Admin Dashboard](#using-the-admin-dashboard)
6. [Replacing Images & Company Assets](#replacing-images--company-assets)
7. [Deploying to Render or Railway](#deploying-to-render-or-railway)
8. [Switching from SQLite to PostgreSQL](#switching-from-sqlite-to-postgresql)
9. [Pre-Launch Master Checklists](#pre-launch-master-checklists)

---

## 1. Architecture Overview & Tech Stack

- **Frontend**: Vanilla HTML5, modern semantic CSS3, and ES6+ JavaScript. Designed with architectural typography (*Cinzel* & *Plus Jakarta Sans*), responsive grid layouts, embedded static fallbacks, and real-time interactive calculations.
- **Backend**: Node.js 20+ with Express 4. Strict request body limits (10kb), centralized production-safe error handler, and Morgan request logging.
- **Database**: SQLite with parameterized SQL queries strictly encapsulated in `/server/db/`. Runs zero-native-build file persistence with automatic disk synchronization and migration runners.
- **Security & Privacy**:
  - Helmet with customized Content Security Policy (CSP).
  - Cross-Origin Resource Sharing (CORS) restricted to `ALLOWED_ORIGIN`.
  - Rate limiting via `express-rate-limit` (5 enquiries/hr/IP, 5 login attempts/15min, 100 general requests/15min).
  - Indian **Digital Personal Data Protection (DPDP) Act 2023** compliance: Client IP addresses are stored only as one-way salted SHA-256 hashes (`IP_HASH_SALT`). Raw IPs are never persisted.
  - JWT authentication stored in `httpOnly`, `SameSite=Strict`, `Secure` cookies with 7-day expiration.
  - Honeypot anti-spam field (`website_url_hp`) discarding bot submissions without user friction.
- **Communications**: Nodemailer SMTP service with asynchronous dual-dispatch (alerting firm partners at `msfusionarchitects@gmail.com` and `besimdesigne@gmail.com` while sending prospective clients an automated acknowledgment).
- **Asset Uploads**: Multer image processing strictly filtered for JPG, PNG, and WebP formats up to 5 MB with cryptographically randomized filenames.
- **Automated Testing**: Vitest and Supertest automated test suite covering validation, phone format enforcement, DPDP consent, rate limits, authentication, and project CRUD.

---

## 2. Local Setup & Getting Started

### Prerequisites
- Node.js 20.x or higher
- npm (v9+) or bun

### 1. Clone & Install Dependencies
```bash
git clone <repository-url>
cd ms-fusion-architects
npm install
```

### 2. Configure Environment Variables
Copy the template file to `.env`:
```bash
cp .env.example .env
```
Edit `.env` and configure your local settings.

### 3. Seed Database
Run the seed script to initialize tables, create the administrator account, and load sample projects, testimonials, and FAQs:
```bash
npm run seed
```

### 4. Start the Application
- **Development Mode**:
  ```bash
  npm run dev
  ```
- **Production Mode** (single command serves frontend & backend API):
  ```bash
  npm start
  ```
- **Run Automated Tests**:
  ```bash
  npm test
  ```

---

## 3. Configuring Email (Gmail App Password)

MS Fusion Architects automatically notifies firm partners and confirms inquiries with prospective clients. To connect with a Gmail address:

1. Log into your Google Account for **msfusionarchitects@gmail.com**.
2. Navigate to [Google Account Security](https://myaccount.google.com/security).
3. Ensure **2-Step Verification** is turned **ON**.
4. In the search box at the top, type **"App passwords"** (or go to [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)).
5. Under "App name", enter **MS Fusion Website** and click **Create**.
6. Google will generate a **16-character code** (e.g., `abcd efgh ijkl mnop`).
7. Copy this code into your `.env` file without spaces:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=msfusionarchitects@gmail.com
   SMTP_PASS=abcdefghijklmnop
   NOTIFY_EMAILS=msfusionarchitects@gmail.com,besimdesigne@gmail.com
   ```
*Note: If SMTP credentials are left blank, the application will operate normally and log email notifications to the console without interrupting lead capture.*

---

## 4. Creating & Managing the Admin Account

### Initial Admin Creation
When you run `npm run seed` or when the server boots with an empty database, it reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from your `.env` and generates a secure password hash using `bcryptjs` with cost factor 12.

### Production Security Rule
If `NODE_ENV=production`, the seed script will **refuse to run** if `ADMIN_PASSWORD` is left at the default `AdminPass123!`. You must supply a strong, unique password in `.env`.

To manually trigger a re-seed or update:
```bash
npm run seed
```

---

## 5. Using the Admin Dashboard

Access the administration portal by visiting:
```
http://localhost:3000/admin/login.html
```
(On production, replace `localhost:3000` with your deployed domain).

### Dashboard Features:
1. **CRM Enquiries & Leads**:
   - Real-time KPI cards: Total leads, weekly influx, pipeline conversion, and download counter.
   - Filter leads by Pipeline Status (`New`, `Contacted`, `Quoted`, `Won`, `Lost`) and Source (`Contact Form`, `Calculator`, `Quote Request`).
   - Live debounced search across client names, phone numbers, emails, and project cities.
   - Quick in-table status dropdown to progress leads through your pipeline.
   - Click **"Notes"** on any enquiry to inspect the client's detailed message, see their exact calculator parameters (budget, area, tier), and log call records.
   - Click **"📥 Export RFC 4180 CSV"** to export your filtered lead database directly into Excel or Google Sheets.
2. **Projects Portfolio**:
   - Add new architecture projects with title, auto-slug, sector category, architectural narrative, deliverables scope, and gallery URLs.
   - Upload cover photos directly from your computer (automatically stored in `/uploads/`).
   - Toggle visibility between `Live` and `Draft`.
3. **Client Testimonials & FAQs**:
   - Manage commercial client reviews and star ratings.
   - Add and update statutory clearance, MEP, and turnaround guidance.

---

## 6. Replacing Images & Company Assets

1. **Company Profile Deck (PDF)**:
   - Place your official credentials deck at:
     ```
     /public/assets/company-profile.pdf
     ```
   - When visitors click "Profile PDF" in the navbar, `/api/download/company-profile` records the download in the database and streams this file.
2. **Project Portfolio Photography**:
   - High-resolution architectural photography can either be uploaded via the Admin Portal (+ Add Architecture Project > Choose File) or hosted on a CDN / Unsplash.
3. **Hero Photography**:
   - Update `heroImage` in `/public/index.html` (line 64) with your flagship completed property.

---

## 7. Deploying to Render or Railway

### Deploying to Render
1. Create a new **Web Service** connected to your repository.
2. Select **Node** environment.
3. Set the following build and start commands:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. Add **Persistent Disk**:
   - Go to **Disks** in your Render dashboard.
   - Mount Path: `/app/server/db` (Size: 1 GB).
   - Add a second disk or mount `/app/uploads` (Size: 5 GB) to ensure database records and uploaded images survive deployments.
5. In **Environment Variables**, set:
   - `NODE_ENV`: `production`
   - `PORT`: `10000` (or `3000`)
   - `JWT_SECRET`: *(Generate a 32+ character random secret)*
   - `ADMIN_EMAIL`: `your-email@msfusion.com`
   - `ADMIN_PASSWORD`: *(Strong production password)*
   - `SMTP_USER` & `SMTP_PASS`: *(Your Gmail App Password)*
   - `IP_HASH_SALT`: *(Random salt string)*
   - `ALLOWED_ORIGIN`: `https://your-service.onrender.com`
   - `DB_PATH`: `/app/server/db/fusion.db`

### Deploying to Railway
1. Click **New Project** > **Deploy from GitHub repo**.
2. Go to **Settings** > **Volumes** and add persistent volume mounted to `/app/server/db` and `/app/uploads`.
3. Set the environment variables in Railway's Variables tab.
4. Railway will automatically detect the `Dockerfile` and launch `npm start`.

---

## 8. Switching from SQLite to PostgreSQL

All database queries are strictly encapsulated in `/server/db/index.js` and `/server/db/schema.sql`. If your firm scales to PostgreSQL (e.g. AWS RDS, Neon, Supabase):

1. Install pg client:
   ```bash
   npm install pg
   ```
2. In `/server/config/env.js`, add `DATABASE_URL`:
   ```javascript
   DATABASE_URL: z.string().optional()
   ```
3. Convert `/server/db/schema.sql` syntax (`INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`, `datetime('now')` → `NOW()`).
4. Replace the query runner in `/server/db/index.js` with `new Pool({ connectionString: env.DATABASE_URL })`.
*Because controllers call `db.prepare(sql).all()` and `db.prepare(sql).run()`, swapping the driver does not require touching controller logic.*

---

## 9. Pre-Launch Master Checklists

### Checklist 1: Variables to Set (.env)
- [ ] `NODE_ENV=production`
- [ ] `PORT=3000`
- [ ] `JWT_SECRET` generated with at least 32 cryptographically random characters
- [ ] `ADMIN_EMAIL` configured with firm principal's address
- [ ] `ADMIN_PASSWORD` changed from default
- [ ] `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`
- [ ] `SMTP_USER` configured with Gmail sender
- [ ] `SMTP_PASS` configured with valid 16-character Google App Password
- [ ] `NOTIFY_EMAILS=msfusionarchitects@gmail.com,besimdesigne@gmail.com`
- [ ] `IP_HASH_SALT` populated with a unique private salt string
- [ ] `ALLOWED_ORIGIN` set to your live production domain (e.g., `https://msfusion.com`)

### Checklist 2: Content to Confirm with Client
- [ ] Confirm official office addresses in Delhi NCR, Bengaluru, Mumbai, and Goa.
- [ ] Confirm primary contact phone numbers displayed in footer and inquiry emails.
- [ ] Confirm cost estimation benchmarks per sq.ft in the Space & Budget Estimator (Restaurants: ₹2,400–₹3,800, Hotels: ₹3,800–₹6,200, Bars: ₹2,800–₹4,500, Industrial: ₹1,400–₹2,200).
- [ ] Review deliverables list in the Turnkey Workflow (01–04) with the MEP engineering team.
- [ ] Confirm Data Grievance Officer email in `/public/privacy.html`.

### Checklist 3: Images to Replace
- [ ] Replace `/public/assets/company-profile.pdf` with MS Fusion Architects' official PDF deck.
- [ ] Replace `heroImage` with high-resolution photography of a flagship finished project.
- [ ] Upload real completed restaurant, hotel, bar, and industrial photos via the Admin Dashboard.
- [ ] Replace browser favicon `/favicon.ico` with MS Fusion brand icon.

### Checklist 4: Pre-Launch Security & Quality Check
- [ ] Run automated test suite (`npm test`) — verify all 24 tests pass.
- [ ] Verify `noindex` tag is present on `/admin/login.html` and `/admin/dashboard.html`.
- [ ] Verify `/robots.txt` disallows `/admin/` and `/api/`.
- [ ] Attempt test submission on the consultation form — verify client acknowledgment email arrives and internal alert arrives with `Reply-To` set to client.
- [ ] Verify test submission with invalid phone number is rejected.
- [ ] Verify honeypot field prevents automated bot spam.
- [ ] Verify password brute force limiter triggers on 6th failed attempt.
- [ ] Verify `/api/admin/enquiries/export.csv` downloads clean RFC 4180 formatted CSV data.
