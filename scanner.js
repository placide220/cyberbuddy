// ══════════════════════════════════════════════════════
//  CyberBuddy — Website Security Scanner
//  Performs legal, passive security checks only
// ══════════════════════════════════════════════════════
const https  = require("https");
const http   = require("http");
const tls    = require("tls");
const dns    = require("dns").promises;
const { URL } = require("url");
const logger = require("./logger");

// ── HELPERS ──────────────────────────────────────────
function grade(score) {
  if (score >= 90) return { grade: "A+", color: "green" };
  if (score >= 80) return { grade: "A",  color: "green" };
  if (score >= 70) return { grade: "B",  color: "cyan"  };
  if (score >= 55) return { grade: "C",  color: "yellow"};
  if (score >= 40) return { grade: "D",  color: "orange"};
  return             { grade: "F",  color: "red"   };
}

function fetchWithTimeout(urlStr, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const mod    = parsed.protocol === "https:" ? https : http;
    const req    = mod.get(urlStr, {
      timeout,
      headers: { "User-Agent": "CyberBuddy-SecurityScanner/1.0 (educational)" },
      rejectUnauthorized: false,
    }, (res) => {
      const headers = res.headers;
      const status  = res.statusCode;
      res.destroy();
      resolve({ headers, status });
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
    req.on("error",  reject);
  });
}

// ── 1. SSL/TLS CHECK ─────────────────────────────────
async function checkSSL(hostname) {
  return new Promise((resolve) => {
    const socket = tls.connect(443, hostname, { rejectUnauthorized: false, servername: hostname }, () => {
      try {
        const cert    = socket.getPeerCertificate(true);
        const proto   = socket.getProtocol();
        const valid   = socket.authorized;
        const expires = cert.valid_to ? new Date(cert.valid_to) : null;
        const daysLeft= expires ? Math.floor((expires - Date.now()) / 86400000) : null;
        const issuer  = cert.issuer?.O || "Unknown";
        const subject = cert.subject?.CN || hostname;
        socket.destroy();
        resolve({
          ok: true,
          hasSSL: true,
          valid,
          protocol: proto,
          issuer,
          subject,
          expires: expires?.toDateString(),
          daysLeft,
          expiringSoon: daysLeft !== null && daysLeft < 30,
          expired: daysLeft !== null && daysLeft < 0,
        });
      } catch(e) {
        socket.destroy();
        resolve({ ok: true, hasSSL: true, valid: false, error: e.message });
      }
    });
    socket.setTimeout(6000);
    socket.on("timeout", () => { socket.destroy(); resolve({ ok: false, hasSSL: false, error: "TLS timeout" }); });
    socket.on("error",  (e) => resolve({ ok: false, hasSSL: false, error: e.message }));
  });
}

// ── 2. SECURITY HEADERS CHECK ────────────────────────
function checkHeaders(headers) {
  const checks = [
    {
      key:   "strict-transport-security",
      name:  "HSTS",
      desc:  "Forces browsers to use HTTPS",
      good:  "Present",
      bad:   "Missing — browsers may use HTTP",
    },
    {
      key:   "content-security-policy",
      name:  "Content Security Policy",
      desc:  "Prevents XSS & code injection attacks",
      good:  "Present",
      bad:   "Missing — vulnerable to XSS attacks",
    },
    {
      key:   "x-frame-options",
      name:  "X-Frame-Options",
      desc:  "Prevents clickjacking attacks",
      good:  "Present",
      bad:   "Missing — vulnerable to clickjacking",
    },
    {
      key:   "x-content-type-options",
      name:  "X-Content-Type-Options",
      desc:  "Prevents MIME-type sniffing",
      good:  "Present",
      bad:   "Missing — MIME sniffing possible",
    },
    {
      key:   "referrer-policy",
      name:  "Referrer Policy",
      desc:  "Controls referrer information",
      good:  "Present",
      bad:   "Missing — leaks referrer data",
    },
    {
      key:   "permissions-policy",
      name:  "Permissions Policy",
      desc:  "Controls browser feature access",
      good:  "Present",
      bad:   "Missing",
    },
  ];

  const results = checks.map(c => ({
    name:    c.name,
    desc:    c.desc,
    present: !!headers[c.key],
    value:   headers[c.key] || null,
    message: headers[c.key] ? c.good : c.bad,
  }));

  // Check for dangerous headers
  const dangers = [];
  if (headers["server"]) dangers.push({ name: "Server header exposed", value: headers["server"], risk: "Reveals server software version to attackers" });
  if (headers["x-powered-by"]) dangers.push({ name: "X-Powered-By exposed", value: headers["x-powered-by"], risk: "Reveals technology stack to attackers" });

  return { results, dangers };
}

// ── 3. DNS CHECK ─────────────────────────────────────
async function checkDNS(hostname) {
  const results = [];
  try {
    // Check MX records (email security)
    try {
      const mx = await dns.resolveMx(hostname);
      results.push({ check: "MX Records", status: "ok", value: mx.map(r => r.exchange).join(", "), note: "Email routing configured" });
    } catch { results.push({ check: "MX Records", status: "warn", value: "None", note: "No email server configured" }); }

    // Check SPF record (prevent email spoofing)
    try {
      const txt = await dns.resolveTxt(hostname);
      const spf = txt.flat().find(r => r.startsWith("v=spf1"));
      if (spf) results.push({ check: "SPF Record", status: "ok", value: spf.substring(0, 60) + "...", note: "Email spoofing protection active" });
      else results.push({ check: "SPF Record", status: "warn", value: "Missing", note: "No SPF — domain can be spoofed in emails" });

      // Check DMARC
      try {
        const dmarc = await dns.resolveTxt("_dmarc." + hostname);
        const dmarcVal = dmarc.flat().find(r => r.startsWith("v=DMARC1"));
        if (dmarcVal) results.push({ check: "DMARC Record", status: "ok", value: dmarcVal.substring(0, 60), note: "Email authentication policy set" });
        else results.push({ check: "DMARC Record", status: "warn", value: "Missing", note: "No DMARC policy — phishing risk" });
      } catch { results.push({ check: "DMARC Record", status: "warn", value: "Missing", note: "No DMARC policy — phishing risk" }); }

    } catch { results.push({ check: "SPF Record", status: "warn", value: "Error", note: "Could not check TXT records" }); }

    // Check if domain resolves
    try {
      const addr = await dns.resolve4(hostname);
      results.push({ check: "DNS Resolution", status: "ok", value: addr[0], note: "Domain resolves correctly" });
    } catch { results.push({ check: "DNS Resolution", status: "fail", value: "Failed", note: "Domain does not resolve" }); }

  } catch(e) {
    results.push({ check: "DNS Check", status: "fail", value: "Error", note: e.message });
  }
  return results;
}

// ── 4. REDIRECT CHECK ────────────────────────────────
async function checkRedirects(hostname) {
  return new Promise((resolve) => {
    const req = http.get(`http://${hostname}`, {
      headers: { "User-Agent": "CyberBuddy-SecurityScanner/1.0" }
    }, (res) => {
      req.destroy();
      const redirectsToHTTPS = res.statusCode >= 300 && res.statusCode < 400 &&
        (res.headers.location || "").startsWith("https://");
      resolve({
        httpStatus: res.statusCode,
        redirectsToHTTPS,
        location: res.headers.location || null,
      });
    });
    req.setTimeout(5000);
    req.on("timeout", () => { req.destroy(); resolve({ httpStatus: null, redirectsToHTTPS: false }); });
    req.on("error",   ()  => resolve({ httpStatus: null, redirectsToHTTPS: false }));
  });
}

// ── MAIN SCAN FUNCTION ───────────────────────────────
async function scan(targetUrl) {
  // Normalize URL
  let urlStr = targetUrl.trim();
  if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://"))
    urlStr = "https://" + urlStr;
  const parsed   = new URL(urlStr);
  const hostname = parsed.hostname;
  const isHTTPS  = parsed.protocol === "https:";

  logger.info("Security scan started", { hostname });

  // Run all checks in parallel
  const [sslResult, redirectResult, dnsResult, httpResult] = await Promise.allSettled([
    checkSSL(hostname),
    checkRedirects(hostname),
    checkDNS(hostname),
    fetchWithTimeout(urlStr).catch(() => fetchWithTimeout("http://" + hostname)),
  ]);

  const ssl      = sslResult.status      === "fulfilled" ? sslResult.value      : { hasSSL: false, error: "Check failed" };
  const redirect = redirectResult.status === "fulfilled" ? redirectResult.value  : { redirectsToHTTPS: false };
  const dnsChecks= dnsResult.status      === "fulfilled" ? dnsResult.value       : [];
  const http_res = httpResult.status     === "fulfilled" ? httpResult.value       : { headers: {}, status: null };

  const headerChecks = checkHeaders(http_res.headers || {});

  // ── SCORING ──────────────────────────────────────
  let score = 100;
  const issues = [];
  const passes = [];

  // SSL (30 pts)
  if (!ssl.hasSSL) {
    score -= 30; issues.push({ severity: "critical", msg: "No SSL/HTTPS — all data is unencrypted" });
  } else {
    if (ssl.expired)      { score -= 25; issues.push({ severity: "critical", msg: "SSL certificate has EXPIRED" }); }
    else if (ssl.expiringSoon) { score -= 10; issues.push({ severity: "warning", msg: `SSL cert expires in ${ssl.daysLeft} days` }); }
    else passes.push(`SSL certificate valid (expires ${ssl.expires})`);
    if (ssl.protocol === "TLSv1" || ssl.protocol === "TLSv1.1")
      { score -= 10; issues.push({ severity: "warning", msg: `Weak TLS version: ${ssl.protocol}` }); }
    else if (ssl.protocol) passes.push(`Strong TLS: ${ssl.protocol}`);
  }

  // HTTPS redirect (10 pts)
  if (redirect.redirectsToHTTPS) passes.push("HTTP redirects to HTTPS correctly");
  else { score -= 10; issues.push({ severity: "warning", msg: "HTTP does not redirect to HTTPS" }); }

  // Security headers (30 pts — 5 each)
  headerChecks.results.forEach(h => {
    if (h.present) passes.push(`${h.name}: present`);
    else { score -= 5; issues.push({ severity: "warning", msg: `Missing header: ${h.name} — ${h.bad || h.message}` }); }
  });

  // Exposed headers (5 pts each)
  headerChecks.dangers.forEach(d => {
    score -= 5; issues.push({ severity: "info", msg: `${d.name}: "${d.value}" — ${d.risk}` });
  });

  // DNS (15 pts)
  dnsChecks.forEach(d => {
    if (d.status === "ok") passes.push(`${d.check}: ${d.note}`);
    else if (d.status === "warn") { score -= 5; issues.push({ severity: "info", msg: `${d.check}: ${d.note}` }); }
    else { score -= 8; issues.push({ severity: "warning", msg: `${d.check} failed: ${d.note}` }); }
  });

  score = Math.max(0, Math.min(100, score));
  const { grade: g, color } = grade(score);

  return {
    url:      urlStr,
    hostname,
    score,
    grade:    g,
    color,
    scannedAt: new Date().toISOString(),
    ssl,
    redirect,
    headers:  headerChecks,
    dns:      dnsChecks,
    issues:   issues.sort((a,b) => {
      const order = { critical:0, warning:1, info:2 };
      return (order[a.severity]||3) - (order[b.severity]||3);
    }),
    passes,
    summary: issues.length === 0
      ? "Excellent! No security issues found."
      : `Found ${issues.filter(i=>i.severity==="critical").length} critical and ${issues.filter(i=>i.severity==="warning").length} warnings.`,
  };
}

module.exports = { scan };
