const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { asyncHandler } = require("../middleware/errorHandler");
const logger = require("../utils/logger");

const router = express.Router();

const ALLOWED_ORIGINS = [
  "https://404-factory.com",
  "https://404factory.vincent-bichat.fr",
  "https://portfolio.vincent-bichat.fr",
];

// ── CORS restricted to allowed origins ──
router.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// ── Token authentication ──
function requireApiToken(req, res, next) {
  const token = process.env.API_TOKEN;
  if (!token) {
    logger.error("API_TOKEN environment variable is not set");
    return res.status(503).json({ error: "API not configured" });
  }

  const authHeader = req.headers.authorization;
  const provided =
    authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!provided) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  // Timing-safe comparison
  const a = Buffer.from(provided.padEnd(256, "\0"));
  const b = Buffer.from(token.padEnd(256, "\0"));
  if (!crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: "Invalid token" });
  }

  next();
}

router.use(requireApiToken);

// GET /api/external/reviews — list validated reviews
router.get(
  "/reviews",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const sort = [
      "date_desc",
      "date_asc",
      "rating_desc",
      "rating_asc",
    ].includes(req.query.sort)
      ? req.query.sort
      : "date_desc";
    const company = req.query.company || null;

    const result = await db.getValidatedReviews({ page, limit, sort, company });
    res.json(result);
  }),
);

// GET /api/external/reviews/stats — public statistics
router.get(
  "/reviews/stats",
  asyncHandler(async (req, res) => {
    const stats = await db.getStatistics();
    res.json(stats);
  }),
);

// GET /api/external/reviews/:id — single review
router.get(
  "/reviews/:id",
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id || isNaN(id)) {
      return res.status(400).json({ error: "Invalid review id" });
    }
    const review = await db.getReviewById(id);
    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }
    res.json(review);
  }),
);

module.exports = router;
