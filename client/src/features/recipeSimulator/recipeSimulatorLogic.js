import itemsData from "../../data/items.json";
import namesData from "../../data/items_names.json";

export const buyCities = [
  "Bridgewatch",
  "Martlock",
  "Lymhurst",
  "Fort Sterling",
  "Thetford",
  "Caerleon",
  "Black Market",
];

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
      lookup[uniqueName] = localizedName || uniqueName;
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

export function buildItemIndex(entries, lookup) {
  const itemsIndex = entries.map((it) => {
    const displayName = lookup[it.id] || it.name || it.id;
    return {
      id: it.id,
      name: displayName,
      text: (it.id + " " + displayName).toLowerCase(),
    };
  });
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

export const supportedLanguages = buildLanguageOptions(namesData);

export function getDefaultLanguage() {
  return supportedLanguages.includes("PL-PL")
    ? "PL-PL"
    : supportedLanguages[0] || "EN-US";
}
