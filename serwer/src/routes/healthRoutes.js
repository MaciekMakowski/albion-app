const express = require("express");
const {
  healthController,
  metricsController,
  prometheusMetricsController,
} = require("../controllers/healthController");

const router = express.Router();

router.get("/health", healthController);
router.get("/metrics", metricsController);
router.get("/metrics/prometheus", prometheusMetricsController);

module.exports = router;
