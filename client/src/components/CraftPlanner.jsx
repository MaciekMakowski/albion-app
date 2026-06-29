import { useEffect, useMemo, useState } from "react";
import itemsData from "../data/items.json";
import { getUiText } from "../features/recipeSimulator/translations";
import { useItemsData } from "../hooks/useItemsData";
import {
  fetchItemsPricesBatch,
  getCityName,
  getSellPrice,
} from "../shared/marketApi";

const CRAFT_CITIES = [
  "Bridgewatch",
  "Martlock",
  "Lymhurst",
  "Fort Sterling",
  "Thetford",
  "Caerleon",
];

function toArr(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function formatId(id) {
  if (!id) return "";
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const CATEGORY_TREE = (() => {
  const categories = toArr(itemsData?.items?.shopcategories?.shopcategory);
  const tree = [];
  for (const cat of categories) {
    const catId = cat["@id"];
    if (!catId) continue;
    const subcats = toArr(cat.shopsubcategory);
    const subTree = [];
    for (const sub of subcats) {
      const subId = sub["@id"];
      if (!subId) continue;
      const sub2s = toArr(sub.shopsubcategory2);
      const sub2Tree = [];
      for (const sub2 of sub2s) {
        if (sub2["@hideindropdown"] === "true") continue;
        if (!sub2["@id"]) continue;
        sub2Tree.push({
          id: sub2["@id"],
          label: formatId(sub2["@id"]),
        });
      }
      if (sub2Tree.length > 0) {
        subTree.push({
          id: subId,
          label: formatId(subId),
          items: sub2Tree,
        });
      }
    }
    if (subTree.length > 0) {
      tree.push({
        id: catId,
        label: formatId(catId),
        subcats: subTree,
      });
    }
  }
  return tree;
})();

function extractRecipe(craftReqs) {
  if (!craftReqs) return [];
  const reqs = toArr(craftReqs);
  const req = reqs[0];
  if (!req?.craftresource) return [];
  return toArr(req.craftresource)
    .map((r) => ({
      itemId: r["@uniquename"],
      count: parseInt(r["@count"], 10) || 0,
    }))
    .filter((r) => r.itemId && r.count > 0);
}

function collectPriceIdsFromRecipe(
  recipe,
  itemDefs,
  ids,
  visiting = new Set(),
) {
  for (const { itemId } of recipe) {
    if (!itemId) continue;
    ids.add(itemId);
    const alias = toAtAlias(itemId);
    if (alias) ids.add(alias);

    if (visiting.has(itemId)) continue;
    const def = itemDefs?.[itemId];
    const nestedRecipe = extractRecipe(def?.craftingrequirements);
    if (nestedRecipe.length === 0) continue;

    visiting.add(itemId);
    collectPriceIdsFromRecipe(nestedRecipe, itemDefs, ids, visiting);
    visiting.delete(itemId);
  }
}

function toAtAlias(itemId) {
  const match = String(itemId).match(/^(.*)_LEVEL([1-4])$/);
  if (!match) return null;
  return `${match[1]}@${match[2]}`;
}

function toLevelAlias(itemId) {
  const match = String(itemId).match(/^(.*)@([1-4])$/);
  if (!match) return null;
  return `${match[1]}_LEVEL${match[2]}`;
}

function getPriceByAliases(priceMap, itemId, city) {
  const idsToTry = [itemId, toAtAlias(itemId), toLevelAlias(itemId)].filter(
    Boolean,
  );

  for (const id of idsToTry) {
    const price = priceMap[id]?.[city];
    if (price) return price;
  }
  return null;
}

function getItemVariants(sub2Id, itemDefs) {
  if (!sub2Id || !itemDefs) return [];

  const matchingItems = Object.entries(itemDefs).filter(([id, def]) => {
    if (def["@shopsubcategory2"] !== sub2Id) return false;
    if (!def.craftingrequirements) return false;
    if (id.includes("_SKIN") || id.includes("_NONTRADABLE")) return false;
    return true;
  });

  const variants = [];

  for (const [id, def] of matchingItems) {
    const tier = parseInt(def["@tier"] || "0", 10);
    if (!tier || tier < 2) continue;

    // Base item (enchantment 0)
    const baseRecipe = extractRecipe(def.craftingrequirements);
    if (baseRecipe.length > 0) {
      variants.push({
        id,
        displayId: id,
        tier,
        enchant: 0,
        recipe: baseRecipe,
      });
    }

    // Enchanted variants
    for (const ench of toArr(def.enchantments?.enchantment)) {
      const level = parseInt(ench["@enchantmentlevel"] || "0", 10);
      if (!level) continue;
      const recipe = extractRecipe(ench.craftingrequirements);
      if (recipe.length > 0) {
        variants.push({
          id,
          displayId: `${id}@${level}`,
          tier,
          enchant: level,
          recipe,
        });
      }
    }
  }

  variants.sort((a, b) =>
    a.tier !== b.tier ? a.tier - b.tier : a.enchant - b.enchant,
  );

  return variants;
}

function formatPrice(v) {
  if (v === null || v === undefined || v === 0) return "—";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
  if (v >= 1_000) return Math.round(v / 1_000) + "k";
  return v.toLocaleString();
}

export default function CraftPlanner({ language, region }) {
  const { itemNameLookup, itemDefs } = useItemsData(language);
  const [selectedSub2, setSelectedSub2] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [expandedCats, setExpandedCats] = useState(new Set());
  const [expandedSubs, setExpandedSubs] = useState(new Set());
  const [cityPrices, setCityPrices] = useState({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [priceError, setPriceError] = useState(null);

  function toggleCategory(catId) {
    const newSet = new Set(expandedCats);
    if (newSet.has(catId)) newSet.delete(catId);
    else newSet.add(catId);
    setExpandedCats(newSet);
  }

  function toggleSubcategory(subId) {
    const newSet = new Set(expandedSubs);
    if (newSet.has(subId)) newSet.delete(subId);
    else newSet.add(subId);
    setExpandedSubs(newSet);
  }

  function selectItem(sub2Id, label) {
    setSelectedSub2(sub2Id);
    setSelectedLabel(label);
    setCityPrices({});
    setShowDropdown(false);
  }

  const variants = useMemo(
    () => getItemVariants(selectedSub2, itemDefs),
    [selectedSub2, itemDefs],
  );

  const allIngredientIds = useMemo(() => {
    const ids = new Set();
    for (const v of variants) {
      collectPriceIdsFromRecipe(v.recipe, itemDefs, ids);
    }
    return Array.from(ids);
  }, [variants, itemDefs]);

  useEffect(() => {
    if (allIngredientIds.length === 0) {
      setCityPrices({});
      return;
    }

    const controller = new AbortController();

    const fetchPrices = async () => {
      setLoadingPrices(true);
      setPriceError(null);
      try {
        const BATCH = 80;
        const chunks = [];
        for (let i = 0; i < allIngredientIds.length; i += BATCH)
          chunks.push(allIngredientIds.slice(i, i + BATCH));

        let allData = [];
        for (const chunk of chunks) {
          if (controller.signal.aborted) return;
          const data = await fetchItemsPricesBatch(chunk, region, CRAFT_CITIES);
          allData = allData.concat(data || []);
        }

        if (controller.signal.aborted) return;

        const priceMap = {};
        for (const entry of allData) {
          const id = entry.item_id;
          const cityRaw = getCityName(entry);
          const price = getSellPrice(entry);
          if (!id || !cityRaw || price <= 0) continue;

          // Match city name case-insensitively against CRAFT_CITIES
          const city = CRAFT_CITIES.find(
            (c) => c.toLowerCase() === cityRaw.toLowerCase(),
          );
          if (!city) continue; // Skip if city not in our list

          if (!priceMap[id]) priceMap[id] = {};
          if (!priceMap[id][city] || price < priceMap[id][city]) {
            priceMap[id][city] = price;
          }
        }
        setCityPrices(priceMap);
      } catch (err) {
        if (!controller.signal.aborted) setPriceError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoadingPrices(false);
      }
    };

    fetchPrices();
    return () => controller.abort();
  }, [allIngredientIds, region]);

  function resolveUnitCost(itemId, city, cache, visiting = new Set()) {
    const cacheKey = `${city}:${itemId}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    if (visiting.has(itemId)) return null;

    const marketPrice = getPriceByAliases(cityPrices, itemId, city);
    const def = itemDefs[itemId];
    const recipe = extractRecipe(def?.craftingrequirements);

    if (recipe.length === 0) {
      cache.set(cacheKey, marketPrice);
      return marketPrice;
    }

    visiting.add(itemId);
    let recipeCost = 0;
    for (const ingredient of recipe) {
      const ingredientUnitCost = resolveUnitCost(
        ingredient.itemId,
        city,
        cache,
        visiting,
      );
      if (!ingredientUnitCost) {
        recipeCost = null;
        break;
      }
      recipeCost += ingredientUnitCost * ingredient.count;
    }
    visiting.delete(itemId);

    // Production table should prefer craft cost from recipe.
    // If not computable, fallback to market price for this item.
    const resolved = recipeCost ?? marketPrice;
    cache.set(cacheKey, resolved);
    return resolved;
  }

  function calcCost(recipe, city) {
    const cache = new Map();
    let total = 0;
    for (const ingredient of recipe) {
      const ingredientUnitCost = resolveUnitCost(
        ingredient.itemId,
        city,
        cache,
      );
      if (!ingredientUnitCost) return null;
      total += ingredientUnitCost * ingredient.count;
    }
    return total;
  }

  function getItemLabel(id) {
    // Try exact match first
    if (itemNameLookup[id]) return itemNameLookup[id];
    // Try with @0 suffix
    if (itemNameLookup[`${id}@0`]) return itemNameLookup[`${id}@0`];
    // Try with @1 suffix
    if (itemNameLookup[`${id}@1`]) return itemNameLookup[`${id}@1`];
    // Try with @2 suffix
    if (itemNameLookup[`${id}@2`]) return itemNameLookup[`${id}@2`];
    // Try with @3 suffix
    if (itemNameLookup[`${id}@3`]) return itemNameLookup[`${id}@3`];
    // Try with @4 suffix
    if (itemNameLookup[`${id}@4`]) return itemNameLookup[`${id}@4`];
    // Fallback to formatted ID
    return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <div className="fantasy-craft-planner">
      <div className="fantasy-card">
        <div className="fantasy-header">
          <div className="fantasy-title-wrap">
            <div className="fantasy-badge">🔨</div>
            <div>
              <h2>{getUiText("craftPlannerTitle", language)}</h2>
              <p className="fantasy-subtitle">
                {getUiText("craftPlannerIntro", language)}
              </p>
            </div>
          </div>
        </div>

        <div className="fantasy-section">
          <div
            className="fantasy-control-group-item"
            style={{ position: "relative" }}
          >
            <label>{getUiText("craftPlannerCategory", language)}</label>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              style={{
                padding: "8px 16px",
                background: "rgba(247, 184, 75, 0.1)",
                border: "1px solid rgba(247, 184, 75, 0.5)",
                borderRadius: 4,
                color: "#c9b391",
                cursor: "pointer",
                fontSize: "0.9rem",
                minWidth: 260,
                textAlign: "left",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>
                {selectedLabel ||
                  getUiText("craftPlannerSelectCategory", language)}
              </span>
              <span style={{ fontSize: "0.8rem" }}>
                {showDropdown ? "▲" : "▼"}
              </span>
            </button>

            {showDropdown && (
              <>
                <div
                  onClick={() => setShowDropdown(false)}
                  style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 999,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    marginTop: 8,
                    background: "rgba(20, 20, 30, 0.98)",
                    border: "1px solid rgba(247, 184, 75, 0.4)",
                    borderRadius: 8,
                    padding: 12,
                    maxHeight: 400,
                    overflowY: "auto",
                    zIndex: 1000,
                    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.6)",
                  }}
                >
                  {CATEGORY_TREE.map((cat) => (
                    <div key={cat.id} style={{ marginBottom: 4 }}>
                      <button
                        onClick={() => toggleCategory(cat.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#c9b391",
                          cursor: "pointer",
                          textAlign: "left",
                          width: "100%",
                          padding: "8px 0",
                          fontSize: "0.95rem",
                          fontWeight: 500,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span style={{ minWidth: 16 }}>
                          {expandedCats.has(cat.id) ? "▼" : "▶"}
                        </span>
                        {cat.label}
                      </button>

                      {expandedCats.has(cat.id) && (
                        <div style={{ marginLeft: 16, marginTop: 4 }}>
                          {cat.subcats.map((sub) => (
                            <div key={sub.id} style={{ marginBottom: 2 }}>
                              <button
                                onClick={() => toggleSubcategory(sub.id)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "#d4b162",
                                  cursor: "pointer",
                                  textAlign: "left",
                                  width: "100%",
                                  padding: "6px 0",
                                  fontSize: "0.9rem",
                                  fontWeight: 400,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                <span style={{ minWidth: 16 }}>
                                  {expandedSubs.has(sub.id) ? "▼" : "▶"}
                                </span>
                                {sub.label}
                              </button>

                              {expandedSubs.has(sub.id) && (
                                <div style={{ marginLeft: 16, marginTop: 2 }}>
                                  {sub.items.map((item) => (
                                    <button
                                      key={item.id}
                                      onClick={() =>
                                        selectItem(item.id, item.label)
                                      }
                                      style={{
                                        background: "transparent",
                                        border: "none",
                                        color: "#aeaeb2",
                                        cursor: "pointer",
                                        textAlign: "left",
                                        width: "100%",
                                        padding: "4px 0",
                                        fontSize: "0.85rem",
                                        display: "block",
                                        marginBottom: 2,
                                        transition: "color 0.2s",
                                      }}
                                      onMouseEnter={(e) =>
                                        (e.target.style.color = "#f7b84b")
                                      }
                                      onMouseLeave={(e) =>
                                        (e.target.style.color = "#aeaeb2")
                                      }
                                    >
                                      • {item.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {selectedSub2 && variants.length === 0 && (
          <div className="fantasy-section">
            <p>{getUiText("craftPlannerNoItems", language)}</p>
          </div>
        )}

        {variants.length > 0 && (
          <div className="fantasy-section">
            {loadingPrices && (
              <p style={{ marginBottom: 8 }}>
                {getUiText("craftPlannerLoadingPrices", language)}
              </p>
            )}
            {priceError && (
              <p className="fantasy-error" style={{ marginBottom: 8 }}>
                {priceError}
              </p>
            )}
            <div style={{ overflowX: "auto" }}>
              <table className="fantasy-table">
                <thead>
                  <tr>
                    <th>{getUiText("item", language)}</th>
                    <th>{getUiText("craftPlannerRecipe", language)}</th>
                    {CRAFT_CITIES.map((city) => (
                      <th key={city} style={{ whiteSpace: "nowrap" }}>
                        {city}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) => {
                    const name = getItemLabel(v.id);
                    const enchStr = v.enchant > 0 ? `.${v.enchant}` : "";
                    const label = `T${v.tier}${enchStr} ${name}`;

                    return (
                      <tr key={v.displayId}>
                        <td
                          className="fantasy-item-name"
                          style={{ whiteSpace: "nowrap" }}
                        >
                          {label}
                        </td>
                        <td style={{ minWidth: 180 }}>
                          {v.recipe.map((r) => (
                            <div
                              key={r.itemId}
                              style={{ fontSize: "0.85em", lineHeight: "1.5" }}
                            >
                              <span style={{ color: "#f7b84b" }}>
                                {r.count}×
                              </span>{" "}
                              {getItemLabel(r.itemId)}
                            </div>
                          ))}
                        </td>
                        {CRAFT_CITIES.map((city) => {
                          const cost = calcCost(v.recipe, city);
                          return (
                            <td
                              key={city}
                              className="fantasy-price"
                              style={{ whiteSpace: "nowrap" }}
                            >
                              {loadingPrices ? "..." : formatPrice(cost)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
