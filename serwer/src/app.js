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
  staticFrontendMiddleware, // <-- to jest kluczowe
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

// Podstawowe middleware'e niezależne od ścieżki
app.use(requestContextMiddleware);
app.use(requestLoggerMiddleware);
app.use(metricsMiddleware);
app.use(helmet());
app.use(enforceHttpsIfEnabled);
// **************** KLUCZOWA ZMIANA TUTAJ ****************
// Przenieś staticFrontendMiddleware PRZED parsowaniem ciała żądania i przed trasami API.
// To zapewni, że pliki statyczne (takie jak CSS) zostaną obsłużone w pierwszej kolejności.
app.use(staticFrontendMiddleware);

app.use(cors(corsOptions)); // CORS ZAWSZE przed parsowaniem ciała, aby preflight OPTIONS działało


// Middleware'y do parsowania ciała żądania (tylko dla API)
app.use(express.json({ limit: jsonLimit }));
app.use(
  express.urlencoded({ extended: false, limit: jsonLimit, parameterLimit: 50 }),
);

// Trasy API
app.use("/api", apiRateLimiter);
app.use("/api", healthRoutes);
app.use("/api/market", marketRoutes);

// SSR middleware - powinien być na końcu, po plikach statycznych i API,
// aby obsługiwał resztę tras frontendu.
app.use(frontendSsrMiddleware); // <-- Pozostaje tu

// Obsługa błędów (zawsze na końcu)
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;