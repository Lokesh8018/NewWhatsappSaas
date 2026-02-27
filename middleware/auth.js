const crypto = require("crypto");

// Simple in-memory rate limiter for sensitive endpoints
const rateLimitMap = new Map();
function rateLimit(key, maxRequests = 10, windowMs = 60000) {
  const now = Date.now();
  const entry = rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count += 1;
  rateLimitMap.set(key, entry);
  return entry.count > maxRequests;
}

// In-memory store of valid session tokens (token -> expiry)
const validTokens = new Map();
const ADMIN_COOKIE = "wa_admin_session";
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function isValidToken(token) {
  if (!token || !validTokens.has(token)) return false;
  if (Date.now() > validTokens.get(token)) {
    validTokens.delete(token);
    return false;
  }
  return true;
}

function isAuthenticated(req, res, next) {
  if (isValidToken(req.cookies && req.cookies[ADMIN_COOKIE])) {
    return next();
  }
  res.redirect("/admin/login");
}

function isAuthenticatedAPI(req, res, next) {
  if (isValidToken(req.cookies && req.cookies[ADMIN_COOKIE])) {
    return next();
  }
  res.status(401).json({ status: false, message: "Unauthorized" });
}

function apiKeyAuth(req, res, next) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return next(); // API_KEY not set = open access (backward compatible)
  const provided = req.query.api_key || req.headers["x-api-key"];
  if (provided === apiKey) return next();
  res.status(401).json({ status: false, message: "Invalid or missing API key" });
}

module.exports = {
  rateLimit,
  generateToken,
  isValidToken,
  isAuthenticated,
  isAuthenticatedAPI,
  apiKeyAuth,
  ADMIN_COOKIE,
  TOKEN_TTL_MS,
  validTokens,
};
