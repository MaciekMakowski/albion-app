const MAX_ITEM_IDS = Number(process.env.MAX_ITEM_IDS || 100);
const MAX_LOCATIONS = Number(process.env.MAX_LOCATIONS || 20);
const MAX_IDS_PARAM_LENGTH = Number(process.env.MAX_IDS_PARAM_LENGTH || 4000);
const MAX_LOCATIONS_PARAM_LENGTH = Number(
  process.env.MAX_LOCATIONS_PARAM_LENGTH || 2000,
);
const ITEM_ID_PATTERN = /^[A-Z0-9_@-]+$/i;
const LOCATION_PATTERN = /^[A-Za-z][A-Za-z\s-]{1,39}$/;
const MAX_TIME_SCALE = Number(process.env.MAX_TIME_SCALE || 720);

function createBadRequestError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeRegion(value) {
  const region = String(value || "europe").toLowerCase();
  if (region === "europe" || region === "west" || region === "east") {
    return region;
  }
  return null;
}

function parseItemIds(rawItemIds) {
  const input = String(rawItemIds || "");
  if (input.length > MAX_IDS_PARAM_LENGTH) {
    throw createBadRequestError("itemIds parameter too long.");
  }

  const parsed = input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (parsed.length === 0) {
    throw createBadRequestError("At least one item id is required.");
  }

  if (parsed.length > MAX_ITEM_IDS) {
    throw createBadRequestError(
      `Too many item ids. Max allowed: ${MAX_ITEM_IDS}.`,
    );
  }

  const invalidItemId = parsed.find((id) => !ITEM_ID_PATTERN.test(id));
  if (invalidItemId) {
    throw createBadRequestError(`Invalid item id format: ${invalidItemId}`);
  }

  return parsed;
}

function parseLocations(rawLocations) {
  if (!rawLocations) return [];

  const input = String(rawLocations);
  if (input.length > MAX_LOCATIONS_PARAM_LENGTH) {
    throw createBadRequestError("locations parameter too long.");
  }

  const parsed = input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (parsed.length > MAX_LOCATIONS) {
    throw createBadRequestError(
      `Too many locations. Max allowed: ${MAX_LOCATIONS}.`,
    );
  }

  const invalidLocation = parsed.find((name) => !LOCATION_PATTERN.test(name));
  if (invalidLocation) {
    throw createBadRequestError(`Invalid location format: ${invalidLocation}`);
  }

  return parsed;
}

function parseTimeScale(value) {
  const timeScale = Number(value);
  if (
    !Number.isFinite(timeScale) ||
    timeScale <= 0 ||
    timeScale > MAX_TIME_SCALE
  ) {
    throw createBadRequestError(
      `Invalid timeScale. Must be a positive number up to ${MAX_TIME_SCALE}.`,
    );
  }
  return timeScale;
}

function buildQuery(params) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === "") return;
    searchParams.set(key, String(value));
  });
  const serialized = searchParams.toString();
  return serialized ? `?${serialized}` : "";
}

module.exports = {
  normalizeRegion,
  parseItemIds,
  parseLocations,
  parseTimeScale,
  buildQuery,
};
