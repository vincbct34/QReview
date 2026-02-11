const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Initialize database
async function initDB() {
  const client = await pool.connect();
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
        validation_token VARCHAR(255) UNIQUE,
        is_validated BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
}

// Routes

// Submit a review
app.post('/api/reviews', async (req, res) => {
  const { company_name, position, duration, rating, comment, email } = req.body;

  if (!company_name || !position || !duration || !rating || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const validationToken = crypto.randomUUID();

  try {
    const result = await pool.query(
      `INSERT INTO reviews (company_name, position, duration, rating, comment, email, validation_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, validation_token`,
      [company_name, position, duration, rating, comment, email, validationToken]
    );

    const reviewId = result.rows[0].id;

    // Send validation email
    const validationUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/validate/${validationToken}`;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@qreview.app',
      to: email,
      subject: 'Validez votre avis sur QReview',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Merci pour votre avis !</h2>
          <p>Bonjour,</p>
          <p>Merci d'avoir pris le temps de partager votre expérience de travail.</p>
          <p>Pour confirmer la publication de votre avis, veuillez cliquer sur le bouton ci-dessous :</p>
          <a href="${validationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #6366f1; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">Valider mon avis</a>
          <p>Ou copiez ce lien dans votre navigateur :</p>
          <p style="color: #666; word-break: break-all;">${validationUrl}</p>
          <p style="font-size: 12px; color: #999;">Si vous n'avez pas demandé cet avis, vous pouvez ignorer cet email.</p>
        </div>
      `
    });

    res.json({
      message: 'Review submitted. Please check your email to validate it.',
      id: reviewId
    });
  } catch (err) {
    console.error('Error submitting review:', err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// Validate a review
app.get('/api/validate/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const result = await pool.query(
      'UPDATE reviews SET is_validated = TRUE, validation_token = NULL WHERE validation_token = $1 RETURNING id',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired validation token' });
    }

    res.json({ message: 'Review validated successfully' });
  } catch (err) {
    console.error('Error validating review:', err);
    res.status(500).json({ error: 'Failed to validate review' });
  }
});

// Get all validated reviews
app.get('/api/reviews', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, company_name, position, duration, rating, comment, created_at
       FROM reviews WHERE is_validated = TRUE ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching reviews:', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Generate QR Code
app.get('/api/qrcode', async (req, res) => {
  try {
    const url = process.env.BASE_URL || 'http://localhost:3000';
    const qrCode = await QRCode.toDataURL(url);
    res.json({ qrCode, url });
  } catch (err) {
    console.error('Error generating QR code:', err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
initDB().then(() => {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
});
