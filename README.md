# 🚀 IMAP – Intelligent Multi-Service Assistance Platform

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
- MySQL 8+ (InnoDB, utf8mb4)

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

### Create Admin Account
```bash
cd backend
node scripts/initDb.js
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

## 🔐 Security Checklist

- [x] `.env` is in `.gitignore` — never committed to git
- [x] JWT authentication on all protected routes
- [x] bcrypt password hashing
- [x] Helmet security headers (HSTS, X-Frame-Options, etc.)
- [x] Rate limiting: 200 req/15min general, 20 req/15min for auth
- [x] CORS restricted to `FRONTEND_URL` in production
- [x] Input validation with express-validator
- [x] SQL injection protection via parameterized queries
- [ ] Enable HTTPS in production
- [ ] Use strong random JWT_SECRET (64+ chars)