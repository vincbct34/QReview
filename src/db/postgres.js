/**
 * PostgreSQL database adapter for production.
 */
const { Pool } = require("pg");
const logger = require("../utils/logger");

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function init() {
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL,
        position VARCHAR(255) NOT NULL,
        duration VARCHAR(100) NOT NULL,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        email VARCHAR(255) NOT NULL,
        siret VARCHAR(14),
        company_verified BOOLEAN DEFAULT FALSE,
        validation_token VARCHAR(255) UNIQUE,
        is_validated BOOLEAN DEFAULT FALSE,
        admin_reply TEXT,
        flagged BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Migrate: add columns if missing
    const migrations = [
      "ALTER TABLE reviews ADD COLUMN IF NOT EXISTS admin_reply TEXT",
      "ALTER TABLE reviews ADD COLUMN IF NOT EXISTS flagged BOOLEAN DEFAULT FALSE",
      "ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tags TEXT",
      "ALTER TABLE reviews ADD COLUMN IF NOT EXISTS linkedin_id VARCHAR(255)",
      "ALTER TABLE reviews ADD COLUMN IF NOT EXISTS linkedin_verified BOOLEAN DEFAULT FALSE",
      "ALTER TABLE reviews ADD COLUMN IF NOT EXISTS linkedin_profile_url TEXT",
    ];
    for (const sql of migrations) {
      try {
        await client.query(sql);
      } catch (_) {
        /* column exists */
      }
    }
    // Indexes for query performance
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_reviews_validated ON reviews(is_validated)",
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_reviews_company ON reviews(company_name)",
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_reviews_flagged ON reviews(flagged)",
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at)",
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_reviews_email_company ON reviews(email, company_name)",
    );
    logger.info("PostgreSQL database initialized");
  } finally {
    client.release();
  }
}

async function createReview({
  company_name,
  position,
  duration,
  rating,
  comment,
  email,
  siret,
  company_verified,
  linkedin_id,
  linkedin_verified,
  linkedin_profile_url,
}) {
  const result = await getPool().query(
    `INSERT INTO reviews (company_name, position, duration, rating, comment, email, siret, company_verified, linkedin_id, linkedin_verified, linkedin_profile_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [
      company_name,
      position,
      duration,
      rating,
      comment,
      email,
      siret || null,
      company_verified,
      linkedin_id || null,
      linkedin_verified || false,
      linkedin_profile_url || null,
    ],
  );
  return result.rows[0].id;
}

async function validateReview(token) {
  const result = await getPool().query(
    "UPDATE reviews SET is_validated = TRUE, validation_token = NULL WHERE validation_token = $1 RETURNING id, company_verified",
    [token],
  );
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

async function getValidatedReviews({
  page = 1,
  limit = 20,
  sort = "date_desc",
  company = null,
}) {
  const offset = (page - 1) * limit;
  let orderBy = "created_at DESC";
  if (sort === "date_asc") orderBy = "created_at ASC";
  else if (sort === "rating_desc") orderBy = "rating DESC, created_at DESC";
  else if (sort === "rating_asc") orderBy = "rating ASC, created_at DESC";

  let whereClause = "WHERE is_validated = TRUE";
  const params = [];
  let paramIndex = 1;

  if (company) {
    whereClause += ` AND company_name ILIKE $${paramIndex++}`;
    params.push(`%${company}%`);
  }

  const countResult = await getPool().query(
    `SELECT COUNT(*) as total FROM reviews ${whereClause}`,
    params,
  );
  const total = parseInt(countResult.rows[0].total);

  params.push(limit);
  params.push(offset);
  const result = await getPool().query(
    `SELECT id, company_name, position, duration, rating, comment, created_at, company_verified, admin_reply, flagged
     FROM reviews ${whereClause} ORDER BY ${orderBy} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    params,
  );
  return {
    reviews: result.rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

async function getStatistics() {
  const result = await getPool().query(`
    SELECT 
      COUNT(*) as total_reviews,
      ROUND(AVG(rating)::numeric, 1) as average_rating,
      SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as stars_5,
      SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as stars_4,
      SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as stars_3,
      SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as stars_2,
      SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as stars_1,
      SUM(CASE WHEN company_verified = TRUE THEN 1 ELSE 0 END) as verified_count
    FROM reviews WHERE is_validated = TRUE
  `);
  return result.rows[0];
}

// ---- Admin methods ----

async function validateByAdmin(id) {
  const result = await getPool().query(
    "UPDATE reviews SET is_validated = TRUE, validation_token = NULL WHERE id = $1 AND is_validated = FALSE",
    [id],
  );
  return result.rowCount > 0;
}

async function bulkValidate(ids) {
  if (!ids.length) return 0;
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
  const result = await getPool().query(
    `UPDATE reviews SET is_validated = TRUE, validation_token = NULL WHERE id IN (${placeholders}) AND is_validated = FALSE`,
    ids,
  );
  return result.rowCount;
}

async function bulkDelete(ids) {
  if (!ids.length) return 0;
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
  const result = await getPool().query(
    `DELETE FROM reviews WHERE id IN (${placeholders})`,
    ids,
  );
  return result.rowCount;
}

async function getAllReviews({
  page = 1,
  limit = 50,
  filter = "all",
  search = null,
}) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (filter === "validated") conditions.push("is_validated = TRUE");
  else if (filter === "pending") conditions.push("is_validated = FALSE");
  else if (filter === "flagged") conditions.push("flagged = TRUE");

  if (search) {
    conditions.push(
      `(company_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex + 1} OR position ILIKE $${paramIndex + 2})`,
    );
    const term = `%${search}%`;
    params.push(term, term, term);
    paramIndex += 3;
  }

  const whereClause =
    conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  const countResult = await getPool().query(
    `SELECT COUNT(*) as total FROM reviews ${whereClause}`,
    params,
  );
  const total = parseInt(countResult.rows[0].total);

  params.push(limit);
  params.push(offset);
  const result = await getPool().query(
    `SELECT id, company_name, position, duration, rating, comment, email, siret, company_verified, linkedin_verified, is_validated, admin_reply, flagged, created_at
     FROM reviews ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    params,
  );
  return {
    reviews: result.rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

async function deleteReview(id) {
  const result = await getPool().query("DELETE FROM reviews WHERE id = $1", [
    id,
  ]);
  return result.rowCount > 0;
}

async function addAdminReply(id, reply) {
  const result = await getPool().query(
    "UPDATE reviews SET admin_reply = $1 WHERE id = $2",
    [reply, id],
  );
  return result.rowCount > 0;
}

async function flagReview(id, flagged) {
  const result = await getPool().query(
    "UPDATE reviews SET flagged = $1 WHERE id = $2",
    [flagged, id],
  );
  return result.rowCount > 0;
}

async function getReviewById(id) {
  const result = await getPool().query(
    `SELECT id, company_name, position, duration, rating, comment, created_at, company_verified, admin_reply, flagged
     FROM reviews WHERE id = $1 AND is_validated = TRUE`,
    [id],
  );
  return result.rows[0] || null;
}

async function checkDuplicateReview(email, company_name) {
  const result = await getPool().query(
    `SELECT COUNT(*) as count FROM reviews WHERE email = $1 AND company_name = $2 AND created_at > NOW() - INTERVAL '24 hours'`,
    [email, company_name],
  );
  return parseInt(result.rows[0].count) > 0;
}

async function getAdminStats() {
  const result = await getPool().query(`
    SELECT
      COUNT(*) as total_reviews,
      SUM(CASE WHEN is_validated = TRUE THEN 1 ELSE 0 END) as validated,
      SUM(CASE WHEN is_validated = FALSE THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN flagged = TRUE THEN 1 ELSE 0 END) as flagged,
      ROUND(AVG(CASE WHEN is_validated = TRUE THEN rating END)::numeric, 1) as average_rating
    FROM reviews
  `);
  return result.rows[0];
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  init,
  close,
  createReview,
  validateReview,
  validateByAdmin,
  bulkValidate,
  bulkDelete,
  getValidatedReviews,
  getReviewById,
  getStatistics,
  getAllReviews,
  deleteReview,
  addAdminReply,
  flagReview,
  checkDuplicateReview,
  getAdminStats,
};
