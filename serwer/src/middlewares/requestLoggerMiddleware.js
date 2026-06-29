function requestLoggerMiddleware(req, res, next) {
  const start = Date.now();

  res.on("finish", () => {
    if (req.path === "/health") {
      return;
    }

    const durationMs = Date.now() - start;
    const level =
      res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

    const payload = {
      level,
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      ip: req.ip,
      userAgent: req.headers["user-agent"] || "",
      timestamp: new Date().toISOString(),
    };
  });

  next();
}

module.exports = {
  requestLoggerMiddleware,
};
