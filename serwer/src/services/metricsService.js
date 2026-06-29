const client = require("prom-client");

const startedAt = Date.now();

const registry = new client.Registry();
client.collectDefaultMetrics({
  register: registry,
  prefix: "albion_app_",
});

const httpRequestsTotal = new client.Counter({
  name: "albion_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_class", "status_code"],
  registers: [registry],
});

const httpDurationSeconds = new client.Histogram({
  name: "albion_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_class"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

const state = {
  totalRequests: 0,
  status2xx: 0,
  status3xx: 0,
  status4xx: 0,
  status5xx: 0,
  status429: 0,
  totalDurationMs: 0,
  maxDurationMs: 0,
};

function recordRequest(method, route, statusCode, durationMs) {
  state.totalRequests += 1;

  if (statusCode >= 200 && statusCode < 300) state.status2xx += 1;
  if (statusCode >= 300 && statusCode < 400) state.status3xx += 1;
  if (statusCode >= 400 && statusCode < 500) state.status4xx += 1;
  if (statusCode >= 500) state.status5xx += 1;
  if (statusCode === 429) state.status429 += 1;

  const safeDuration =
    Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
  state.totalDurationMs += safeDuration;
  state.maxDurationMs = Math.max(state.maxDurationMs, safeDuration);

  const normalizedMethod = String(method || "UNKNOWN").toUpperCase();
  const normalizedRoute = route || "unknown";
  const normalizedStatusCode = String(statusCode || 0);
  const statusClass = `${normalizedStatusCode[0] || "0"}xx`;

  httpRequestsTotal.inc({
    method: normalizedMethod,
    route: normalizedRoute,
    status_class: statusClass,
    status_code: normalizedStatusCode,
  });
  httpDurationSeconds.observe(
    {
      method: normalizedMethod,
      route: normalizedRoute,
      status_class: statusClass,
    },
    safeDuration / 1000,
  );
}

function getMetricsSnapshot() {
  const averageDurationMs =
    state.totalRequests > 0 ? state.totalDurationMs / state.totalRequests : 0;

  return {
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    startedAt: new Date(startedAt).toISOString(),
    requests: {
      total: state.totalRequests,
      byClass: {
        "2xx": state.status2xx,
        "3xx": state.status3xx,
        "4xx": state.status4xx,
        "5xx": state.status5xx,
      },
      status429: state.status429,
    },
    latency: {
      averageMs: Number(averageDurationMs.toFixed(2)),
      maxMs: state.maxDurationMs,
    },
    timestamp: new Date().toISOString(),
  };
}

async function getPrometheusMetrics() {
  return registry.metrics();
}

function getPrometheusContentType() {
  return registry.contentType;
}

module.exports = {
  recordRequest,
  getMetricsSnapshot,
  getPrometheusMetrics,
  getPrometheusContentType,
};
