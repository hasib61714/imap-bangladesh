<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:6E40C9,50:A855F7,100:06B6D4&height=200&section=header&text=IMAP%20Bangladesh&fontSize=48&fontColor=fff&animation=fadeIn&fontAlignY=38&desc=AI-Powered%20Multi-Service%20Marketplace%20for%20Bangladesh&descAlignY=58&descSize=18" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/hasib61714/imap-bangladesh/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge" alt="License: MIT" />
  </a>
  <a href="https://github.com/hasib61714/imap-bangladesh/stargazers">
    <img src="https://img.shields.io/github/stars/hasib61714/imap-bangladesh?style=for-the-badge&color=A855F7" alt="Stars" />
  </a>
  <a href="https://github.com/hasib61714/imap-bangladesh/network/members">
    <img src="https://img.shields.io/github/forks/hasib61714/imap-bangladesh?style=for-the-badge&color=06B6D4" alt="Forks" />
  </a>
</p>

---

## About

**IMAP Bangladesh** is an AI-powered multi-service marketplace that connects citizens across all **64 districts of Bangladesh** with verified local service providers. Whether you need emergency assistance, household repairs, or professional services, IMAP intelligently matches you with the right provider nearby. The platform features live GPS tracking, real-time chat, and AI-driven recommendations — all secured through phone OTP authentication.

---

## Features

- **Multi-Category Services** — Emergency, household, and professional service categories under one roof
- **Verified Provider Network** — All service providers go through a verification process before listing
- **Phone OTP Authentication** — Frictionless, passwordless login via SMS one-time password
- **Live GPS Tracking** — Real-time map view of service provider location while en route
- **Real-Time Chat** — Instant messaging between users and providers powered by Socket.io
- **AI Service Recommendations** — Smart suggestions based on location, history, and service type
- **Nationwide Coverage** — Supports all 64 districts of Bangladesh
- **Provider Dashboard** — Providers can manage availability, bookings, and earnings

---

## Tech Stack

<p align="center">
  <a href="https://skillicons.dev">
    <img src="https://skillicons.dev/icons?i=javascript,nodejs,express,mysql,react,redis&theme=dark" />
  </a>
</p>

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Database | MySQL 8 / TiDB Cloud (mysql2) |
| Cache / Scaling | Redis (ioredis) — optional, in-memory fallback |
| Real-Time | Socket.io |
| Frontend | React 18 + Vite + Ant Design |
| Maps & GPS | Leaflet + OpenStreetMap |
| Payments | SSLCommerz |
| Storage | Cloudflare R2 / AWS S3 |
| Auth | JWT + refresh rotation, Phone OTP, Google |
| Language | JavaScript (ES2022) |

---

## Getting Started

### Prerequisites

- Node.js >= 18 & npm
- MySQL 8 (local) or a TiDB Cloud cluster
- Redis (optional — only needed for multi-instance scaling)
- SMS gateway credentials (optional — OTP runs in mock mode by default)

### Installation

```bash
# Clone the repository
git clone https://github.com/hasib61714/imap-bangladesh.git
cd imap-bangladesh

# Install backend dependencies
cd backend && npm install

# Configure environment
cp .env.example .env
# Fill in: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET (see .env.example)

# Create the schema, then start
npm run migrate
npm run dev
```

### Usage

```bash
# Run in development mode
npm run dev

# Run in production mode
npm start
```

Server starts at [http://localhost:5000](http://localhost:5000). Socket.io connects on the same port.

---

## Project Structure

```
imap-bangladesh/
├── controllers/
│   ├── authController.js
│   ├── serviceController.js
│   └── chatController.js
├── models/
│   ├── User.js
│   ├── Provider.js
│   └── Booking.js
├── routes/
├── socket/
│   └── chatHandler.js
├── middleware/
└── server.js
```

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

---

## License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:06B6D4,50:A855F7,100:6E40C9&height=120&section=footer" width="100%" />
</p>

<p align="center">
  Made with dedication by <a href="https://github.com/hasib61714">Md. Hasibul Hasan</a>
</p>
