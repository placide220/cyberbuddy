# CyberBuddy 🛡️
**AI-Powered Cybersecurity Education Platform for Africa**

## Quick Start (Local)
```bash
npm install
cp .env.example .env   # Fill in your keys
npm start
```
Visit: http://localhost:3000

## Deploy to Railway
1. Push this repo to GitHub
2. Go to railway.app → New Project → Deploy from GitHub
3. Add environment variables (see below)
4. Railway auto-deploys on every git push

## Environment Variables
Set these in Railway dashboard → Variables:
```
DATABASE_URL=postgresql://...        # Neon PostgreSQL connection string
GROQ_API_KEY=gsk_...                 # From console.groq.com (free)
ANTHROPIC_API_KEY=sk-ant-...         # From console.anthropic.com
GMAIL_USER=your@gmail.com            # Gmail for sending emails
GMAIL_PASS=xxxx xxxx xxxx xxxx       # Gmail App Password
SESSION_SECRET=long_random_string    # Any long random string
APP_URL=https://your-app.railway.app # Your Railway URL
APP_NAME=CyberBuddy
NODE_ENV=production
PREMIUM_PRICE_USD=2
FREE_CHAT_LIMIT=10
ADMIN_PASSWORD=YourSecureAdminPassword
```

## Pages
| URL | Description |
|-----|-------------|
| / | Login page |
| /chat | Main AI chat |
| /quiz | Daily quizzes |
| /scan | Image scam detector (Premium) |
| /scanner | Website security scanner (Premium) |
| /leaderboard | Top players |
| /profile | User profile & badges |
| /pricing | Upgrade to Premium |
| /admin-cb2026 | Admin dashboard (secret URL) |

## Tech Stack
- **Backend:** Node.js + Express
- **Database:** PostgreSQL (Neon cloud)
- **AI Chat:** Groq (LLaMA 3.3 70B)
- **Image Scan:** Anthropic Claude
- **Payments:** Flutterwave / DPO Pay
- **Email:** Gmail + Nodemailer
- **Sessions:** PostgreSQL (connect-pg-simple)
