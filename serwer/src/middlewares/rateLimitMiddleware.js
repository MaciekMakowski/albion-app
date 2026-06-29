const rateLimit = require("express-rate-limit");

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 300);

const apiRateLimiter = rateLimit({
  windowMs:
    Number.isFinite(WINDOW_MS) && WINDOW_MS > 0 ? WINDOW_MS : 15 * 60 * 1000,
  max: Number.isFinite(MAX_REQUESTS) && MAX_REQUESTS > 0 ? MAX_REQUESTS : 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    req.path === "/health" ||
    req.path === "/metrics" ||
    req.path === "/metrics/prometheus",
  message: {
    error: "Too many requests, please try again later.",
  },
});

module.exports = {
  apiRateLimiter,
};
