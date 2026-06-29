const {
  getMetricsSnapshot,
  getPrometheusMetrics,
  getPrometheusContentType,
} = require("../services/metricsService");

function healthController(_req, res) {
  res.json({
    ok: true,
    service: "serwer",
    timestamp: new Date().toISOString(),
  });
}

function metricsController(_req, res) {
  res.json(getMetricsSnapshot());
}

async function prometheusMetricsController(_req, res, next) {
  try {
    const contentType = getPrometheusContentType();
    if (contentType) {
      res.set("Content-Type", contentType);
    }
    res.send(await getPrometheusMetrics());
  } catch (error) {
    next(error);
  }
}

module.exports = {
  healthController,
  metricsController,
  prometheusMetricsController,
};
