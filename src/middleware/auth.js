const crypto = require("crypto");
const logger = require("../utils/logger");

// In-memory session store
const sessions = new Map();

const SESSION_DURATION = 4 * 60 * 60 * 1000; // 4 hours
const CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 min

// Periodic cleanup of expired sessions to avoid memory leak
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now - session.createdAt > SESSION_DURATION) {
      sessions.delete(token);
    }
  }
}, CLEANUP_INTERVAL).unref(); // unref so it doesn't block process exit

function createSession() {
  const token = crypto.randomUUID();
  sessions.set(token, { createdAt: Date.now() });
  return token;
}

function isValidSession(token) {
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_DURATION) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function destroySession(token) {
  sessions.delete(token);
}

/**
 * Admin authentication middleware.
 * Checks for a valid session token in the Authorization header.
 */
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!isValidSession(token)) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

/**
 * Verify admin password using timing-safe comparison.
 * Password comes from ADMIN_PASSWORD env var, defaults to 'admin' in dev.
 */
function verifyPassword(password) {
  const expected = process.env.ADMIN_PASSWORD || "admin";
  if (typeof password !== "string" || password.length === 0) return false;

  // Timing-safe comparison: pad both to same length to prevent length-leak
  const a = Buffer.from(password.padEnd(256, "\0"));
  const b = Buffer.from(expected.padEnd(256, "\0"));
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  createSession,
  isValidSession,
  destroySession,
  requireAdmin,
  verifyPassword,
};
