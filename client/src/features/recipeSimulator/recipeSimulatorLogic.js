import itemsData from "../../data/items.json";
import namesData from "../../data/items_names.json";
import { MARKET_CITIES } from "../../shared/cities";

export const buyCities = MARKET_CITIES;

export function collectItemEntries(source) {
  const entries = [];
  const defs = {};
  const seen = new Set();

  function walk(node) {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      if (typeof node["@uniquename"] === "string") {
        const id = node["@uniquename"];
        if (!seen.has(id)) {
          seen.add(id);
          entries.push({ id, name: id });
          defs[id] = node;
        } else if (
          defs[id] &&
          !defs[id].craftingrequirements &&
          node.craftingrequirements
        ) {
          defs[id] = node;
        }
      }
      Object.values(node).forEach(walk);
    }
  }

  walk(source);
  return { entries, defs };
}

export function buildLanguageOptions(source) {
  const locales = new Set();
  (source || []).forEach((entry) => {
    if (entry?.LocalizedNames && typeof entry.LocalizedNames === "object") {
      Object.keys(entry.LocalizedNames).forEach((locale) =>
        locales.add(locale),
      );
    }
  });
  const ordered = Array.from(locales).sort();
  return ordered.length > 0 ? ordered : ["EN-US", "PL-PL"];
}

export function buildNameLookup(source, language) {
  const lookup = {};
  (source || []).forEach((entry) => {
    const uniqueName = entry?.UniqueName;
    const localizedName = entry?.LocalizedNames?.[language];
    if (uniqueName) {
      const resolvedName = localizedName || uniqueName;
      lookup[uniqueName] = resolvedName;

      // items_names.json stores T5_WOOD_LEVEL1@1 -> also register T5_WOOD_LEVEL1 (items.json key)
      const atLevelMatch = String(uniqueName).match(/^(.*_LEVEL[1-4])@[1-4]$/);
      if (atLevelMatch) {
        lookup[atLevelMatch[1]] = lookup[atLevelMatch[1]] || resolvedName;
      }

      // Generic @N enchant (e.g. T4_POTION_HEAL@1) -> also register base id
      if (!atLevelMatch) {
        const atMatch = String(uniqueName).match(/^(.+)@\d+$/);
        if (atMatch) {
          lookup[atMatch[1]] = lookup[atMatch[1]] || resolvedName;
        }
      }
    }
  });
  return lookup;
}

export function getItemDisplayName(itemId, lookup) {
  if (!itemId) return "";
  return lookup[itemId] || itemId;
}

export function getItemTier(itemId) {
  if (!itemId) return null;
  const match = String(itemId).match(/(^|[_-])(t\d+)(?=_|$)/i);
  if (!match) return null;
  return match[2].toUpperCase();
}

export function getItemDisplayLabel(itemId, lookup) {
  const name = getItemDisplayName(itemId, lookup);
  const tier = getItemTier(itemId);
  if (!name) return "";
  return tier ? `${name} (${tier})` : name;
}

export function getItemDataSource(source = itemsData) {
  return source?.items || source;
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function hasExplicitEnchantInId(itemId) {
  return (
    /_LEVEL[1-4]$/i.test(String(itemId || "")) ||
    /@\d+$/i.test(String(itemId || ""))
  );
}

function getEnchantLevelsFromDef(def) {
  const levels = new Set();
  for (const ench of toArray(def?.enchantments?.enchantment)) {
    const level = parseInt(ench?.["@enchantmentlevel"] || "", 10);
    if (Number.isFinite(level) && level > 0) {
      levels.add(level);
    }
  }
  return Array.from(levels).sort((a, b) => a - b);
}

function buildSearchText(itemId, displayName, enchantLevel) {
  const enchantHints =
    enchantLevel > 0
      ? ` @${enchantLevel} .${enchantLevel} level${enchantLevel} enchant ${enchantLevel}`
      : "";
  return `${itemId} ${displayName}${enchantHints}`.toLowerCase();
}

export function buildItemIndex(entries, lookup, defs = {}) {
  const seenIds = new Set();
  const itemsIndex = [];

  function pushIndexItem(itemId, fallbackName, enchantLevel = 0) {
    if (!itemId || seenIds.has(itemId)) return;
    seenIds.add(itemId);

    const displayName = lookup[itemId] || fallbackName || itemId;
    itemsIndex.push({
      id: itemId,
      name: displayName,
      text: buildSearchText(itemId, displayName, enchantLevel),
    });
  }

  for (const it of entries) {
    const baseId = it.id;
    const baseName = lookup[baseId] || it.name || baseId;
    const def = defs?.[baseId];

    pushIndexItem(baseId, baseName, 0);

    if (hasExplicitEnchantInId(baseId)) continue;

    const enchantLevels = getEnchantLevelsFromDef(def);
    for (const level of enchantLevels) {
      const variantId = `${baseId}@${level}`;
      const variantName = lookup[variantId] || baseName;
      pushIndexItem(variantId, variantName, level);
    }
  }

  const itemsMap = Object.fromEntries(
    entries.map((it) => [it.id, lookup[it.id] || it.name || it.id]),
  );

  return { itemsIndex, itemsMap };
}

export function resolveOutputItemId(value, itemsIndex) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;

  const exactId = (itemsIndex || []).find(
    (item) => item.id.toLowerCase() === trimmed.toLowerCase(),
  );
  if (exactId) return exactId.id;

  const exactName = (itemsIndex || []).find(
    (item) => item.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (exactName) return exactName.id;

  return null;
}

const fullySupportedUiLanguages = ["EN-US", "PL-PL", "DE-DE", "FR-FR"];
const availableDataLanguages = buildLanguageOptions(namesData);

export const supportedLanguages = fullySupportedUiLanguages.filter((locale) =>
  availableDataLanguages.includes(locale),
);

export function getDefaultLanguage() {
  return supportedLanguages.includes("PL-PL")
    ? "PL-PL"
    : supportedLanguages[0] || "EN-US";
}
