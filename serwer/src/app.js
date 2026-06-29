const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const healthRoutes = require("./routes/healthRoutes");
const marketRoutes = require("./routes/marketRoutes");
const { apiRateLimiter } = require("./middlewares/rateLimitMiddleware");
const { metricsMiddleware } = require("./middlewares/metricsMiddleware");
const {
  requestContextMiddleware,
} = require("./middlewares/requestContextMiddleware");
const {
  requestLoggerMiddleware,
} = require("./middlewares/requestLoggerMiddleware");
const {
  enforceHttpsIfEnabled,
} = require("./middlewares/transportSecurityMiddleware");
const {
  notFoundHandler,
  errorHandler,
} = require("./middlewares/errorHandlers");
const {
  frontendSsrMiddleware,
  staticFrontendMiddleware,
} = require("./middlewares/frontendSsrMiddleware");

const app = express();
const trustProxy = process.env.TRUST_PROXY || "1";

const allowedOrigins = String(process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const fallbackOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

const finalAllowedOrigins =
  allowedOrigins.length > 0 ? allowedOrigins : fallbackOrigins;

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (finalAllowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    const corsError = new Error("Blocked by CORS policy");
    corsError.statusCode = 403;
    callback(corsError);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

const jsonLimit = process.env.JSON_BODY_LIMIT || "100kb";

app.set("trust proxy", trustProxy);
app.disable("x-powered-by");
app.use(requestContextMiddleware);
app.use(requestLoggerMiddleware);
app.use(metricsMiddleware);
app.use(helmet());
app.use(enforceHttpsIfEnabled);
app.use(cors(corsOptions));
app.use(express.json({ limit: jsonLimit }));
app.use(
  express.urlencoded({ extended: false, limit: jsonLimit, parameterLimit: 50 }),
);
app.use("/api", apiRateLimiter);

app.use("/api", healthRoutes);
app.use("/api/market", marketRoutes);
app.use(staticFrontendMiddleware);
app.use(frontendSsrMiddleware);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
