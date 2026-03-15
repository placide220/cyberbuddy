require("dotenv").config();
const express      = require("express");
const session      = require("express-session");
const PgSession    = require("connect-pg-simple")(session);
const rateLimit    = require("express-rate-limit");
const helmet       = require("helmet");
const path         = require("path");
const bcrypt       = require("bcryptjs");
const crypto       = require("crypto");
const multer       = require("multer");
const axios        = require("axios");
const validator    = require("validator");
const { query, pool, init } = require("./db");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const scanner = require("./scanner");
const dpo     = require("./payment");
const logger       = require("./logger");
const email_service = require("./email");

const app    = express();
const makeId = () => crypto.randomBytes(16).toString("hex");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const FREE_CHAT_LIMIT = parseInt(process.env.FREE_CHAT_LIMIT || "10");
const PREMIUM_PRICE   = parseFloat(process.env.PREMIUM_PRICE_USD || "2");

// ── SECURITY MIDDLEWARE ──────────────────────────────────────────
app.set("trust proxy", 1); // Trust Railway proxy
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Rate limiters
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"),
  max: parseInt(process.env.RATE_LIMIT_MAX || "200"),
  message: { error: "Too many requests. Please slow down." },
  standardHeaders: true, legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
});
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, max: 20,
  message: { error: "Sending messages too fast. Please slow down." },
});
app.use(globalLimiter);

// ── GOOGLE OAUTH SETUP ───────────────────────────────────────────
if (process.env.GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_ID.startsWith("your_")) {
  passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  (process.env.APP_URL || "http://localhost:3000") + "/auth/google/callback",
    scope: ["profile", "email"]
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email    = profile.emails?.[0]?.value;
      const name     = profile.displayName || profile.emails?.[0]?.value?.split("@")[0];
      const googleId = profile.id;
      if (!email) return done(null, false);
      // Check if user exists
      let r = await query("SELECT * FROM users WHERE email=$1 OR google_id=$1", [email]);
      let user = r.rows[0];
      if (!user) {
        // Create new user
        const id = makeId();
        const ref_code = Math.random().toString(36).substring(2,8).toUpperCase();
        await query(
          "INSERT INTO users(id,username,email,password,google_id,referral_code) VALUES($1,$2,$3,$4,$5,$6)",
          [id, name, email, "google_oauth_" + googleId, googleId, ref_code]
        );
        user = (await query("SELECT * FROM users WHERE id=$1", [id])).rows[0];
        // Send welcome email
        email_service.sendWelcome(email, name).catch(()=>{});
      } else if (!user.google_id) {
        // Link Google to existing account
        await query("UPDATE users SET google_id=$1 WHERE id=$2", [googleId, user.id]);
      }
      return done(null, user);
    } catch(e) { return done(e); }
  }));

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      const r = await query("SELECT * FROM users WHERE id=$1", [id]);
      done(null, r.rows[0] || false);
    } catch(e) { done(e); }
  });

  app.use(passport.initialize());
  app.use(passport.session());

  // Google OAuth routes
  app.get("/auth/google",
    passport.authenticate("google", { scope: ["profile","email"] })
  );

  app.get("/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/login?error=google" }),
    (req, res) => {
      req.session.userId   = req.user.id;
      req.session.username = req.user.username;
      logger.info("Google login", { username: req.user.username });
      res.redirect("/chat");
    }
  );
} else {
  // Google not configured — show helpful error
  app.get("/auth/google", (req, res) => {
    res.redirect("/login?error=google_not_configured");
  });
}


// Sessions — stored in PostgreSQL (survive restarts!)
app.use(session({
  store: new PgSession({ pool, tableName: "sessions", createTableIfMissing: false }),
  secret: process.env.SESSION_SECRET || "change_this_secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax"
  },
  proxy: true
}));

// ── HELPERS ──────────────────────────────────────────────────────
function isPremium(user) {
  if (!user.is_premium) return false;
  if (!user.premium_expires) return true;
  return new Date(user.premium_expires) > new Date();
}
async function getUser(id) {
  const r = await query("SELECT * FROM users WHERE id=$1", [id]);
  return r.rows[0] || null;
}
function sanitize(str) {
  if (!str) return "";
  return validator.escape(String(str).trim().substring(0, 2000));
}
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Not logged in." });
  next();
}
function requireAdmin(req, res, next) {
  const adminPw = req.headers["x-admin-password"] || req.body?.adminPassword;
  if (adminPw !== process.env.ADMIN_PASSWORD) return res.status(403).json({ error: "Admin access denied." });
  next();
}
function getIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress || "unknown";
}

// ── TEST ─────────────────────────────────────────────────────────
app.get("/api/test", async (req, res) => {
  let dbStatus = "OK";
  try { await query("SELECT 1"); } catch(e) { dbStatus = "ERROR: "+e.message; }
  res.json({
    server: "CyberBuddy v5.0",
    database: dbStatus,
    session: req.session.userId ? "logged in: "+req.session.username : "not logged in",
    groq:        process.env.GROQ_API_KEY?.startsWith("your_") ? "NOT SET ⚠️" : "SET ✅",
    anthropic:   process.env.ANTHROPIC_API_KEY?.startsWith("your_") ? "NOT SET ⚠️" : "SET ✅",
    dpo: process.env.DPO_COMPANY_TOKEN?.startsWith("your_") ? "NOT SET (demo mode)" : "SET ✅",
    email:       process.env.GMAIL_USER?.includes("your@") ? "NOT SET ⚠️" : "SET ✅",
  });
});

// ── REGISTER ─────────────────────────────────────────────────────
app.post("/api/auth/register", authLimiter, async (req, res) => {
  let { username, email: emailInput, password, referral } = req.body || {};
  username  = sanitize(username);
  emailInput = String(emailInput || "").trim().toLowerCase();
  if (!username || !emailInput || !password) return res.json({ error: "All fields required." });
  if (username.length < 2 || username.length > 30) return res.json({ error: "Username must be 2-30 characters." });
  if (!validator.isEmail(emailInput)) return res.json({ error: "Invalid email address." });
  if (password.length < 6) return res.json({ error: "Password must be at least 6 characters." });
  try {
    const exists = await query("SELECT id FROM users WHERE email=$1", [emailInput]);
    if (exists.rows.length) return res.json({ error: "Email already registered." });
    const id = makeId(), hashed = await bcrypt.hash(password, 12);
    const ref_code = Math.random().toString(36).substring(2,8).toUpperCase();
    await query(
      "INSERT INTO users(id,username,email,password,referral_code) VALUES($1,$2,$3,$4,$5)",
      [id, username, emailInput, hashed, ref_code]
    );
    // Handle referral — store it but DON'T give points yet
    // Points are only awarded when the referred user pays for Premium
    if (referral) {
      const referrer = await query("SELECT id FROM users WHERE referral_code=$1", [referral.toUpperCase()]);
      if (referrer.rows.length && referrer.rows[0].id !== id) {
        const rid = referrer.rows[0].id;
        await query("INSERT INTO referrals(id,referrer_id,referred_id,bonus_points) VALUES($1,$2,$3,$4) ON CONFLICT(referred_id) DO NOTHING",
          [makeId(), rid, id, 20]);
        // Store who referred this user so we can reward later on payment
        await query("UPDATE users SET referred_by=$1 WHERE id=$2", [rid, id]);
      }
    }
    req.session.userId = id; req.session.username = username;
    logger.info("New user registered", { username, email: emailInput, ip: getIp(req) });
    // Send welcome email (non-blocking)
    email_service.sendWelcome(emailInput, username).catch(()=>{});
    res.json({ success: true, username });
  } catch(e) {
    logger.error("Register error", { error: e.message });
    res.json({ error: "Registration failed. Please try again." });
  }
});

// ── LOGIN ─────────────────────────────────────────────────────────
app.post("/api/auth/login", authLimiter, async (req, res) => {
  const emailInput = String(req.body?.email || "").trim().toLowerCase();
  const { password } = req.body || {};
  if (!emailInput || !password) return res.json({ error: "Email and password required." });
  try {
    const r = await query("SELECT id,username,password FROM users WHERE email=$1", [emailInput]);
    if (!r.rows.length || !await bcrypt.compare(password, r.rows[0].password))
      return res.json({ error: "Invalid email or password." });
    const { id, username } = r.rows[0];
    req.session.userId = id; req.session.username = username;
    logger.info("User logged in", { username, ip: getIp(req) });
    // Login alert email (non-blocking)
    email_service.sendLoginAlert(emailInput, username, getIp(req)).catch(()=>{});
    res.json({ success: true, username });
  } catch(e) {
    logger.error("Login error", { error: e.message });
    res.json({ error: "Login failed. Please try again." });
  }
});

app.get("/api/auth/me", (req, res) => {
  res.json(req.session.userId
    ? { loggedIn: true, username: req.session.username }
    : { loggedIn: false });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ── CHANGE PASSWORD ───────────────────────────────────────────────
app.post("/api/auth/change-password", requireAuth, authLimiter, async (req, res) => {
  const { current, newPassword } = req.body || {};
  if (!current || !newPassword) return res.json({ error: "All fields required." });
  if (newPassword.length < 6) return res.json({ error: "Min 6 characters." });
  try {
    const r = await query("SELECT password FROM users WHERE id=$1", [req.session.userId]);
    if (!await bcrypt.compare(current, r.rows[0].password)) return res.json({ error: "Current password incorrect." });
    await query("UPDATE users SET password=$1 WHERE id=$2", [await bcrypt.hash(newPassword,12), req.session.userId]);
    logger.info("Password changed", { userId: req.session.userId });
    res.json({ success: true });
  } catch(e) { res.json({ error: e.message }); }
});

// ── FORGOT PASSWORD ───────────────────────────────────────────────
app.post("/api/auth/forgot-password", authLimiter, async (req, res) => {
  const emailInput = String(req.body?.email || "").trim().toLowerCase();
  if (!validator.isEmail(emailInput)) return res.json({ error: "Invalid email." });
  try {
    const r = await query("SELECT id,username FROM users WHERE email=$1", [emailInput]);
    if (!r.rows.length) return res.json({ success: true, message: "If that email exists, a reset link was sent." });
    const { id, username } = r.rows[0];
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600000);
    await query("INSERT INTO password_resets(id,user_id,token,expires_at) VALUES($1,$2,$3,$4)", [makeId(),id,token,expires]);
    const resetLink = `${process.env.APP_URL}/reset-password?token=${token}`;
    // Try email but also return the link directly in dev/HTTP mode
    const emailSent = await email_service.sendPasswordReset(emailInput, username, resetLink).catch(()=>false);
    logger.info("Password reset requested", { email: emailInput, emailSent });
    // If email fails, return the link directly so user can still reset
    if (!emailSent) {
      return res.json({ success: true, message: "Email sending failed. Use this link to reset:", resetLink });
    }
    res.json({ success: true, message: "Reset link sent to your email!" });
  } catch(e) { res.json({ error: "Failed: " + e.message }); }
});

app.post("/api/auth/reset-password", authLimiter, async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword || newPassword.length < 6) return res.json({ error: "Invalid request." });
  try {
    const r = await query(
      "SELECT user_id FROM password_resets WHERE token=$1 AND expires_at>NOW() AND used=FALSE", [token]);
    if (!r.rows.length) return res.json({ error: "Reset link is invalid or expired." });
    const userId = r.rows[0].user_id;
    await query("UPDATE users SET password=$1 WHERE id=$2", [await bcrypt.hash(newPassword,12), userId]);
    await query("UPDATE password_resets SET used=TRUE WHERE token=$1", [token]);
    logger.info("Password reset completed", { userId });
    res.json({ success: true });
  } catch(e) { res.json({ error: e.message }); }
});

// ── CHAT ─────────────────────────────────────────────────────────
app.post("/api/chat", requireAuth, chatLimiter, async (req, res) => {
  const question = sanitize(req.body?.question);
  const { conversationId } = req.body || {};
  if (!question) return res.json({ error: "No question provided." });
  try {
    const user = await getUser(req.session.userId);
    const premium = isPremium(user);
    // Free chat limit
    if (!premium) {
      const today = new Date().toISOString().split("T")[0];
      const count = user.chat_date?.toISOString?.()?.split("T")[0] === today ? (user.chat_count_today||0) : 0;
      if (count >= FREE_CHAT_LIMIT)
        return res.json({ error: `Daily limit reached (${FREE_CHAT_LIMIT} messages/day on free plan). Upgrade to Premium for unlimited chat!`, limitReached: true });
      await query("UPDATE users SET chat_count_today=$1, chat_date=$2 WHERE id=$3", [count+1, today, req.session.userId]);
    }
    const key = process.env.GROQ_API_KEY;
    if (!key || key.startsWith("your_")) return res.json({ error: "GROQ_API_KEY not configured." });
    const gr = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer "+key },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", max_tokens: 800,
        messages: [
          { role: "system", content: "You are CyberBuddy, a friendly cybersecurity assistant for students. Be clear and practical. Keep responses to 3-5 sentences. If off-topic, redirect to cybersecurity." },
          { role: "user", content: question }
        ]
      })
    });
    const data = await gr.json();
    if (!gr.ok) return res.json({ error: "AI error: "+(data.error?.message||gr.status) });
    const answer = data.choices?.[0]?.message?.content || "No response.";
    let cid = conversationId;
    if (!cid) {
      cid = makeId();
      await query("INSERT INTO conversations(id,user_id,title) VALUES($1,$2,$3)", [cid, req.session.userId, question.substring(0,60)]);
    }
    await query("INSERT INTO messages(id,conversation_id,user_id,role,content) VALUES($1,$2,$3,$4,$5)", [makeId(),cid,req.session.userId,"user",question]);
    await query("INSERT INTO messages(id,conversation_id,user_id,role,content) VALUES($1,$2,$3,$4,$5)", [makeId(),cid,req.session.userId,"bot",answer]);
    const updUser = await getUser(req.session.userId);
    const today2 = new Date().toISOString().split("T")[0];
    const used = updUser.chat_date?.toISOString?.()?.split("T")[0] === today2 ? updUser.chat_count_today : 0;
    res.json({ response: answer, conversationId: cid, isPremium: premium, remaining: premium ? null : Math.max(0, FREE_CHAT_LIMIT - used) });
  } catch(e) { logger.error("Chat error", { error: e.message }); res.json({ error: "Chat failed. Please try again." }); }
});

// ── IMAGE SCAN (PREMIUM) ──────────────────────────────────────────
app.post("/api/scan", requireAuth, upload.single("image"), async (req, res) => {
  try {
    const user = await getUser(req.session.userId);
    if (!isPremium(user)) return res.json({ error: "Premium feature. Upgrade to scan images! 🔒", requiresPremium: true });
    if (!req.file) return res.json({ error: "No image uploaded." });
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key || key.startsWith("your_")) return res.json({ error: "Image scanning not configured. Add ANTHROPIC_API_KEY to .env" });
    const base64 = req.file.buffer.toString("base64");
    const resp = await axios.post("https://api.anthropic.com/v1/messages", {
      model: "claude-opus-4-5", max_tokens: 1024,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: req.file.mimetype, data: base64 } },
        { type: "text", text: `Analyze this image for cybersecurity threats. Look for: phishing, fake websites, scam messages, suspicious links, urgency tactics, grammar errors, fake logos, social engineering.

Respond ONLY in this exact JSON format:
{"verdict":"SAFE"|"SUSPICIOUS"|"SCAM","confidence":"HIGH"|"MEDIUM"|"LOW","risk_score":0-100,"red_flags":["flag1"],"summary":"2-3 sentence explanation","recommendation":"What user should do"}` }
      ]}]
    }, { headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" } });
    let result;
    try { result = JSON.parse(resp.data.content[0].text.match(/\{[\s\S]*\}/)[0]); }
    catch { result = { verdict:"SUSPICIOUS", confidence:"LOW", risk_score:50, red_flags:[], summary: resp.data.content[0].text, recommendation:"Review carefully." }; }
    await query(
      "INSERT INTO image_scans(id,user_id,verdict,confidence,risk_score,summary,red_flags,recommendation) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [makeId(), req.session.userId, result.verdict, result.confidence, result.risk_score, result.summary, JSON.stringify(result.red_flags||[]), result.recommendation]
    );
    logger.info("Image scanned", { userId: req.session.userId, verdict: result.verdict });
    res.json({ success: true, ...result });
  } catch(e) { logger.error("Scan error", { error: e.message }); res.json({ error: "Scan failed: "+e.message }); }
});

// ── PAYMENT: INITIATE ─────────────────────────────────────────────
app.post("/api/payment/initiate", requireAuth, async (req, res) => {
  const { months = 1, phone, payment_type = "card" } = req.body || {};
  try {
    const user = await getUser(req.session.userId);
    const flwKey = process.env.FLW_SECRET_KEY;
    if (!flwKey || flwKey.startsWith("your_")) {
      // DEMO MODE
      const expires = new Date(); expires.setMonth(expires.getMonth() + months);
      await query("UPDATE users SET is_premium=TRUE, premium_expires=$1 WHERE id=$2", [expires, req.session.userId]);
      // Award referral bonus for demo payments too
      if (user.referred_by) {
        await query("UPDATE users SET points=points+20 WHERE id=$1", [user.referred_by]);
        await query("UPDATE users SET points=points+10 WHERE id=$1", [req.session.userId]);
        await query("UPDATE referrals SET bonus_points=0 WHERE referred_id=$1", [req.session.userId]);
      }
      await email_service.sendPaymentReceipt(user.email, user.username, { amount: PREMIUM_PRICE*months, months, tx_ref:"DEMO-"+makeId().substring(0,8), expires });
      logger.info("Demo premium activated", { userId: req.session.userId, months });
      return res.json({ success: true, demo: true, message: `Demo mode: Premium activated for ${months} month(s)! Receipt sent to ${user.email}` });
    }
    const tx_ref = "CB-"+makeId().substring(0,12).toUpperCase();
    const amount = PREMIUM_PRICE * months;
    await query("INSERT INTO payments(id,user_id,tx_ref,amount,months) VALUES($1,$2,$3,$4,$5)", [makeId(), req.session.userId, tx_ref, amount, months]);
    const flwRes = await axios.post("https://api.flutterwave.com/v3/payments", {
      tx_ref, amount, currency: "USD",
      redirect_url: `${process.env.APP_URL}/api/payment/verify`,
      customer: { email: user.email, name: user.username, phonenumber: phone||"" },
      customizations: { title: "CyberBuddy Premium", description: `${months} month(s) premium access` },
      payment_options: payment_type === "mobilemoney" ? "mobilemoney" : "card",
      meta: { user_id: req.session.userId, months }
    }, { headers: { Authorization: "Bearer "+flwKey } });
    if (flwRes.data.status === "success") {
      logger.info("Payment initiated", { userId: req.session.userId, tx_ref, amount });
      res.json({ success: true, payment_url: flwRes.data.data.link, tx_ref });
    } else {
      res.json({ error: "Payment failed: "+flwRes.data.message });
    }
  } catch(e) { logger.error("Payment error", { error: e.message }); res.json({ error: e.message }); }
});

// ── PAYMENT: VERIFY ───────────────────────────────────────────────
app.get("/api/payment/verify", async (req, res) => {
  const { transaction_id, tx_ref } = req.query;
  try {
    const flwKey = process.env.FLW_SECRET_KEY;
    const verify = await axios.get(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
      { headers: { Authorization: "Bearer "+flwKey } });
    const data = verify.data.data;
    if (data.status === "successful") {
      const pr = await query("SELECT user_id,months FROM payments WHERE tx_ref=$1", [tx_ref]);
      if (pr.rows.length) {
        const { user_id, months } = pr.rows[0];
        const expires = new Date(); expires.setMonth(expires.getMonth() + months);
        await query("UPDATE users SET is_premium=TRUE, premium_expires=$1 WHERE id=$2", [expires, user_id]);
        await query("UPDATE payments SET status='completed', flw_ref=$1, completed_at=NOW() WHERE tx_ref=$2", [data.flw_ref, tx_ref]);
        const user = await getUser(user_id);
        // Award referral bonus points NOW that the user has paid
        if (user.referred_by) {
          const alreadyRewarded = await query(
            "SELECT id FROM referrals WHERE referred_id=$1 AND bonus_points > 0 AND created_at < NOW()", [user_id]);
          if (alreadyRewarded.rows.length) {
            await query("UPDATE users SET points=points+20 WHERE id=$1", [user.referred_by]);
            await query("UPDATE users SET points=points+10 WHERE id=$1", [user_id]);
            await query("UPDATE referrals SET bonus_points=0 WHERE referred_id=$1", [user_id]);
            logger.info("Referral bonus awarded after payment", { referrer: user.referred_by, referred: user_id });
          }
        }
        await email_service.sendPaymentReceipt(user.email, user.username, { amount: data.amount, months, tx_ref, expires });
        logger.info("Payment completed", { user_id, tx_ref, amount: data.amount });
      }
      res.redirect("/chat?payment=success");
    } else {
      await query("UPDATE payments SET status='failed' WHERE tx_ref=$1", [tx_ref]);
      res.redirect("/chat?payment=failed");
    }
  } catch(e) { logger.error("Verify error", { error: e.message }); res.redirect("/chat?payment=error"); }
});

// ── CANCEL SUBSCRIPTION ───────────────────────────────────────────
app.post("/api/payment/cancel", requireAuth, async (req, res) => {
  try {
    const user = await getUser(req.session.userId);
    if (!user.is_premium) return res.json({ error: "No active subscription." });
    // Keep access until expiry, just mark as cancelled
    await query("UPDATE users SET is_premium=FALSE WHERE id=$1", [req.session.userId]);
    await email_service.sendCancellation(user.email, user.username, user.premium_expires);
    logger.info("Subscription cancelled", { userId: req.session.userId });
    res.json({ success: true, message: "Subscription cancelled. Access remains until "+new Date(user.premium_expires).toLocaleDateString() });
  } catch(e) { res.json({ error: e.message }); }
});

// ── PREMIUM STATUS ────────────────────────────────────────────────
app.get("/api/premium/status", requireAuth, async (req, res) => {
  const user = await getUser(req.session.userId);
  const premium = isPremium(user);
  const today = new Date().toISOString().split("T")[0];
  const chatUsed = user.chat_date?.toISOString?.()?.split("T")[0] === today ? (user.chat_count_today||0) : 0;
  res.json({ isPremium: premium, premiumExpires: user.premium_expires, chatUsed, chatLimit: FREE_CHAT_LIMIT, chatRemaining: premium ? null : Math.max(0, FREE_CHAT_LIMIT - chatUsed) });
});

// ── PROFILE ───────────────────────────────────────────────────────
app.get("/api/profile", requireAuth, async (req, res) => {
  const user = await getUser(req.session.userId);
  const rewards = await query(`SELECT r.title,r.icon FROM rewards r JOIN user_rewards ur ON r.id=ur.reward_id WHERE ur.user_id=$1`, [req.session.userId]);
  const qs  = await query("SELECT COUNT(*),COALESCE(SUM(score),0) FROM quiz_attempts WHERE user_id=$1 AND completed=TRUE", [req.session.userId]);
  const sc  = await query("SELECT COUNT(*) FROM image_scans WHERE user_id=$1", [req.session.userId]);
  const { password: _, ...safeUser } = user;
  res.json({ ...safeUser, isPremium: isPremium(user), rewards: rewards.rows, quizCount: parseInt(qs.rows[0].count), totalScore: parseInt(qs.rows[0].coalesce), scanCount: parseInt(sc.rows[0].count) });
});

// ── LEADERBOARD ───────────────────────────────────────────────────
app.get("/api/leaderboard", async (req, res) => {
  const r = await query("SELECT username,points,is_premium FROM users ORDER BY points DESC LIMIT 20");
  res.json({ leaders: r.rows.map((u,i) => ({ rank:i+1, ...u })) });
});

// ── QUIZZES ───────────────────────────────────────────────────────
app.get("/api/quizzes", requireAuth, async (req, res) => {
  const user = await getUser(req.session.userId);
  const r    = await query("SELECT id,title,description,category,time_limit,is_daily,is_premium,prize,prize_description FROM quizzes ORDER BY created_at DESC");
  const quizzes = await Promise.all(r.rows.map(async q => {
    const a = await query("SELECT score FROM quiz_attempts WHERE quiz_id=$1 AND user_id=$2 AND completed=TRUE", [q.id, req.session.userId]);
    return { ...q, attempted: !!a.rows.length, myScore: a.rows[0]?.score||null, canPlay: !q.is_premium || isPremium(user) };
  }));
  res.json({ quizzes });
});

app.post("/api/quizzes/:id/start", requireAuth, async (req, res) => {
  const user = await getUser(req.session.userId);
  const qr   = await query("SELECT * FROM quizzes WHERE id=$1", [req.params.id]);
  if (!qr.rows.length) return res.json({ error: "Quiz not found." });
  const quiz = qr.rows[0];
  if (quiz.is_premium && !isPremium(user)) return res.json({ error: "Premium quiz. Upgrade to access! 🔒", requiresPremium: true });
  const done = await query("SELECT id FROM quiz_attempts WHERE quiz_id=$1 AND user_id=$2 AND completed=TRUE", [req.params.id, req.session.userId]);
  if (done.rows.length) return res.json({ error: "You already completed this quiz!" });
  const qs = await query("SELECT id,question,option_a,option_b,option_c,option_d,points FROM questions WHERE quiz_id=$1", [req.params.id]);
  const attemptId = makeId();
  await query("INSERT INTO quiz_attempts(id,quiz_id,user_id) VALUES($1,$2,$3)", [attemptId, req.params.id, req.session.userId]);
  res.json({ attemptId, quiz: { id:quiz.id, title:quiz.title, time_limit:quiz.time_limit, prize:quiz.prize }, questions: qs.rows.map(q => ({ id:q.id, question:q.question, options:{A:q.option_a,B:q.option_b,C:q.option_c,D:q.option_d}, points:q.points })) });
});

app.post("/api/quizzes/attempts/:id/submit", requireAuth, async (req, res) => {
  const { answers } = req.body;
  const ar = await query("SELECT quiz_id FROM quiz_attempts WHERE id=$1 AND user_id=$2", [req.params.id, req.session.userId]);
  if (!ar.rows.length) return res.json({ error: "Attempt not found." });
  const qs = await query("SELECT id,correct,explanation,points FROM questions WHERE quiz_id=$1", [ar.rows[0].quiz_id]);
  let score = 0, totalPoints = 0;
  const results = qs.rows.map(q => {
    const ua = answers[q.id], correct = ua === q.correct;
    if (correct) score += q.points;
    totalPoints += q.points;
    return { questionId:q.id, correct:q.correct, userAnswer:ua, isCorrect:correct, explanation:q.explanation };
  });
  await query("UPDATE quiz_attempts SET score=$1,total_points=$2,answers=$3,completed=TRUE,completed_at=NOW() WHERE id=$4",
    [score, totalPoints, JSON.stringify(answers), req.params.id]);
  await query("UPDATE users SET points=points+$1 WHERE id=$2", [score, req.session.userId]);
  const updUser = await getUser(req.session.userId);
  // Check rewards
  const allRewards = await query("SELECT id,title,icon,points_required FROM rewards");
  const newRewards = [];
  for (const r of allRewards.rows) {
    if (updUser.points >= r.points_required) {
      const has = await query("INSERT INTO user_rewards(id,user_id,reward_id) VALUES($1,$2,$3) ON CONFLICT(user_id,reward_id) DO NOTHING RETURNING id",
        [makeId(), req.session.userId, r.id]);
      if (has.rows.length) newRewards.push({ title:r.title, icon:r.icon });
    }
  }
  res.json({ score, totalPoints, percentage:Math.round(score/totalPoints*100), results, newRewards, totalUserPoints:updUser.points });
});

// ── ADMIN ─────────────────────────────────────────────────────────
// Admin login — no session needed, just password check
app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.json({ error: "Email and password required." });
  // Check password matches ADMIN_PASSWORD — email can be any admin email
  const validEmail = email === process.env.GMAIL_USER || 
                     email === "p.niyonizey@alustudent.com" ||
                     email === "mugishaki@gmail.com";
  if (!validEmail || password !== process.env.ADMIN_PASSWORD)
    return res.json({ error: "Invalid admin credentials." });
  logger.info("Admin login", { email, ip: getIp(req) });
  res.json({ success: true });
});

app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  const [users, premium, quizzes, attempts, revenue, scans, usersList, prizeWinners, payments] = await Promise.all([
    query("SELECT COUNT(*) FROM users"),
    query("SELECT COUNT(*) FROM users WHERE is_premium=TRUE"),
    query("SELECT COUNT(*) FROM quizzes"),
    query("SELECT COUNT(*) FROM quiz_attempts WHERE completed=TRUE"),
    query("SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='completed'"),
    query("SELECT COUNT(*) FROM image_scans"),
    query("SELECT id,username,email,points,is_premium,created_at FROM users ORDER BY created_at DESC LIMIT 100"),
    query(`SELECT qa.id,u.username,u.email,q.title as quiz_title,q.prize,qa.score,qa.total_points,qa.completed_at
           FROM quiz_attempts qa JOIN users u ON qa.user_id=u.id JOIN quizzes q ON qa.quiz_id=q.id
           WHERE q.prize IS NOT NULL AND qa.completed=TRUE ORDER BY qa.score DESC LIMIT 50`),
    query(`SELECT p.*,u.username FROM payments p LEFT JOIN users u ON p.user_id=u.id ORDER BY p.created_at DESC LIMIT 100`),
  ]);
  res.json({
    users: parseInt(users.rows[0].count),
    premium: parseInt(premium.rows[0].count),
    quizzes: parseInt(quizzes.rows[0].count),
    attempts: parseInt(attempts.rows[0].count),
    revenue: parseFloat(revenue.rows[0].coalesce).toFixed(2),
    scans: parseInt(scans.rows[0].count),
    users_list: usersList.rows,
    prize_winners: prizeWinners.rows,
    payments: payments.rows,
  });
});

app.post("/api/admin/quizzes", requireAdmin, async (req, res) => {
  const { title, description, category, time_limit, is_daily, is_premium, prize, prize_description, questions } = req.body;
  if (!title || !questions?.length) return res.json({ error: "Title and questions required." });
  const qid = makeId();
  await query("INSERT INTO quizzes(id,title,description,category,time_limit,is_daily,is_premium,prize,prize_description,quiz_date,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_DATE,$10)",
    [qid,title,description||"",category||"general",time_limit||300,!!is_daily,!!is_premium,prize||null,prize_description||null,req.session.userId]);
  for (const q of questions) {
    await query("INSERT INTO questions(id,quiz_id,question,option_a,option_b,option_c,option_d,correct,explanation,points) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [makeId(),qid,sanitize(q.question),sanitize(q.option_a),sanitize(q.option_b),sanitize(q.option_c)||"N/A",sanitize(q.option_d)||"N/A",q.correct,sanitize(q.explanation||""),q.points||10]);
  }
  logger.info("Quiz created", { quizId: qid, title, createdBy: req.session.username });
  res.json({ success: true, quizId: qid });
});

// ── REFERRAL ──────────────────────────────────────────────────────
app.post("/api/referral/use", requireAuth, async (req, res) => {
  const code = String(req.body?.code||"").toUpperCase().trim();
  const referrer = await query("SELECT id FROM users WHERE referral_code=$1", [code]);
  if (!referrer.rows.length) return res.json({ error: "Invalid referral code." });
  const rid = referrer.rows[0].id;
  if (rid === req.session.userId) return res.json({ error: "Cannot use your own code." });
  const already = await query("SELECT id FROM referrals WHERE referred_id=$1", [req.session.userId]);
  if (already.rows.length) return res.json({ error: "You already used a referral code." });
  // Save referral — points only awarded when this user pays for Premium
  await query("INSERT INTO referrals(id,referrer_id,referred_id,bonus_points) VALUES($1,$2,$3,20) ON CONFLICT(referred_id) DO NOTHING",
    [makeId(), rid, req.session.userId]);
  await query("UPDATE users SET referred_by=$1 WHERE id=$2", [rid, req.session.userId]);
  res.json({ success: true, message: "Referral code saved! ✅ Bonus points will be awarded to both of you once you upgrade to Premium." });
});

// ── HISTORY ───────────────────────────────────────────────────────
app.get("/api/history/conversations", requireAuth, async (req, res) => {
  const r = await query("SELECT id,title,created_at FROM conversations WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50", [req.session.userId]);
  res.json({ conversations: r.rows });
});
app.get("/api/history/conversations/:id", requireAuth, async (req, res) => {
  const cr = await query("SELECT id,title,user_id FROM conversations WHERE id=$1", [req.params.id]);
  if (!cr.rows.length || cr.rows[0].user_id !== req.session.userId) return res.status(403).json({ error: "Not found." });
  const mr = await query("SELECT role,content FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC", [req.params.id]);
  res.json({ title: cr.rows[0].title, messages: mr.rows });
});
app.delete("/api/history/conversations/:id", requireAuth, async (req, res) => {
  await query("DELETE FROM conversations WHERE id=$1 AND user_id=$2", [req.params.id, req.session.userId]);
  res.json({ success: true });
});

// ── PAGES ─────────────────────────────────────────────────────────
const pub = (f) => (_, res) => res.sendFile(path.join(__dirname, "public", f));
app.get("/",                pub("login.html"));
app.get("/chat",            pub("chat.html"));
app.get("/login",           pub("login.html"));
app.get("/register",        pub("register.html"));
app.get("/quiz",            pub("quiz.html"));
app.get("/profile",         pub("profile.html"));
app.get("/admin-cb2026",    pub("admin.html"));
// /admin redirects to 404 to hide it
app.get("/admin", (_, res) => res.status(404).sendFile(require("path").join(__dirname, "public", "404.html")));
app.get("/leaderboard",     pub("leaderboard.html"));
app.get("/pricing",         pub("pricing.html"));
app.get("/scan",            pub("scan.html"));
app.get("/terms",           pub("terms.html"));
app.get("/privacy",         pub("privacy.html"));
app.get("/reset-password",  pub("reset-password.html"));
app.get("/forgot-password", pub("forgot-password.html"));
app.get("/scanner",     pub("scanner.html"));


/* ── SECURITY SCANNER ───────────────────────────────────────────*/
app.post("/api/scanner/scan", requireAuth, async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.json({ error: "URL is required." });

  let cleanUrl = url.trim();
  if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://"))
    cleanUrl = "https://" + cleanUrl;

  try { new URL(cleanUrl); }
  catch(e) { return res.json({ error: "Invalid URL. Example: example.com or https://example.com" }); }

  const user = await getUser(req.session.userId);
  const premium = isPremium(user);

  // Premium only
  if (!premium) {
    return res.json({ error: "Premium feature. Upgrade to $2/month to access the security scanner! 🔒", requiresPremium: true });
  }

  try {
    logger.info("Scan requested", { url: cleanUrl, user: req.session.username });
    const result = await scanner.scan(cleanUrl);

    await query(
      `INSERT INTO security_scans(id,user_id,url,score,grade,issues_count,result,is_premium_scan)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [makeId(), req.session.userId, result.hostname, result.score, result.grade,
       result.issues.length, JSON.stringify(result), true]
    );

    res.json(result);
  } catch(e) {
    logger.error("Scan error", { url: cleanUrl, error: e.message });
    res.json({ error: "Scan failed: " + e.message });
  }
});

app.get("/api/scanner/history", requireAuth, async (req, res) => {
  try {
    const r = await query(
      "SELECT id,url,score,grade,issues_count,created_at FROM security_scans WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20",
      [req.session.userId]
    );
    res.json({ scans: r.rows });
  } catch(e) { res.json({ scans: [] }); }
});

// ── 404 ───────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, "public", "404.html")));

// ── ERROR HANDLER ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error("Unhandled error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Internal server error." });
});

// ── START ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
init().then(() => {
  app.listen(PORT, () => {
    logger.info(`CyberBuddy v5.0 started on port ${PORT}`);
    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║   CyberBuddy v5.0 — Business Edition    ║`);
    console.log(`║   http://localhost:${PORT}                 ║`);
    console.log(`║   /api/test — check all services        ║`);
    console.log(`╚══════════════════════════════════════════╝\n`);
  });
}).catch(e => {
  logger.error("Failed to start", { error: e.message });
  console.error("STARTUP FAILED:", e.message);
  console.error("Check your DATABASE_URL in .env file");
  process.exit(1);
});
