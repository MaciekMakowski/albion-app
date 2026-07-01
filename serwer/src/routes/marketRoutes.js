const express = require("express");
const {
  getPricesController,
  getHistoryController,
  getItemIconController,
} = require("../controllers/marketController");
const { cacheMiddleware } = require("../middlewares/cacheMiddleware");

const router = express.Router();

router.get("/prices/:itemIds", cacheMiddleware(), getPricesController);
router.get("/history/:itemIds", cacheMiddleware(), getHistoryController);
router.get("/item-icon/:itemId", getItemIconController);

module.exports = router;
