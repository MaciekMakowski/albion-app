function enforceHttpsIfEnabled(req, res, next) {
  const enabled = String(
    process.env.ENABLE_HTTPS_REDIRECT || "false",
  ).toLowerCase();
  if (enabled !== "true") {
    next();
    return;
  }

  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    next();
    return;
  }

  const host = req.headers.host;
  if (!host) {
    res.status(400).json({ error: "Missing Host header." });
    return;
  }

  res.redirect(301, `https://${host}${req.originalUrl}`);
}

module.exports = {
  enforceHttpsIfEnabled,
};
