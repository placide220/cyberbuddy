// ══════════════════════════════════════════════════════
//  CyberBuddy v5 — PostgreSQL Database (Neon)
// ══════════════════════════════════════════════════════
const { Pool } = require("pg");
const logger   = require("./logger");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => logger.error("DB pool error", { error: err.message }));

// Helper — run query and return rows
async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result;
  } finally {
    client.release();
  }
}

// Initialize all tables
async function init() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      points INTEGER DEFAULT 0,
      is_premium BOOLEAN DEFAULT FALSE,
      premium_expires TIMESTAMPTZ,
      referral_code TEXT UNIQUE,
      referred_by TEXT,
      chat_count_today INTEGER DEFAULT 0,
      chat_date DATE,
      google_id TEXT UNIQUE,
      is_admin BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess JSON NOT NULL,
      expire TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expire_idx ON sessions(expire);

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      title TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'general',
      time_limit INTEGER DEFAULT 300,
      is_daily BOOLEAN DEFAULT FALSE,
      is_premium BOOLEAN DEFAULT FALSE,
      prize TEXT,
      prize_description TEXT,
      quiz_date DATE,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      quiz_id TEXT REFERENCES quizzes(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct TEXT NOT NULL,
      explanation TEXT,
      points INTEGER DEFAULT 10
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id TEXT PRIMARY KEY,
      quiz_id TEXT REFERENCES quizzes(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      score INTEGER DEFAULT 0,
      total_points INTEGER DEFAULT 0,
      answers JSONB,
      completed BOOLEAN DEFAULT FALSE,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS rewards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      points_required INTEGER NOT NULL,
      icon TEXT DEFAULT '🏆',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_rewards (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      reward_id TEXT REFERENCES rewards(id) ON DELETE CASCADE,
      earned_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, reward_id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      tx_ref TEXT UNIQUE,
      flw_ref TEXT,
      amount NUMERIC(10,2),
      currency TEXT DEFAULT 'USD',
      status TEXT DEFAULT 'pending',
      months INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY,
      referrer_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      referred_id TEXT REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      bonus_points INTEGER DEFAULT 20,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS image_scans (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      verdict TEXT,
      confidence TEXT,
      risk_score INTEGER,
      summary TEXT,
      red_flags JSONB,
      recommendation TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS security_scans (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      score INTEGER,
      grade TEXT,
      issues_count INTEGER DEFAULT 0,
      result JSONB,
      is_premium_scan BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Seed rewards
  await query(`
    INSERT INTO rewards(id,title,description,points_required,icon) VALUES
      ('r1','Cyber Rookie','Answer your first quiz correctly',10,'🌟'),
      ('r2','Phishing Spotter','Score 100 points total',100,'🎣'),
      ('r3','Password Pro','Score 200 points total',200,'🔐'),
      ('r4','Security Guard','Score 500 points total',500,'🛡️'),
      ('r5','Cyber Champion','Score 1000 points total',1000,'🏆')
    ON CONFLICT(id) DO NOTHING
  `);

  // Seed sample quizzes
  await query(`
    INSERT INTO quizzes(id,title,description,category,time_limit,is_daily,is_premium,quiz_date)
    VALUES('q1','Daily Free Challenge','Test your basic cybersecurity knowledge!','general',300,TRUE,FALSE,CURRENT_DATE)
    ON CONFLICT(id) DO NOTHING
  `);
  await query(`
    INSERT INTO quizzes(id,title,description,category,time_limit,is_daily,is_premium,prize,prize_description,quiz_date)
    VALUES('q2','Premium Phishing Master','Advanced phishing detection — win prizes!','phishing',300,TRUE,TRUE,'🏆 $5 MoMo Prize','Top scorer wins $5 sent via MTN MoMo',CURRENT_DATE)
    ON CONFLICT(id) DO NOTHING
  `);

  const sampleQs = [
    ['qu1','q1','What does phishing mean?','A type of fish','A scam to steal your info','A computer virus','A firewall','B','Phishing tricks you into giving personal info via fake emails or websites.',10],
    ['qu2','q1','What makes a strong password?','Your birthday','Your name','Random words + numbers + symbols','123456','C','Strong passwords mix uppercase, lowercase, numbers and symbols.',10],
    ['qu3','q1','What is 2FA?','Two Factor Authentication','Two Firewall Access','Two File Attachment','Two Form Auth','A','2FA adds a second login step making it much harder for hackers.',10],
    ['qu4','q1','Sign of a phishing email?','From a known contact','Has your name','Creates urgency and fear','Uses good grammar','C','Phishing emails create panic like "Your account will be deleted!" to rush you.',10],
    ['qu5','q1','What to do on public WiFi?','Do online banking','Share passwords','Use a VPN','Download files','C','Public WiFi is not secure. A VPN encrypts your connection.',10],
    ['qu6','q2','What is spear phishing?','Mass phishing emails','Targeted attack on a specific person','Fishing with a spear','Anti-virus software','B','Spear phishing targets a specific person using personal info.',10],
    ['qu7','q2','HTTPS means?','Hacked transfer protocol','Secure encrypted connection','Hypertext protocol','Home transfer system','B','HTTPS means the connection is encrypted — always check before entering passwords.',10],
    ['qu8','q2','What is a man-in-the-middle attack?','Two hackers working together','Attacker intercepts communication','A social engineering trick','A type of malware','B','MITM attacks intercept data between two parties without their knowledge.',10],
  ];
  for (const q of sampleQs) {
    await query(`
      INSERT INTO questions(id,quiz_id,question,option_a,option_b,option_c,option_d,correct,explanation,points)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO NOTHING
    `, q);
  }

  logger.info("Database initialized successfully");
}

module.exports = { query, pool, init };
