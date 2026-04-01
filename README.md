# 🛡️ CyberBuddy — AI-Powered Cybersecurity Education Platform

<div align="center">

![CyberBuddy Logo](public/favicon.svg)

**CyberBuddy** is an AI-powered cybersecurity education platform built for students across Africa.
It combines an intelligent chatbot, daily quizzes, scam detection tools, and a website security scanner
into one accessible, mobile-friendly web application.
Link to my platform:https://cyberbuddy-2.onrender.com/

[![Live Demo](https://img.shields.io/badge/Live-Demo-00f5ff?style=for-the-badge)](https://cyberbuddy.onrender.com)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green?style=for-the-badge&logo=node.js)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-blue?style=for-the-badge&logo=postgresql)](https://neon.tech)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

</div>

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Quick Start (Local)](#-quick-start-local)
- [Environment Variables](#-environment-variables)
- [Project Structure](#-project-structure)
- [Pages & Routes](#-pages--routes)
- [API Reference](#-api-reference)
- [Deployment](#-deployment)
- [Admin Dashboard](#-admin-dashboard)
- [Premium Features](#-premium-features)
- [Screenshots](#-screenshots)
- [Author](#-author)

---

## ✨ Features

| Feature | Free | Premium |
|---------|------|---------|
| 💬 AI Cybersecurity Chat | 10 msgs/day | Unlimited |
| 🎯 Daily Quiz + Points | ✅ | ✅ |
| 🏆 Leaderboard & Badges | ✅ | ✅ |
| 👤 User Profile | ✅ | ✅ |
| 📸 Image Scam Detector | 2 free scans | Unlimited |
| 🔍 Website Security Scanner | 2 free scans | Unlimited |
| 🏅 Prize Quizzes | ❌ | ✅ |
| 📧 Email Notifications | ✅ | ✅ |

---

## 🛠 Tech Stack

- **Backend:** Node.js + Express.js
- **Database:** PostgreSQL (via [Neon](https://neon.tech) cloud)
- **AI Chat:** [Groq](https://console.groq.com) — LLaMA 3.3 70B (free)
- **Image Scan:** [Anthropic Claude](https://console.anthropic.com) Vision API
- **Payments:** Flutterwave (MoMo + Bank Cards)
- **Email:** Brevo SMTP / Gmail
- **Auth:** Express-session + bcryptjs + Google OAuth
- **Sessions:** PostgreSQL (connect-pg-simple)
- **Hosting:** Render.com
- **Security:** Helmet.js + Rate limiting + Input sanitization

---

## 📦 Prerequisites

Make sure you have these installed on your computer:

- **Node.js** v18 or higher → [Download here](https://nodejs.org)
- **npm** (comes with Node.js)
- **Git** → [Download here](https://git-scm.com)
- A **PostgreSQL database** → Free at [neon.tech](https://neon.tech)
- A **Groq API key** → Free at [console.groq.com](https://console.groq.com)

---

## 🚀 Quick Start (Local)

Follow these steps to run CyberBuddy on your local machine:

### Step 1 — Clone the repository

```bash
git clone https://github.com/placide220/cyberbuddy.git
cd cyberbuddy
```

### Step 2 — Install dependencies

```bash
npm install
```

### Step 3 — Set up environment variables

Copy the example env file:

```bash
cp .env.example .env
```

Now open `.env` in any text editor and fill in your values:

```bash
# On Windows
notepad .env

# On Mac/Linux
nano .env
```

The minimum required variables to get started:

```env
DATABASE_URL=postgresql://neondb_owner:npg_37XmQahJnPey@ep-fancy-silence-a4jxk23h-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
GROQ_API_KEY=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
ANTHROPIC_API_KEY=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
SESSION_SECRET=any_long_random_string
APP_URL=http://localhost:3000
```

See the full [Environment Variables](#-environment-variables) section below for all options.

### Step 4 — Set up the database

The database tables are created automatically when the app starts. Just make sure your `DATABASE_URL` is correct.

To get a free PostgreSQL database:
1. Go to [neon.tech](https://neon.tech) → Create account
2. Create a new project → copy the connection string
3. Paste it as `DATABASE_URL` in your `.env`

### Step 5 — Start the app

```bash
npm start
```

You should see:

```
╔══════════════════════════════════════════╗
║   CyberBuddy v5.0 — Business Edition    ║
║   http://localhost:3000                 ║
║   /api/test — check all services        ║
╚══════════════════════════════════════════╝
```

### Step 6 — Open in browser

```
http://localhost:3000
```

Register a new account and start exploring! 🎉

---

## 🔐 Environment Variables

Create a `.env` file in the root directory with these variables:

```env
# ── SERVER ──────────────────────────────────────────────────────
PORT=3000
NODE_ENV=development
SESSION_SECRET=change_this_to_any_long_random_string

# ── DATABASE (Required) ──────────────────────────────────────────
# Get free PostgreSQL at: neon.tech
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# ── AI CHAT (Required) ───────────────────────────────────────────
# Get free API key at: console.groq.com
GROQ_API_KEY=gsk_your_key_here

# ── IMAGE SCANNING (Optional) ────────────────────────────────────
# Get API key at: console.anthropic.com
ANTHROPIC_API_KEY=sk-ant-your_key_here

# ── EMAIL — Option A: Brevo (Recommended for production) ─────────
# Get free SMTP at: brevo.com → SMTP & API → SMTP
BREVO_LOGIN=your@email.com
BREVO_SMTP_KEY=your_brevo_smtp_key

# ── EMAIL — Option B: Gmail ───────────────────────────────────────
# Enable 2FA on Gmail → App Passwords → create one
GMAIL_USER=your@gmail.com
GMAIL_PASS=xxxx xxxx xxxx xxxx

# ── PAYMENTS (Optional) ───────────────────────────────────────────
# Get keys at: flutterwave.com
FLW_PUBLIC_KEY=your_flw_public_key
FLW_SECRET_KEY=your_flw_secret_key

# ── GOOGLE LOGIN (Optional) ───────────────────────────────────────
# Get at: console.cloud.google.com → APIs & Services → Credentials
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# ── APP ───────────────────────────────────────────────────────────
APP_URL=http://localhost:3000
APP_NAME=CyberBuddy
PREMIUM_PRICE_USD=2

# ── FREE TIER LIMITS ─────────────────────────────────────────────
FREE_CHAT_LIMIT=10
FREE_SCAN_LIMIT=2
FREE_SCANNER_LIMIT=2

# ── ADMIN DASHBOARD ───────────────────────────────────────────────
ADMIN_EMAIL=your@email.com
ADMIN_PASSWORD=your_secure_admin_password
```

> ⚠️ **Never commit your `.env` file to GitHub!** It is already in `.gitignore`.

---

## 📁 Project Structure

```
cyberbuddy/
├── server.js           # Main Express server — all API routes
├── db.js               # PostgreSQL database connection & schema
├── email.js            # Email service (Brevo/Gmail)
├── scanner.js          # Website security scanner module
├── logger.js           # Winston logger
├── package.json        # Dependencies
├── .env.example        # Environment variables template
├── .gitignore          # Git ignore rules
│
└── public/             # Frontend HTML pages
    ├── login.html          # Login page
    ├── register.html       # Registration page
    ├── chat.html           # AI chat interface
    ├── quiz.html           # Daily quiz
    ├── profile.html        # User profile & badges
    ├── leaderboard.html    # Top players
    ├── scan.html           # Image scam detector
    ├── scanner.html        # Website security scanner
    ├── pricing.html        # Premium upgrade page
    ├── admin.html          # Admin dashboard
    ├── forgot-password.html
    ├── reset-password.html
    ├── terms.html          # Terms of Service
    ├── privacy.html        # Privacy Policy
    └── 404.html            # Not found page
```

---

## 🌐 Pages & Routes

| URL | Page | Access |
|-----|------|--------|
| `/` | Login | Public |
| `/register` | Create Account | Public |
| `/chat` | AI Chat | Logged in |
| `/quiz` | Daily Quiz | Logged in |
| `/profile` | User Profile | Logged in |
| `/leaderboard` | Leaderboard | Logged in |
| `/scan` | Image Scanner | Logged in (2 free) |
| `/scanner` | Website Scanner | Logged in (2 free) |
| `/pricing` | Upgrade Premium | Logged in |
| `/forgot-password` | Reset Password | Public |
| `/terms` | Terms of Service | Public |
| `/privacy` | Privacy Policy | Public |
| `/admin-cb2026` | Admin Dashboard | Admin only |

---

## 📡 API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create new account |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password with token |
| POST | `/api/auth/change-password` | Change password |

### Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Send message to AI |
| GET | `/api/history/conversations` | Get chat history |
| DELETE | `/api/history/conversations/:id` | Delete conversation |

### Quiz
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/quizzes` | Get available quizzes |
| POST | `/api/quizzes/:id/start` | Start a quiz |
| POST | `/api/quizzes/attempts/:id/submit` | Submit quiz answers |

### Scanning
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/scan` | Scan images for scams |
| POST | `/api/scanner/scan` | Scan website URL |
| GET | `/api/scanner/history` | Get scan history |

### Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/leaderboard` | Get top players |
| GET | `/api/profile` | Get user profile |
| GET | `/api/premium/status` | Get premium status |
| GET | `/api/test` | Check all services status |

---

## ☁️ Deployment

### Deploy on Render (Recommended — Free)

1. Fork or push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repository
4. Set these settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free
5. Add all environment variables in the **Environment** tab
6. Click **Create Web Service**

Render will automatically deploy on every `git push` to main! ✅

### Deploy on Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

### Deploy on AWS EC2

```bash
# SSH into your EC2 instance
ssh -i your-key.pem ubuntu@your-ip

# Clone and setup
git clone https://github.com/placide220/cyberbuddy.git
cd cyberbuddy
npm install
cp .env.example .env
nano .env  # fill in your values

# Start with PM2
npm install -g pm2
pm2 start server.js --name cyberbuddy
pm2 startup
pm2 save
```

---

## ⚙️ Admin Dashboard

The admin dashboard is hidden from regular users for security.

**Access URL:** `https://yoursite.com/admin-cb2026`

**Login with:**
- Email: value of `ADMIN_EMAIL` in your `.env`
- Password: value of `ADMIN_PASSWORD` in your `.env`

**Admin features:**
- 📊 View all users & their stats
- 💳 View payment history & revenue
- 🏆 See prize quiz winners
- ➕ Create new quizzes with prizes
- 📈 Monitor platform analytics

---

## ⭐ Premium Features

Users can upgrade to Premium for **$2/month** via MTN MoMo or bank card.

**Premium unlocks:**
- ♾️ Unlimited AI chat messages
- 📸 Unlimited image scam scanning
- 🔍 Unlimited website security scanning
- 🏆 Access to prize quizzes (win real money!)
- 🎖️ Priority leaderboard badge

**Free tier includes:**
- 10 AI chat messages per day
- 2 image scans total
- 2 website scans total
- All daily quizzes
- Points, badges & leaderboard

---

## 🗄️ Database Schema

CyberBuddy uses PostgreSQL with these main tables:

- `users` — user accounts, points, premium status
- `conversations` — chat conversation groups
- `messages` — individual chat messages
- `quizzes` — quiz definitions with prizes
- `questions` — quiz questions & answers
- `quiz_attempts` — user quiz submissions
- `rewards` — badge definitions
- `user_rewards` — earned badges
- `payments` — payment records
- `image_scans` — image scan results
- `security_scans` — website scan results
- `sessions` — user sessions
- `password_resets` — password reset tokens

All tables are created automatically on first startup.

---

## 🔒 Security Features

- ✅ Passwords hashed with **bcrypt** (12 rounds)
- ✅ Sessions stored in PostgreSQL (not memory)
- ✅ Rate limiting on all endpoints
- ✅ HTTP security headers via **Helmet.js**
- ✅ Input sanitization on all user input
- ✅ Admin dashboard at secret URL
- ✅ Environment variables for all secrets
- ✅ `.env` excluded from git

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

## 👨‍💻 Author

**Niyonizeye Placide**
- 🎓 Student — African Leadership University, Rwanda
- 📧 Email: p.niyonizey@alustudent.com
- 🐙 GitHub: [@placide220](https://github.com/placide220)

---

## 🙏 Acknowledgments

- [Groq](https://groq.com) — Free LLaMA AI API
- [Anthropic](https://anthropic.com) — Claude Vision for image scanning
- [Neon](https://neon.tech) — Serverless PostgreSQL
- [Render](https://render.com) — Free hosting platform
- [Brevo](https://brevo.com) — Free email SMTP

---

<div align="center">

**Made with ❤️ in Rwanda 🇷🇼**

*Helping African students stay safe online*

</div>
