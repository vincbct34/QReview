/**
 * Server-side validation helpers.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateReview({
  company_name,
  position,
  duration,
  rating,
  email,
  comment,
  siret,
}) {
  const errors = [];

  if (
    !company_name ||
    typeof company_name !== "string" ||
    company_name.trim().length === 0
  ) {
    errors.push("company_name is required");
  } else if (company_name.length > 255) {
    errors.push("company_name must be at most 255 characters");
  }

  if (
    !position ||
    typeof position !== "string" ||
    position.trim().length === 0
  ) {
    errors.push("position is required");
  } else if (position.length > 255) {
    errors.push("position must be at most 255 characters");
  }

  if (
    !duration ||
    typeof duration !== "string" ||
    duration.trim().length === 0
  ) {
    errors.push("duration is required");
  } else if (duration.length > 100) {
    errors.push("duration must be at most 100 characters");
  }

  const r = Number(rating);
  if (!rating || !Number.isInteger(r) || r < 1 || r > 5) {
    errors.push("rating must be an integer between 1 and 5");
  }

  if (!email || !EMAIL_RE.test(email)) {
    errors.push("A valid email is required");
  } else if (email.length > 255) {
    errors.push("email must be at most 255 characters");
  }

  if (comment && comment.length > 5000) {
    errors.push("comment must be at most 5000 characters");
  }

  if (siret && !/^\d{14}$/.test(siret)) {
    errors.push("siret must be exactly 14 digits");
  }

  return errors;
}

function validateAdminReply({ reply }) {
  const errors = [];
  if (!reply || typeof reply !== "string" || reply.trim().length === 0) {
    errors.push("reply is required");
  } else if (reply.length > 2000) {
    errors.push("reply must be at most 2000 characters");
  }
  return errors;
}

module.exports = { validateReview, validateAdminReply };
