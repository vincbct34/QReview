/**
 * SQLite database adapter for local development.
 */
const Database = require("better-sqlite3");
const path = require("path");
const logger = require("../utils/logger");

let db;

function getDb() {
  if (!db) {
    db = new Database(path.join(__dirname, "../../reviews.db"));
    db.pragma("journal_mode = WAL");
  }
  return db;
}

async function init() {
  const conn = getDb();
  conn.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      position TEXT NOT NULL,
      duration TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT,
      email TEXT NOT NULL,
      siret TEXT,
      company_verified INTEGER DEFAULT 0,
      validation_token TEXT UNIQUE,
      is_validated INTEGER DEFAULT 0,
      admin_reply TEXT,
      flagged INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Add new columns if they don't exist (migration-safe)
  try {
    conn.exec("ALTER TABLE reviews ADD COLUMN admin_reply TEXT");
  } catch (_) {
    /* already exists */
  }
  try {
    conn.exec("ALTER TABLE reviews ADD COLUMN flagged INTEGER DEFAULT 0");
  } catch (_) {
    /* already exists */
  }
  try {
    conn.exec("ALTER TABLE reviews ADD COLUMN tags TEXT");
  } catch (_) {
    /* already exists */
  }
  try {
    conn.exec("ALTER TABLE reviews ADD COLUMN linkedin_id TEXT");
  } catch (_) {
    /* already exists */
  }
  try {
    conn.exec(
      "ALTER TABLE reviews ADD COLUMN linkedin_verified INTEGER DEFAULT 0",
    );
  } catch (_) {
    /* already exists */
  }
  try {
    conn.exec("ALTER TABLE reviews ADD COLUMN linkedin_profile_url TEXT");
  } catch (_) {
    /* already exists */
  }
  try {
    conn.exec("ALTER TABLE reviews ADD COLUMN author_name TEXT");
  } catch (_) {
    /* already exists */
  }
  // Indexes for query performance
  conn.exec(
    "CREATE INDEX IF NOT EXISTS idx_reviews_validated ON reviews(is_validated)",
  );
  conn.exec(
    "CREATE INDEX IF NOT EXISTS idx_reviews_company ON reviews(company_name)",
  );
  conn.exec(
    "CREATE INDEX IF NOT EXISTS idx_reviews_flagged ON reviews(flagged)",
  );
  conn.exec(
    "CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at)",
  );
  conn.exec(
    "CREATE INDEX IF NOT EXISTS idx_reviews_email_company ON reviews(email, company_name)",
  );
  logger.info("SQLite database initialized");
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
  author_name,
}) {
  const stmt = getDb().prepare(
    `INSERT INTO reviews (company_name, position, duration, rating, comment, email, siret, company_verified, linkedin_id, linkedin_verified, linkedin_profile_url, author_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const info = stmt.run(
    company_name,
    position,
    duration,
    rating,
    comment,
    email,
    siret || null,
    company_verified ? 1 : 0,
    linkedin_id || null,
    linkedin_verified ? 1 : 0,
    linkedin_profile_url || null,
    author_name || null,
  );
  return info.lastInsertRowid;
}

async function validateReview(token) {
  const row = getDb()
    .prepare("SELECT id FROM reviews WHERE validation_token = ?")
    .get(token);
  if (!row) return null;
  getDb()
    .prepare(
      "UPDATE reviews SET is_validated = 1, validation_token = NULL WHERE id = ?",
    )
    .run(row.id);
  return { id: row.id, validated: true };
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

  let whereClause = "WHERE is_validated = 1";
  const params = [];
  if (company) {
    whereClause += " AND company_name LIKE ?";
    params.push(`%${company}%`);
  }

  const countStmt = getDb().prepare(
    `SELECT COUNT(*) as total FROM reviews ${whereClause}`,
  );
  const { total } = countStmt.get(...params);

  params.push(limit, offset);
  const stmt = getDb().prepare(
    `SELECT id, company_name, position, duration, rating, comment, created_at, company_verified, linkedin_verified, linkedin_profile_url, admin_reply, flagged, author_name
     FROM reviews ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
  );
  const reviews = stmt.all(...params);
  return { reviews, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function getStatistics() {
  const conn = getDb();
  const stats = conn
    .prepare(
      `
    SELECT 
      COUNT(*) as total_reviews,
      ROUND(AVG(rating), 1) as average_rating,
      SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as stars_5,
      SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as stars_4,
      SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as stars_3,
      SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as stars_2,
      SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as stars_1,
      SUM(CASE WHEN company_verified = 1 THEN 1 ELSE 0 END) as verified_count
    FROM reviews WHERE is_validated = 1
  `,
    )
    .get();
  return stats;
}

// ---- Admin methods ----

async function validateByAdmin(id) {
  const stmt = getDb().prepare(
    "UPDATE reviews SET is_validated = 1, validation_token = NULL WHERE id = ? AND is_validated = 0",
  );
  const info = stmt.run(id);
  return info.changes > 0;
}

async function bulkValidate(ids) {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => "?").join(",");
  const stmt = getDb().prepare(
    `UPDATE reviews SET is_validated = 1, validation_token = NULL WHERE id IN (${placeholders}) AND is_validated = 0`,
  );
  const info = stmt.run(...ids);
  return info.changes;
}

async function bulkDelete(ids) {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => "?").join(",");
  const stmt = getDb().prepare(
    `DELETE FROM reviews WHERE id IN (${placeholders})`,
  );
  const info = stmt.run(...ids);
  return info.changes;
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

  if (filter === "validated") conditions.push("is_validated = 1");
  else if (filter === "pending") conditions.push("is_validated = 0");
  else if (filter === "flagged") conditions.push("flagged = 1");

  if (search) {
    conditions.push("(company_name LIKE ? OR email LIKE ? OR position LIKE ?)");
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  const whereClause =
    conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  const countStmt = getDb().prepare(
    `SELECT COUNT(*) as total FROM reviews ${whereClause}`,
  );
  const { total } = countStmt.get(...params);

  const allParams = [...params, limit, offset];
  const stmt = getDb().prepare(
    `SELECT id, company_name, position, duration, rating, comment, email, siret, company_verified, linkedin_verified, is_validated, admin_reply, flagged, created_at
     FROM reviews ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
  );
  const reviews = stmt.all(...allParams);
  return { reviews, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function deleteReview(id) {
  const stmt = getDb().prepare("DELETE FROM reviews WHERE id = ?");
  const info = stmt.run(id);
  return info.changes > 0;
}

async function addAdminReply(id, reply) {
  const stmt = getDb().prepare(
    "UPDATE reviews SET admin_reply = ? WHERE id = ?",
  );
  const info = stmt.run(reply, id);
  return info.changes > 0;
}

async function flagReview(id, flagged) {
  const stmt = getDb().prepare("UPDATE reviews SET flagged = ? WHERE id = ?");
  const info = stmt.run(flagged ? 1 : 0, id);
  return info.changes > 0;
}

async function getReviewById(id) {
  const stmt = getDb().prepare(
    `SELECT id, company_name, position, duration, rating, comment, created_at, company_verified, linkedin_verified, linkedin_profile_url, admin_reply, flagged, author_name
     FROM reviews WHERE id = ? AND is_validated = 1`,
  );
  return stmt.get(id) || null;
}

async function checkDuplicateReview(email, company_name) {
  const stmt = getDb().prepare(
    `SELECT COUNT(*) as count FROM reviews WHERE email = ? AND company_name = ? AND created_at > datetime('now', '-24 hours')`,
  );
  const { count } = stmt.get(email, company_name);
  return count > 0;
}

async function getAdminStats() {
  const conn = getDb();
  const stats = conn
    .prepare(
      `
    SELECT
      COUNT(*) as total_reviews,
      SUM(CASE WHEN is_validated = 1 THEN 1 ELSE 0 END) as validated,
      SUM(CASE WHEN is_validated = 0 THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN flagged = 1 THEN 1 ELSE 0 END) as flagged,
      ROUND(AVG(CASE WHEN is_validated = 1 THEN rating END), 1) as average_rating
    FROM reviews
  `,
    )
    .get();
  return stats;
}

async function close() {
  if (db) {
    db.close();
    db = null;
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
