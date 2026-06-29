const { recordRequest } = require("../services/metricsService");

function metricsMiddleware(req, res, next) {
  const start = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const routePath = req.route?.path || "";
    const baseUrl = req.baseUrl || "";
    const route =
      routePath && baseUrl
        ? `${baseUrl}${routePath}`
        : routePath || req.path || req.originalUrl || "unknown";
    recordRequest(req.method, route, res.statusCode, durationMs);
  });

  next();
}

module.exports = {
  metricsMiddleware,
};
