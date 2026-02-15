const express = require("express");
const db = require("../db");
const {
  requireAdmin,
  verifyPassword,
  createSession,
  destroySession,
} = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const { adminLoginLimiter } = require("../middleware/rateLimiter");
const { validateAdminReply } = require("../utils/validators");
const logger = require("../utils/logger");
const path = require("path");
const QRCode = require("qrcode");

const router = express.Router();

// Serve admin page
router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../../public/admin.html"));
});

// Login
router.post(
  "/login",
  adminLoginLimiter,
  asyncHandler(async (req, res) => {
    const { password } = req.body;

    if (!password || !verifyPassword(password)) {
      return res.status(401).json({ error: "Invalid password" });
    }

    const token = createSession();
    logger.info("Admin logged in");
    res.json({ token });
  }),
);

// Logout
router.post("/logout", requireAdmin, (req, res) => {
  const token = req.headers.authorization?.slice(7);
  destroySession(token);
  res.json({ message: "Logged out" });
});

// Get admin dashboard stats
router.get(
  "/stats",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const stats = await db.getAdminStats();
    res.json(stats);
  }),
);

// Get all reviews (admin view, with search)
router.get(
  "/reviews",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const filter = ["all", "validated", "pending", "flagged"].includes(
      req.query.filter,
    )
      ? req.query.filter
      : "all";
    const search = req.query.search ? req.query.search.trim() : null;

    const result = await db.getAllReviews({ page, limit, filter, search });
    res.json(result);
  }),
);

// Manually validate a pending review
router.post(
  "/reviews/:id/validate",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid review id" });

    const validated = await db.validateByAdmin(id);
    if (!validated)
      return res
        .status(404)
        .json({ error: "Review not found or already validated" });

    logger.info({ reviewId: id }, "Review manually validated by admin");
    res.json({ message: "Review validated" });
  }),
);

// Delete a review
router.delete(
  "/reviews/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid review id" });

    const deleted = await db.deleteReview(id);
    if (!deleted) return res.status(404).json({ error: "Review not found" });

    logger.info({ reviewId: id }, "Review deleted by admin");
    res.json({ message: "Review deleted" });
  }),
);

// Reply to a review
router.post(
  "/reviews/:id/reply",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid review id" });

    const errors = validateAdminReply(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(", ") });
    }

    const updated = await db.addAdminReply(id, req.body.reply);
    if (!updated) return res.status(404).json({ error: "Review not found" });

    logger.info({ reviewId: id }, "Admin replied to review");
    res.json({ message: "Reply added" });
  }),
);

// Unflag / toggle flag
router.post(
  "/reviews/:id/flag",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    const flagged =
      req.body.flagged !== undefined ? Boolean(req.body.flagged) : false;

    await db.flagReview(id, flagged);
    res.json({ message: flagged ? "Review flagged" : "Review unflagged" });
  }),
);

// Bulk validate reviews
router.post(
  "/reviews/bulk/validate",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No review ids provided" });
    }
    const count = await db.bulkValidate(
      ids.map((id) => parseInt(id)).filter(Boolean),
    );
    logger.info({ count, ids }, "Bulk validation by admin");
    res.json({ message: `${count} avis validés`, count });
  }),
);

// Bulk delete reviews
router.post(
  "/reviews/bulk/delete",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No review ids provided" });
    }
    const count = await db.bulkDelete(
      ids.map((id) => parseInt(id)).filter(Boolean),
    );
    logger.info({ count, ids }, "Bulk deletion by admin");
    res.json({ message: `${count} avis supprimés`, count });
  }),
);

// Export reviews as CSV
router.get(
  "/export/csv",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { reviews } = await db.getAllReviews({
      page: 1,
      limit: 10000,
      filter: "all",
    });

    const headers = [
      "id",
      "company_name",
      "position",
      "duration",
      "rating",
      "comment",
      "email",
      "siret",
      "company_verified",
      "linkedin_verified",
      "is_validated",
      "flagged",
      "admin_reply",
      "created_at",
    ];
    const csvRows = [headers.join(",")];

    for (const r of reviews) {
      const row = headers.map((h) => {
        let val = r[h] ?? "";
        val = String(val).replace(/"/g, '""');
        return `"${val}"`;
      });
      csvRows.push(row.join(","));
    }

    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="qreview-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
    res.send("\uFEFF" + csvRows.join("\n")); // BOM for Excel
  }),
);

// ── QR Code (Admin only) ──

// Generate QR Code as data URL
router.get(
  "/api/qrcode",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const url = process.env.BASE_URL || "http://localhost:3000";
    const qrCode = await QRCode.toDataURL(url, {
      width: 400,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
    res.json({ qrCode, url });
  }),
);

// Generate QR Code as downloadable PNG
router.get(
  "/api/qrcode/download",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const url = process.env.BASE_URL || "http://localhost:3000";
    const size = Math.min(2000, Math.max(200, parseInt(req.query.size) || 800));

    const buffer = await QRCode.toBuffer(url, {
      width: size,
      margin: 2,
      type: "png",
      color: { dark: "#000000", light: "#ffffff" },
    });

    res.set({
      "Content-Type": "image/png",
      "Content-Disposition": 'attachment; filename="qreview-qrcode.png"',
      "Content-Length": buffer.length,
    });
    res.send(buffer);
  }),
);

// Generate QR Code as SVG
router.get(
  "/api/qrcode/svg",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const url = process.env.BASE_URL || "http://localhost:3000";
    const svg = await QRCode.toString(url, {
      type: "svg",
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });

    res.set({
      "Content-Type": "image/svg+xml",
      "Content-Disposition": 'attachment; filename="qreview-qrcode.svg"',
    });
    res.send(svg);
  }),
);

module.exports = router;
