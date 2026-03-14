// ══════════════════════════════════════════════════════
//  CyberBuddy — Email Service (Gmail / Nodemailer)
// ══════════════════════════════════════════════════════
const nodemailer = require("nodemailer");
const logger     = require("./logger");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

const APP    = process.env.APP_NAME || "CyberBuddy";
const APP_URL = process.env.APP_URL || "http://localhost:3000";

function html(title, body) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body{margin:0;padding:0;background:#050a0f;font-family:'Segoe UI',Arial,sans-serif;}
  .wrap{max-width:560px;margin:40px auto;background:#0a1520;border:1px solid #1a3a4a;border-radius:16px;overflow:hidden;}
  .header{background:linear-gradient(135deg,#051520,#0a2535);padding:28px 32px;border-bottom:1px solid #1a3a4a;}
  .logo{font-size:22px;font-weight:900;letter-spacing:3px;background:linear-gradient(90deg,#00f5ff,#00ff88);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
  .body{padding:28px 32px;color:#c8e6f0;}
  h2{color:#00f5ff;font-size:18px;margin:0 0 16px;}
  p{line-height:1.7;color:#a0c4d8;margin:0 0 14px;font-size:14px;}
  .btn{display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#00f5ff,#00ff88);color:#050a0f;text-decoration:none;border-radius:8px;font-weight:700;font-size:13px;margin:8px 0;}
  .info-box{background:rgba(0,245,255,0.06);border:1px solid rgba(0,245,255,0.2);border-radius:8px;padding:16px;margin:16px 0;}
  .info-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(26,58,74,0.5);font-size:13px;}
  .info-row:last-child{border-bottom:none;}
  .label{color:#4a7a8a;}
  .value{color:#00f5ff;font-weight:600;}
  .footer{padding:16px 32px;text-align:center;color:#2a4a5a;font-size:11px;border-top:1px solid #1a3a4a;}
</style></head>
<body><div class="wrap">
  <div class="header"><div class="logo">${APP}</div></div>
  <div class="body"><h2>${title}</h2>${body}</div>
  <div class="footer">© ${new Date().getFullYear()} ${APP} · <a href="${APP_URL}" style="color:#4a7a8a">${APP_URL}</a></div>
</div></body></html>`;
}

async function send(to, subject, htmlBody) {
  if (!process.env.GMAIL_USER || process.env.GMAIL_USER.includes("your@")) {
    logger.warn("Email not sent — GMAIL_USER not configured", { to, subject });
    return false;
  }
  try {
    await transporter.sendMail({ from: `"${APP}" <${process.env.GMAIL_USER}>`, to, subject, html: htmlBody });
    logger.info("Email sent", { to, subject });
    return true;
  } catch(e) {
    logger.error("Email failed", { to, subject, error: e.message });
    return false;
  }
}

module.exports = {
  async sendWelcome(to, username) {
    return send(to, `Welcome to ${APP}! 🛡️`, html("Welcome aboard, "+username+"!", `
      <p>You've joined <strong>${APP}</strong> — your personal cybersecurity learning assistant.</p>
      <p>Here's what you can do right now:</p>
      <div class="info-box">
        <div class="info-row"><span class="label">💬 AI Chat</span><span class="value">Ask any cybersecurity question</span></div>
        <div class="info-row"><span class="label">🎯 Daily Quiz</span><span class="value">Test your knowledge & earn points</span></div>
        <div class="info-row"><span class="label">🏆 Leaderboard</span><span class="value">Compete with other students</span></div>
        <div class="info-row"><span class="label">📸 Image Scan</span><span class="value">Detect scams (Premium)</span></div>
      </div>
      <a href="${APP_URL}/chat" class="btn">START LEARNING →</a>
    `));
  },

  async sendPaymentReceipt(to, username, { amount, months, tx_ref, expires }) {
    return send(to, `Payment confirmed — Premium activated! ✅`, html("Premium Activated!", `
      <p>Hi <strong>${username}</strong>, your payment was successful and Premium is now active!</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Amount Paid</span><span class="value">$${amount} USD</span></div>
        <div class="info-row"><span class="label">Duration</span><span class="value">${months} month(s)</span></div>
        <div class="info-row"><span class="label">Expires</span><span class="value">${new Date(expires).toLocaleDateString()}</span></div>
        <div class="info-row"><span class="label">Transaction Ref</span><span class="value">${tx_ref}</span></div>
      </div>
      <p>You now have access to:</p>
      <p>✅ Unlimited chat &nbsp; ✅ Image scam detector &nbsp; ✅ Prize quizzes</p>
      <a href="${APP_URL}/chat" class="btn">GO TO CYBERBUDDY →</a>
      <p style="font-size:12px;margin-top:16px;">Need help? Reply to this email.</p>
    `));
  },

  async sendCancellation(to, username, expiryDate) {
    return send(to, `Subscription cancelled — ${APP}`, html("Subscription Cancelled", `
      <p>Hi <strong>${username}</strong>, your Premium subscription has been cancelled.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Access until</span><span class="value">${new Date(expiryDate).toLocaleDateString()}</span></div>
        <div class="info-row"><span class="label">Status</span><span class="value">Will revert to Free on expiry</span></div>
      </div>
      <p>You'll keep full Premium access until your billing period ends. After that you'll be on the Free plan.</p>
      <a href="${APP_URL}/pricing" class="btn">RESUBSCRIBE →</a>
    `));
  },

  async sendPasswordReset(to, username, resetLink) {
    return send(to, `Reset your ${APP} password`, html("Password Reset Request", `
      <p>Hi <strong>${username}</strong>, we received a request to reset your password.</p>
      <p>Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
      <a href="${resetLink}" class="btn">RESET PASSWORD →</a>
      <p style="font-size:12px;margin-top:16px;color:#4a7a8a;">If you didn't request this, ignore this email — your password won't change.</p>
    `));
  },

  async sendLoginAlert(to, username, ip) {
    return send(to, `New login to your ${APP} account`, html("New Login Detected", `
      <p>Hi <strong>${username}</strong>, a new login was detected on your account.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Time</span><span class="value">${new Date().toLocaleString()}</span></div>
        <div class="info-row"><span class="label">IP Address</span><span class="value">${ip}</span></div>
      </div>
      <p>If this was you, no action needed. If not, change your password immediately.</p>
      <a href="${APP_URL}/profile" class="btn">CHANGE PASSWORD →</a>
    `));
  }
};
