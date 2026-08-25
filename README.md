# IMAP Bangladesh – Intelligent Multi-Service Assistance Platform

> **Live:** https://hasib61714.github.io/imap-bangladesh/  |  **API:** https://imap-backend-mghb.onrender.com

IMAP is an AI-powered multi-service marketplace designed to simplify daily life in Bangladesh by connecting users with verified service providers through a secure and intelligent platform.

This platform integrates emergency support, household services, professional assistance, and smart AI-based provider matching.

---

## 🌟 Key Features

### 🔹 User Features
- Phone OTP authentication
- Smart service search & filtering
- AI-based provider recommendations
- Live provider tracking (GPS)
- Real-time chat & communication
- Secure online payments (bKash/Nagad/Card)
- Digital receipts & service history
- Ratings & reviews
- Emergency service booking
- Bengali-friendly interface

### 🔹 Provider Features
- Provider registration & document verification
- Booking management (accept/reject)
- Earnings dashboard & analytics
- Service & pricing management
- Real-time notifications
- Verified provider badge

### 🔹 Admin Features
- Provider approval & KYC verification
- Platform monitoring & analytics
- Dispute resolution system
- Category & content management

### 🔹 Emergency Services
- Ambulance & medical assistance
- Emergency electrician & plumbing
- Oxygen & blood donor support
- 🚗 Emergency car mechanic & roadside assistance

---

## 🧠 AI & Smart Modules
- Intelligent provider ranking
- Smart suggestions & recommendations
- Emergency priority dispatch
- Disaster & blood donor support

---

## 🛠 Tech Stack

### Frontend
- React.js + Vite
- Progressive Web App (PWA)
- Responsive mobile-first UI (Bengali + English)
- Ant Design (Admin Panel)

### Backend
- Node.js + Express.js
- REST API + Socket.io (real-time chat & tracking)
- JWT Authentication
- Helmet (security headers) + express-rate-limit

### Database
- MySQL 8+ / TiDB Serverless (InnoDB, utf8mb4)
- Forward-only migrations in `backend/migrations/`, applied with `npm run db:migrate`

---

## 📁 Project Structure
```
imap-app/
├── backend/
│   ├── routes/          # All API route files
│   ├── middleware/       # auth.js JWT middleware
│   ├── scripts/          # initDb.js, checkLogin.js
│   ├── server.js         # Express + Socket.io entry
│   ├── db.js             # MySQL pool
│   ├── schema.sql        # Full database schema
│   └── .env.example      # Environment template
└── frontend/
    ├── src/
    │   ├── App.jsx        # Main app (all user pages)
    │   ├── api.js         # API client
    │   ├── pages/         # AdminPanel, ProviderPortal, KYCPage, AuthPage
    │   └── constants/     # theme, translations, data
    ├── public/            # PWA manifest, service worker, icons
    └── .env.example       # Frontend environment template
```

---

## ⚙️ Local Development Setup

### Prerequisites
- Node.js 18+
- MySQL 8+
- XAMPP / MySQL server running

### 1. Database Setup
```bash
mysql -u root -p < backend/schema.sql
```

### 2. Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Edit .env — set DB_PASSWORD, JWT_SECRET, etc.
npm run dev       # nodemon (hot reload)
# or
npm start         # plain node
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev       # http://localhost:5173
```

### 4. Apply Migrations
```bash
cd backend
npm run db:migrate          # apply pending migrations
npm run db:migrate:status   # show applied / pending
```

### Create the Administrator Account
No administrator is seeded any more — the previous `admin123` default was a
published credential (see `docs/audit/SECURITY-GAPS.md` P0-9).

```bash
cd backend
ADMIN_BOOTSTRAP_EMAIL=you@example.com npm run admin:reset
# prints a generated password once, or set ADMIN_BOOTSTRAP_PASSWORD yourself
```

### Run the Tests
```bash
cd backend
npm test        # P0 security regression suite (node:test, no extra deps)
```

---

## 🚀 Production Deployment

### 1. Set Environment Variables
Edit `backend/.env`:
```env
NODE_ENV=production
PORT=5000
DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_strong_password
DB_NAME=imap_db
JWT_SECRET=<64-char random hex — run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
JWT_EXPIRES_IN=7d
FRONTEND_URL=https://yourdomain.com
GEMINI_API_KEY=optional
```

### 2. Build Frontend
```bash
cd frontend
cp .env.example .env.production
# Edit .env.production — set VITE_API_URL=https://api.yourdomain.com/api
npm run build     # outputs to frontend/dist/
```

### 3. Serve with Nginx (recommended)
```nginx
# Backend API
server {
    listen 443 ssl;
    server_name api.yourdomain.com;
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
# Frontend static files
server {
    listen 443 ssl;
    server_name yourdomain.com;
    root /var/www/imap/frontend/dist;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
}
```

### 4. Run Backend with PM2
```bash
npm install -g pm2
cd backend
pm2 start server.js --name imap-backend
pm2 save
pm2 startup
```

### 5. SSL/HTTPS
```bash
# Free SSL with Certbot
sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com
```

---

## 🔐 Security

**Do not treat this section as an assurance.** A full audit is in
[`docs/audit/`](docs/audit/). The previous version of this checklist implied a
posture the code did not have — it claimed "JWT authentication on all protected
routes" while several endpoints were unauthenticated, and while a password-less
account accepted any password.

**Current state:** Phase 0 found 12 P0 and 18 P1 findings. Phase 0.5 contained
the P0 set — see
[`docs/audit/PHASE-0.5-SECURITY-REGRESSION.md`](docs/audit/PHASE-0.5-SECURITY-REGRESSION.md)
for what was fixed, how it was verified, and what risk remains.

Controls that are in place and verified by `npm test`:

- Password login fails closed when no password hash is stored
- Unverified social login is disabled (410); Google sign-in verifies the ID token and audience
- Booking prices, fees and totals are computed server-side — client values are ignored
- Negative / `NaN` / `Infinity` money values are rejected at every financial entry point
- Booking and loan state transitions are guarded, so financial side effects run once
- Money paths run inside database transactions with unique ledger references
- An unconfigured payment gateway returns 503 in production; it never credits a wallet
- Socket booking rooms require verified participation; SOS alerts go to a DB-verified admin room
- No administrator or demo credential is seeded — see "Create the Administrator Account"

Standing controls (present before this phase): bcrypt hashing, Helmet headers,
rate limiting, parameterised queries, CORS allow-list, `express-validator`,
TLS in production.

**Known open items** are listed in the regression report — the largest are
Content-Security-Policy (disabled), in-process OTP/cache state (blocks
horizontal scaling), and KYC images stored as base64 in the primary database.

---

## 🌐 Deployed Infrastructure

| Layer | Platform | URL |
|-------|----------|-----|
| Frontend | GitHub Pages | https://hasib61714.github.io/imap-bangladesh/ |
| Backend API | Render (Node.js) | https://imap-backend-mghb.onrender.com |
| Database | TiDB Serverless (MySQL-compatible) | Render env vars |

> **Note:** The Render free tier spins down after inactivity. The frontend automatically wakes the backend on first load (`wakeBackend()` in `main.jsx`).