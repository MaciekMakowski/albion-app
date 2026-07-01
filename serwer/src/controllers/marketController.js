const {
  normalizeRegion,
  parseItemIds,
  parseLocations,
  parseTimeScale,
} = require("../utils/marketParams");
const { fetchPrices, fetchHistory } = require("../services/marketService");
const { getItemIcon } = require("../services/itemIconService");

async function getPricesController(req, res, next) {
  try {
    const region = normalizeRegion(req.query.region);
    if (!region) {
      res
        .status(400)
        .json({ error: "Invalid region. Use europe, west or east." });
      return;
    }

    const itemIds = parseItemIds(req.params.itemIds);
    const locations = parseLocations(req.query.locations);
    const data = await fetchPrices({ region, itemIds, locations });
    res.json(data);
  } catch (error) {
    next(error);
  }
}

async function getHistoryController(req, res, next) {
  try {
    const region = normalizeRegion(req.query.region);
    if (!region) {
      res
        .status(400)
        .json({ error: "Invalid region. Use europe, west or east." });
      return;
    }

    const itemIds = parseItemIds(req.params.itemIds);
    const timeScale = parseTimeScale(
      req.query.timeScale || req.query["time-scale"] || 24,
    );
    const locations = parseLocations(req.query.locations);
    const data = await fetchHistory({ region, itemIds, locations, timeScale });
    res.json(data);
  } catch (error) {
    next(error);
  }
}

async function getItemIconController(req, res, next) {
  try {
    const result = await getItemIcon({
      itemId: req.params.itemId,
      size: req.query.size,
      quality: req.query.quality,
      locale: req.query.locale,
    });

    res.set("Content-Type", result.contentType || "image/png");
    res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.set("X-Cache", result.cacheStatus || "MISS");
    res.status(200).send(result.buffer);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getPricesController,
  getHistoryController,
  getItemIconController,
};
