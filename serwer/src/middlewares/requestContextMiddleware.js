const crypto = require("crypto");

function buildRequestId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function requestContextMiddleware(req, res, next) {
  const requestId = req.headers["x-request-id"] || buildRequestId();
  req.requestId = String(requestId);
  res.setHeader("X-Request-Id", req.requestId);
  next();
}

module.exports = {
  requestContextMiddleware,
};
