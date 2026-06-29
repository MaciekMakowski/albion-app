function notFoundHandler(req, res, _next) {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.originalUrl}`,
    requestId: req.requestId,
  });
}

function errorHandler(err, req, res, _next) {
  const statusCode =
    err?.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 502;
  const isProduction =
    String(process.env.NODE_ENV || "development") === "production";

  if (
    statusCode >= 500 &&
    req.method === "GET" &&
    req.staleCacheEntry &&
    req.staleCacheEntry.payload
  ) {
    res.set("X-Cache", "STALE");
    res.status(200).json(req.staleCacheEntry.payload);
    return;
  }

  const clientMessage =
    statusCode < 500
      ? err?.message || "Bad request."
      : isProduction
        ? "Internal server error."
        : err?.message || "Unexpected server error";

  const logPayload = {
    level: "error",
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode,
    message: err?.message || String(err),
    details: err?.details,
    stack: isProduction ? undefined : err?.stack,
    timestamp: new Date().toISOString(),
  };
  console.error(JSON.stringify(logPayload));

  res.status(statusCode).json({
    error: clientMessage,
    requestId: req.requestId,
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
