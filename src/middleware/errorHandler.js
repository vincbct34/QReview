const logger = require("../utils/logger");

/**
 * Centralised error-handling middleware for Express.
 */
function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const message = status === 500 ? "Internal server error" : err.message;

  logger.error({ err, method: req.method, url: req.originalUrl }, message);

  res.status(status).json({ error: message });
}

/**
 * Wrap an async route handler so rejected promises are forwarded to Express error middleware.
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { errorHandler, asyncHandler };
