const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const session = require("express-session");
const passport = require("passport");
const path = require("path");
require("dotenv").config();

const db = require("./db");
const logger = require("./utils/logger");
const { errorHandler } = require("./middleware/errorHandler");
const { apiLimiter } = require("./middleware/rateLimiter");

// Routes
const reviewsRouter = require("./routes/reviews");
const adminRouter = require("./routes/admin");
const authRouter = require("./routes/auth");

const app = express();
const port = process.env.PORT || 3000;

// ── Trust proxy (Railway / reverse proxies) ──
app.set("trust proxy", 1);

// ── Security & compression ──
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
      },
    },
  }),
);
app.use(compression());
app.use(express.json({ limit: "100kb" }));

// ── Session & Passport (for LinkedIn OAuth) ──
app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "qreview-linkedin-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 3600000, // 1 hour
    },
  }),
);
app.use(passport.initialize());
app.use(passport.session());

// ── Static files with cache headers ──
app.use(
  express.static("public", {
    maxAge: process.env.NODE_ENV === "production" ? "7d" : 0,
    etag: true,
  }),
);

// ── Rate limiting ──
app.use("/api", apiLimiter);

// ── API routes ──
app.use("/auth", authRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/admin", adminRouter);

// ── Health check ──
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    db: process.env.NODE_ENV === "production" ? "postgresql" : "sqlite",
    uptime: Math.round(process.uptime()),
  });
});

// ── SPA-style routes (serve HTML pages for client-side rendering) ──
app.get("/company/:name", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/company.html"));
});
app.get("/review/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/review.html"));
});

// ── Centralised error handler ──
app.use(errorHandler);

// ── Start ──
let server;
db.init()
  .then(() => {
    server = app.listen(port, () => {
      logger.info(`Server running on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    logger.fatal({ err }, "Failed to initialise database");
    process.exit(1);
  });

// ── Graceful shutdown ──
async function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);
  if (server) {
    server.close(() => {
      logger.info("HTTP server closed");
    });
  }
  try {
    await db.close();
    logger.info("Database connection closed");
  } catch (_) {}
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
