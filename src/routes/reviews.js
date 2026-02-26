const express = require("express");
const db = require("../db");
const { verifySiret } = require("../utils/siret");
const { validateReview } = require("../utils/validators");
const { asyncHandler } = require("../middleware/errorHandler");
const { reviewLimiter, siretLimiter } = require("../middleware/rateLimiter");
const logger = require("../utils/logger");

const router = express.Router();

// Verify SIRET endpoint
router.get(
  "/verify-siret/:siret",
  siretLimiter,
  asyncHandler(async (req, res) => {
    const { siret } = req.params;
    if (!/^\d{14}$/.test(siret)) {
      return res.status(400).json({ error: "Invalid SIRET format" });
    }
    const result = await verifySiret(siret);
    res.json(result);
  }),
);

// Get statistics
router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const stats = await db.getStatistics();
    res.json(stats);
  }),
);

// Get validated reviews (with pagination, sort, filter)
router.get(
  "/",
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

// Submit a review
router.post(
  "/",
  reviewLimiter,
  asyncHandler(async (req, res) => {
    const {
      company_name,
      position,
      duration,
      rating,
      comment,
      email,
      siret,
      linkedin_id,
      linkedin_verified,
      linkedin_profile_url,
      author_name,
    } = req.body;

    // Server-side validation
    const errors = validateReview(req.body);
    if (errors.length > 0) {
      return res
        .status(400)
        .json({ error: errors.join(", "), details: errors });
    }

    // Anti-spam: check duplicate review from same email for same company (24h window)
    const isDuplicate = await db.checkDuplicateReview(email, company_name);
    if (isDuplicate) {
      return res.status(429).json({
        error: "You have already submitted a review for this company recently.",
      });
    }

    // Verify SIRET if provided
    let verified = false;
    let finalCompanyName = company_name;
    if (siret && siret.length === 14) {
      const verification = await verifySiret(siret);
      verified = verification.valid;
      if (verified && verification.company_name) {
        finalCompanyName = verification.company_name;
      }
    }

    const reviewId = await db.createReview({
      company_name: finalCompanyName,
      position,
      duration,
      rating: parseInt(rating),
      comment: comment || null,
      email,
      siret: siret || null,
      company_verified: verified,
      linkedin_id: linkedin_id || null,
      linkedin_verified: linkedin_verified || false,
      linkedin_profile_url: linkedin_profile_url || null,
      author_name: author_name || null,
    });

    logger.info(
      {
        reviewId,
        company: finalCompanyName,
        linkedinVerified: linkedin_verified,
      },
      "New review submitted — pending admin validation",
    );

    res.json({
      message:
        "Votre avis a bien été soumis. Il sera visible après validation par un administrateur.",
      id: reviewId,
      company_verified: verified,
      linkedin_verified: linkedin_verified || false,
    });
  }),
);

// Get a single validated review by id (permalink)
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id || isNaN(id))
      return res.status(400).json({ error: "Invalid review id" });
    const review = await db.getReviewById(id);
    if (!review) return res.status(404).json({ error: "Review not found" });
    res.json(review);
  }),
);

// Flag a review (public — visitors can report)
router.post(
  "/:id/flag",
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid review id" });
    await db.flagReview(id, true);
    res.json({ message: "Review flagged for moderation" });
  }),
);

module.exports = router;
