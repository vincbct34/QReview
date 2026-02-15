/**
 * QReview — API Integration Tests
 */

const request = require("supertest");
const path = require("path");
const fs = require("fs");

// Ensure test environment
process.env.NODE_ENV = "test";
process.env.PORT = "0"; // random port

let app;
let server;
let db;
let testId = Date.now(); // unique per run

beforeAll(async () => {
  // Remove stale test DB
  const dbPath = path.join(__dirname, "..", "reviews.db");
  try {
    fs.unlinkSync(dbPath);
  } catch (_) {}

  // Fresh require to avoid cached singletons
  db = require("../src/db");
  await db.init();

  const express = require("express");
  const cors = require("cors");
  const compression = require("compression");

  const reviewsRouter = require("../src/routes/reviews");
  const qrcodeRouter = require("../src/routes/qrcode");
  const { errorHandler } = require("../src/middleware/errorHandler");

  app = express();
  app.use(cors());
  app.use(compression());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "public")));
  app.use("/api/reviews", reviewsRouter);
  app.use("/api/qrcode", qrcodeRouter);
  app.get("/health", (req, res) => res.json({ status: "ok" }));
  app.use(errorHandler);
});

afterAll(async () => {
  if (db && db.close) await db.close();
});

// ─── Health ───

describe("GET /health", () => {
  it("should return status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

// ─── Reviews CRUD ───

describe("Reviews API", () => {
  const validReview = {
    company_name: "Test Corp",
    position: "Developer",
    duration: "2 ans",
    rating: 5,
    comment: "Great place to work",
    email: `test-${testId}@example.com`,
    siret: null,
  };

  describe("POST /api/reviews", () => {
    it("should create a review with valid data", async () => {
      const res = await request(app).post("/api/reviews").send(validReview);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("id");
      expect(res.body).toHaveProperty("message");
    });

    it("should reject a review without rating", async () => {
      const res = await request(app)
        .post("/api/reviews")
        .send({ ...validReview, rating: undefined });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("should reject a review with invalid email", async () => {
      const res = await request(app)
        .post("/api/reviews")
        .send({ ...validReview, email: "not-an-email" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("should reject a review with rating out of range", async () => {
      const res = await request(app)
        .post("/api/reviews")
        .send({ ...validReview, rating: 6 });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("should reject a review with missing company name", async () => {
      const res = await request(app)
        .post("/api/reviews")
        .send({ ...validReview, company_name: "" });

      expect(res.status).toBe(400);
    });

    it("should reject a review with missing position", async () => {
      const res = await request(app)
        .post("/api/reviews")
        .send({ ...validReview, position: "" });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/reviews", () => {
    it("should return paginated reviews", async () => {
      const res = await request(app).get("/api/reviews");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("reviews");
      expect(res.body).toHaveProperty("totalPages");
      expect(Array.isArray(res.body.reviews)).toBe(true);
    });

    it("should accept sort parameter", async () => {
      const res = await request(app).get("/api/reviews?sort=rating_desc");
      expect(res.status).toBe(200);
    });

    it("should accept company filter", async () => {
      const res = await request(app).get("/api/reviews?company=Test");
      expect(res.status).toBe(200);
    });

    it("should accept page and limit parameters", async () => {
      const res = await request(app).get("/api/reviews?page=1&limit=5");
      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/reviews/stats", () => {
    it("should return statistics", async () => {
      const res = await request(app).get("/api/reviews/stats");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("total_reviews");
    });
  });

  describe("POST /api/reviews/:id/flag", () => {
    it("should flag a review", async () => {
      // First create a review to have a valid id
      const create = await request(app)
        .post("/api/reviews")
        .send({
          ...validReview,
          email: `flag-${testId}@example.com`,
          company_name: "Flag Corp",
        });

      const id = create.body.id;
      const res = await request(app).post(`/api/reviews/${id}/flag`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("message");
    });

    it("should reject invalid id", async () => {
      const res = await request(app).post("/api/reviews/abc/flag");
      expect(res.status).toBe(400);
    });
  });
});

// ─── SIRET Verification ───

describe("SIRET Verification", () => {
  it("should reject invalid SIRET format", async () => {
    const res = await request(app).get("/api/reviews/verify-siret/123");
    expect(res.status).toBe(400);
  });

  it("should accept 14-digit SIRET", async () => {
    const res = await request(app).get(
      "/api/reviews/verify-siret/12345678901234",
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("valid");
  });
});

// ─── QR Code ───

describe("QR Code API", () => {
  describe("GET /api/qrcode", () => {
    it("should return QR code data URL", async () => {
      const res = await request(app).get("/api/qrcode");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("qrCode");
      expect(res.body).toHaveProperty("url");
      expect(res.body.qrCode).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe("GET /api/qrcode/download", () => {
    it("should return PNG buffer", async () => {
      const res = await request(app).get("/api/qrcode/download");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/image\/png/);
    }, 15000);
  });

  describe("GET /api/qrcode/svg", () => {
    it("should return SVG", async () => {
      const res = await request(app).get("/api/qrcode/svg");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/image\/svg/);
    });
  });
});

// ─── Admin Validation ───

describe("Admin Validation", () => {
  it("should create a review as pending", async () => {
    const create = await request(app)
      .post("/api/reviews")
      .send({
        company_name: "Validation Test Corp",
        position: "Tester",
        duration: "1 an",
        rating: 4,
        comment: "Testing validation",
        email: `validate-${testId}@example.com`,
        siret: null,
      });

    expect(create.status).toBe(200);
    expect(create.body).toHaveProperty("id");
    expect(create.body.message).toContain("validation");
  });
});

// ─── Validators Unit Tests ───

describe("Validators", () => {
  const {
    validateReview,
    validateAdminReply,
  } = require("../src/utils/validators");

  it("should pass valid review", () => {
    const errors = validateReview({
      company_name: "Test",
      position: "Dev",
      duration: "1 an",
      rating: 4,
      email: "test@test.com",
    });
    expect(errors).toHaveLength(0);
  });

  it("should catch missing fields", () => {
    const errors = validateReview({});
    expect(errors.length).toBeGreaterThan(0);
  });

  it("should catch invalid rating", () => {
    const errors = validateReview({
      company_name: "Test",
      position: "Dev",
      duration: "1 an",
      rating: 10,
      email: "test@test.com",
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("should catch invalid email", () => {
    const errors = validateReview({
      company_name: "Test",
      position: "Dev",
      duration: "1 an",
      rating: 3,
      email: "bad-email",
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("should validate admin reply", () => {
    expect(
      validateAdminReply({ reply: "Great feedback, thanks!" }),
    ).toHaveLength(0);
    expect(validateAdminReply({ reply: "" }).length).toBeGreaterThan(0);
    expect(validateAdminReply({ reply: null }).length).toBeGreaterThan(0);
    expect(
      validateAdminReply({ reply: "x".repeat(5001) }).length,
    ).toBeGreaterThan(0);
  });
});

// ─── Static Files ───

describe("Static Files", () => {
  it("should serve index.html", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
  });

  it("should serve style.css", async () => {
    const res = await request(app).get("/css/style.css");
    expect(res.status).toBe(200);
  });

  it("should serve script.js", async () => {
    const res = await request(app).get("/js/script.js");
    expect(res.status).toBe(200);
  });
});
