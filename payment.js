// ══════════════════════════════════════════════════════
//  CyberBuddy — DPO Pay Payment Integration
//  Supports: MTN MoMo, Airtel Money, Visa, Mastercard
// ══════════════════════════════════════════════════════
const axios  = require("axios");
const logger = require("./logger");

const BASE_URL    = process.env.DPO_BASE_URL    || "https://secure.3gdirectpay.com";
const COMPANY_TOKEN = process.env.DPO_COMPANY_TOKEN || "";
const SERVICE_TYPE  = process.env.DPO_SERVICE_TYPE  || "";
const APP_URL     = process.env.APP_URL || "http://localhost:3000";
const PRICE       = parseFloat(process.env.PREMIUM_PRICE_USD || "2");

// ── Create a payment token with DPO ──────────────────
async function createToken({ userId, username, email, months }) {
  const amount   = (PRICE * months).toFixed(2);
  const ref      = "CB-" + userId.substring(0,8).toUpperCase() + "-" + Date.now();
  const expiry   = new Date(Date.now() + 24*60*60*1000)
    .toISOString().replace(/[-:T]/g,"").substring(0,14); // YYYYMMDDHHmmss

  // DPO uses XML API
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>${COMPANY_TOKEN}</CompanyToken>
  <Request>createToken</Request>
  <Transaction>
    <PaymentAmount>${amount}</PaymentAmount>
    <PaymentCurrency>USD</PaymentCurrency>
    <CompanyRef>${ref}</CompanyRef>
    <RedirectURL>${APP_URL}/api/payment/verify</RedirectURL>
    <BackURL>${APP_URL}/pricing</BackURL>
    <CompanyRefUnique>0</CompanyRefUnique>
    <PTL>24</PTL>
    <TransactionSource>CyberBuddy Premium</TransactionSource>
  </Transaction>
  <Services>
    <Service>
      <ServiceType>${SERVICE_TYPE}</ServiceType>
      <ServiceDescription>CyberBuddy Premium - ${months} month(s)</ServiceDescription>
      <ServiceDate>${new Date().toISOString().split("T")[0]}</ServiceDate>
    </Service>
  </Services>
  <CustomerFirstName>${username}</CustomerFirstName>
  <CustomerLastName>.</CustomerLastName>
  <CustomerEmail>${email}</CustomerEmail>
</API3G>`;

  const resp = await axios.post(`${BASE_URL}/API/v6/`, xml, {
    headers: { "Content-Type": "application/xml" },
    timeout: 10000,
  });

  // Parse XML response
  const transToken = resp.data.match(/<TransToken>(.*?)<\/TransToken>/)?.[1];
  const result     = resp.data.match(/<Result>(.*?)<\/Result>/)?.[1];
  const resultExp  = resp.data.match(/<ResultExplanation>(.*?)<\/ResultExplanation>/)?.[1];

  if (result !== "000") {
    throw new Error(`DPO token creation failed: ${resultExp || result}`);
  }

  return {
    transToken,
    ref,
    amount,
    paymentUrl: `${BASE_URL}/payv2.php?ID=${transToken}`,
  };
}

// ── Verify a payment after redirect ──────────────────
async function verifyPayment(transToken) {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>${COMPANY_TOKEN}</CompanyToken>
  <Request>verifyToken</Request>
  <TransactionToken>${transToken}</TransactionToken>
</API3G>`;

  const resp = await axios.post(`${BASE_URL}/API/v6/`, xml, {
    headers: { "Content-Type": "application/xml" },
    timeout: 10000,
  });

  const result         = resp.data.match(/<Result>(.*?)<\/Result>/)?.[1];
  const resultExp      = resp.data.match(/<ResultExplanation>(.*?)<\/ResultExplanation>/)?.[1];
  const companyRef     = resp.data.match(/<CompanyRef>(.*?)<\/CompanyRef>/)?.[1];
  const customerEmail  = resp.data.match(/<CustomerEmail>(.*?)<\/CustomerEmail>/)?.[1];
  const transactionRef = resp.data.match(/<TransactionRef>(.*?)<\/TransactionRef>/)?.[1];
  const amount         = resp.data.match(/<TransactionAmount>(.*?)<\/TransactionAmount>/)?.[1];

  // Result "000" = success
  const success = result === "000";

  return { success, result, resultExp, companyRef, customerEmail, transactionRef, amount };
}

module.exports = { createToken, verifyPayment, PRICE };
