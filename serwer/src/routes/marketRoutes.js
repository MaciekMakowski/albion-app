const express = require("express");
const {
  getPricesController,
  getHistoryController,
  getItemIconController,
  clearItemIconMemoryCacheController,
} = require("../controllers/marketController");
const { cacheMiddleware } = require("../middlewares/cacheMiddleware");

const router = express.Router();

router.get("/prices/:itemIds", cacheMiddleware(), getPricesController);
router.get("/history/:itemIds", cacheMiddleware(), getHistoryController);
router.get("/item-icon/:itemId", getItemIconController);
router.post("/item-icon/cache/clear", clearItemIconMemoryCacheController);

module.exports = router;
