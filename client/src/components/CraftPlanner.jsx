import { useEffect, useMemo, useState } from "react";
import itemsData from "../data/items.json";
import {
  getCraftPlannerTaxonomyLabel,
  getUiText,
} from "../features/recipeSimulator/translations";
import { useItemsData } from "../hooks/useItemsData";
import { getCityColor, ROYAL_CITIES } from "../shared/cities";
import {
  fetchItemsPricesBatch,
  getCityName,
  getSellPrice,
} from "../shared/marketApi";
import ItemIcon from "./ItemIcon";

const CRAFT_CITIES = ROYAL_CITIES;

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
    const baseAtAlias = toBaseAtAlias(itemId);
    const levelAtAlias = toLevelAtAlias(itemId);
    const levelAlias = toLevelAlias(itemId);
    if (baseAtAlias) ids.add(baseAtAlias);
    if (levelAtAlias) ids.add(levelAtAlias);
    if (levelAlias) ids.add(levelAlias);

    if (visiting.has(itemId)) continue;
    const def = itemDefs?.[itemId];
    const nestedRecipe = extractRecipe(def?.craftingrequirements);
    if (nestedRecipe.length === 0) continue;

    visiting.add(itemId);
    collectPriceIdsFromRecipe(nestedRecipe, itemDefs, ids, visiting);
    visiting.delete(itemId);
  }
}

function toBaseAtAlias(itemId) {
  const match = String(itemId).match(/^(.*)_LEVEL([1-4])$/);
  if (!match) return null;
  return `${match[1]}@${match[2]}`;
}

function toLevelAtAlias(itemId) {
  const match = String(itemId || "").match(/^(.*_LEVEL([1-4]))$/);
  if (!match) return null;
  return `${match[1]}@${match[2]}`;
}

function toLevelAlias(itemId) {
  const match = String(itemId || "").match(/^(.*)@([1-4])$/);
  if (!match) return null;
  return `${match[1]}_LEVEL${match[2]}`;
}

function getPriceByAliases(priceMap, itemId, city) {
  const idsToTry = [
    itemId,
    toBaseAtAlias(itemId),
    toLevelAtAlias(itemId),
    toLevelAlias(itemId),
  ].filter(Boolean);
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
          displayId: `${id}_LEVEL${level}`,
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
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState("");
  const [selectedSub2, setSelectedSub2] = useState("");
  const [showCascadeDropdown, setShowCascadeDropdown] = useState(false);
  const [mobileCascadeStep, setMobileCascadeStep] = useState("category");
  const [activeCategoryId, setActiveCategoryId] = useState("");
  const [activeSubcategoryId, setActiveSubcategoryId] = useState("");
  const [cityPrices, setCityPrices] = useState({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [priceError, setPriceError] = useState(null);

  const sub2LabelById = useMemo(() => {
    const map = {};
    const rankBySub2 = {};

    for (const [id, def] of Object.entries(itemDefs || {})) {
      const sub2Id = def?.["@shopsubcategory2"];
      if (!sub2Id) continue;
      if (!def?.craftingrequirements) continue;
      if (id.includes("_SKIN") || id.includes("_NONTRADABLE")) continue;

      const tier = parseInt(def?.["@tier"] || "99", 10) || 99;
      const currentRank = rankBySub2[sub2Id];
      if (currentRank !== undefined && tier >= currentRank) continue;

      const translatedName =
        itemNameLookup[id] ||
        itemNameLookup[`${id}@0`] ||
        itemNameLookup[`${id}@1`] ||
        formatId(sub2Id);

      rankBySub2[sub2Id] = tier;
      map[sub2Id] = translatedName;
    }

    return map;
  }, [itemDefs, itemNameLookup]);

  const localizedCategoryTree = useMemo(
    () =>
      CATEGORY_TREE.map((cat) => ({
        ...cat,
        label: getCraftPlannerTaxonomyLabel("category", cat.id, language),
        subcats: (cat.subcats || []).map((sub) => ({
          ...sub,
          label: getCraftPlannerTaxonomyLabel("subcategory", sub.id, language),
          items: (sub.items || []).map((item) => ({
            ...item,
            label: sub2LabelById[item.id] || item.label,
          })),
        })),
      })),
    [language, sub2LabelById],
  );

  function selectItem(sub2Id) {
    setSelectedSub2(sub2Id);
    setCityPrices({});
  }

  const selectedCategory = useMemo(
    () =>
      localizedCategoryTree.find((cat) => cat.id === selectedCategoryId) ||
      null,
    [localizedCategoryTree, selectedCategoryId],
  );

  const subcategoryOptions = selectedCategory?.subcats || [];

  const selectedSubcategory = useMemo(
    () =>
      subcategoryOptions.find((sub) => sub.id === selectedSubcategoryId) ||
      null,
    [subcategoryOptions, selectedSubcategoryId],
  );

  const itemOptions = selectedSubcategory?.items || [];

  const activeCategory = useMemo(
    () =>
      localizedCategoryTree.find((cat) => cat.id === activeCategoryId) || null,
    [localizedCategoryTree, activeCategoryId],
  );
  const activeSubcategoryOptions = activeCategory?.subcats || [];
  const activeSubcategory = useMemo(
    () =>
      activeSubcategoryOptions.find((sub) => sub.id === activeSubcategoryId) ||
      null,
    [activeSubcategoryOptions, activeSubcategoryId],
  );
  const activeItemOptions = activeSubcategory?.items || [];

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 860px)");
    const apply = () => setIsMobileViewport(media.matches);
    apply();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }

    media.addListener(apply);
    return () => media.removeListener(apply);
  }, []);

  const selectedItemLabel = useMemo(() => {
    if (!selectedSub2) return "";
    for (const cat of localizedCategoryTree) {
      for (const sub of cat.subcats || []) {
        const item = (sub.items || []).find((i) => i.id === selectedSub2);
        if (item) {
          return `${cat.label} / ${sub.label} / ${item.label}`;
        }
      }
    }
    return "";
  }, [localizedCategoryTree, selectedSub2]);

  function openCascadeDropdown() {
    setShowCascadeDropdown(true);
    if (isMobileViewport) {
      setMobileCascadeStep("category");
    }
    const initialCategoryId =
      selectedCategoryId || localizedCategoryTree[0]?.id || "";
    setActiveCategoryId(initialCategoryId);

    const category = localizedCategoryTree.find(
      (cat) => cat.id === initialCategoryId,
    );
    const initialSubcategoryId =
      selectedSubcategoryId || category?.subcats?.[0]?.id || "";
    setActiveSubcategoryId(initialSubcategoryId);
  }

  function chooseCategory(categoryId) {
    setActiveCategoryId(categoryId);
    const category = localizedCategoryTree.find((cat) => cat.id === categoryId);
    setActiveSubcategoryId(category?.subcats?.[0]?.id || "");
    if (isMobileViewport) {
      setMobileCascadeStep("subcategory");
    }
  }

  function chooseSubcategory(subcategoryId) {
    setActiveSubcategoryId(subcategoryId);
    if (isMobileViewport) {
      setMobileCascadeStep("item");
    }
  }

  function chooseItem(itemId) {
    if (!itemId) return;
    setSelectedCategoryId(activeCategoryId);
    setSelectedSubcategoryId(activeSubcategoryId);
    selectItem(itemId);
    setShowCascadeDropdown(false);
  }

  function goBackInMobileCascade() {
    if (mobileCascadeStep === "item") {
      setMobileCascadeStep("subcategory");
      return;
    }
    if (mobileCascadeStep === "subcategory") {
      setMobileCascadeStep("category");
      return;
    }
    setShowCascadeDropdown(false);
  }

  const variants = useMemo(
    () => getItemVariants(selectedSub2, itemDefs),
    [selectedSub2, itemDefs],
  );

  const allPriceIds = useMemo(() => {
    const ids = new Set();
    for (const v of variants) {
      collectPriceIdsFromRecipe(v.recipe, itemDefs, ids);
      const marketItemId = toBaseAtAlias(v.displayId) || v.id;
      if (marketItemId) ids.add(marketItemId);
    }
    return Array.from(ids);
  }, [variants, itemDefs]);

  useEffect(() => {
    if (allPriceIds.length === 0) {
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
        for (let i = 0; i < allPriceIds.length; i += BATCH)
          chunks.push(allPriceIds.slice(i, i + BATCH));

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
  }, [allPriceIds, region]);

  function resolveUnitCost(itemId, city, cache, visiting = new Set()) {
    const cacheKey = `${city}:${itemId}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    if (visiting.has(itemId)) return null;

    const marketPrice = getPriceByAliases(cityPrices, itemId, city);

    cache.set(cacheKey, marketPrice);
    return marketPrice;
  }

  function getRecipeCostWithBreakdown(recipe, city) {
    const cache = new Map();
    let total = 0;
    const breakdown = [];

    for (const ingredient of recipe) {
      const unitCost = resolveUnitCost(ingredient.itemId, city, cache);
      if (!unitCost) return null;

      const itemTotal = unitCost * ingredient.count;
      total += itemTotal;
      breakdown.push({
        itemId: ingredient.itemId,
        count: ingredient.count,
        unitCost,
        itemTotal,
      });
    }

    return { total, breakdown };
  }

  function getVariantSellPrice(variant, city) {
    const marketItemId = toBaseAtAlias(variant.displayId) || variant.id;
    return getPriceByAliases(cityPrices, marketItemId, city);
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
              onClick={openCascadeDropdown}
              style={{
                padding: "8px 16px",
                background: "rgba(247, 184, 75, 0.1)",
                border: "1px solid rgba(247, 184, 75, 0.5)",
                borderRadius: 4,
                color: "#c9b391",
                cursor: "pointer",
                fontSize: "0.9rem",
                minWidth: 360,
                textAlign: "left",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>
                {selectedItemLabel ||
                  getUiText("craftPlannerSelectCategory", language)}
              </span>
              <span style={{ fontSize: "0.8rem" }}>
                {showCascadeDropdown ? "▲" : "▼"}
              </span>
            </button>

            {showCascadeDropdown && (
              <>
                <div
                  onClick={() => setShowCascadeDropdown(false)}
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
                    position: isMobileViewport ? "fixed" : "absolute",
                    top: isMobileViewport ? "10vh" : "100%",
                    left: isMobileViewport ? "4vw" : 0,
                    right: isMobileViewport ? "4vw" : "auto",
                    bottom: isMobileViewport ? "8vh" : "auto",
                    marginTop: isMobileViewport ? 0 : 8,
                    display: isMobileViewport ? "block" : "grid",
                    gridTemplateColumns: "repeat(3, minmax(220px, 1fr))",
                    gap: 8,
                    zIndex: 1000,
                    background: isMobileViewport
                      ? "rgba(20, 20, 30, 0.98)"
                      : "transparent",
                    border: isMobileViewport
                      ? "1px solid rgba(247, 184, 75, 0.4)"
                      : "none",
                    borderRadius: isMobileViewport ? 10 : 0,
                    padding: isMobileViewport ? 8 : 0,
                  }}
                >
                  {(!isMobileViewport || mobileCascadeStep === "category") && (
                    <div
                      style={{
                        background: "rgba(20, 20, 30, 0.98)",
                        border: "1px solid rgba(247, 184, 75, 0.4)",
                        borderRadius: 8,
                        padding: 8,
                        maxHeight: isMobileViewport ? "calc(100% - 58px)" : 360,
                        overflowY: "auto",
                        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.6)",
                      }}
                    >
                      {localizedCategoryTree.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => chooseCategory(cat.id)}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "8px 10px",
                            border: "none",
                            background:
                              activeCategoryId === cat.id
                                ? "rgba(247, 184, 75, 0.14)"
                                : "transparent",
                            color:
                              activeCategoryId === cat.id
                                ? "#ffe7a8"
                                : "#c9b391",
                            cursor: "pointer",
                            fontSize: "0.9rem",
                            borderRadius: 6,
                            boxShadow: "none",
                          }}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {(!isMobileViewport ||
                    mobileCascadeStep === "subcategory") && (
                    <div
                      style={{
                        background: "rgba(20, 20, 30, 0.98)",
                        border: "1px solid rgba(247, 184, 75, 0.4)",
                        borderRadius: 8,
                        padding: 8,
                        maxHeight: isMobileViewport ? "calc(100% - 58px)" : 360,
                        overflowY: "auto",
                        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.6)",
                      }}
                    >
                      {activeSubcategoryOptions.map((sub) => (
                        <button
                          key={sub.id}
                          onClick={() => chooseSubcategory(sub.id)}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "8px 10px",
                            border: "none",
                            background:
                              activeSubcategoryId === sub.id
                                ? "rgba(247, 184, 75, 0.14)"
                                : "transparent",
                            color:
                              activeSubcategoryId === sub.id
                                ? "#ffe7a8"
                                : "#d4b162",
                            cursor: "pointer",
                            fontSize: "0.88rem",
                            borderRadius: 6,
                            boxShadow: "none",
                          }}
                        >
                          {sub.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {(!isMobileViewport || mobileCascadeStep === "item") && (
                    <div
                      style={{
                        background: "rgba(20, 20, 30, 0.98)",
                        border: "1px solid rgba(247, 184, 75, 0.4)",
                        borderRadius: 8,
                        padding: 8,
                        maxHeight: isMobileViewport ? "calc(100% - 58px)" : 360,
                        overflowY: "auto",
                        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.6)",
                      }}
                    >
                      {activeItemOptions.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => chooseItem(item.id)}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "8px 10px",
                            border: "none",
                            background:
                              selectedSub2 === item.id
                                ? "rgba(247, 184, 75, 0.14)"
                                : "transparent",
                            color:
                              selectedSub2 === item.id ? "#ffe7a8" : "#aeaeb2",
                            cursor: "pointer",
                            fontSize: "0.85rem",
                            borderRadius: 6,
                            boxShadow: "none",
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {isMobileViewport && (
                    <div
                      style={{
                        position: "absolute",
                        left: 8,
                        right: 8,
                        bottom: 8,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <button
                        type="button"
                        onClick={goBackInMobileCascade}
                        className="fantasy-btn secondary"
                        style={{
                          flex: 1,
                          borderRadius: 8,
                          padding: "8px 10px",
                        }}
                      >
                        {String(language || "").startsWith("PL")
                          ? "Cofnij"
                          : "Back"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCascadeDropdown(false)}
                        className="fantasy-btn"
                        style={{
                          flex: 1,
                          borderRadius: 8,
                          padding: "8px 10px",
                        }}
                      >
                        {String(language || "").startsWith("PL")
                          ? "Zamknij"
                          : "Close"}
                      </button>
                    </div>
                  )}
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: 12,
              }}
            >
              {variants.map((v) => {
                const name = getItemLabel(v.id);
                const enchStr = v.enchant > 0 ? `.${v.enchant}` : "";
                const label = `T${v.tier}${enchStr} ${name}`;

                return (
                  <div
                    key={v.displayId}
                    style={{
                      border: "1px solid rgba(247, 184, 75, 0.2)",
                      borderRadius: 14,
                      background: "rgba(255, 255, 255, 0.03)",
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 10,
                        fontWeight: 700,
                        color: "#ffe7a8",
                        fontSize: "1rem",
                      }}
                    >
                      <ItemIcon itemId={v.displayId} size={22} />
                      <span>{label}</span>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 2,
                      }}
                    >
                      <div
                        style={{
                          borderRadius: 10,
                          padding: 8,
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.72rem",
                            color: "#d4b162",
                            textTransform: "uppercase",
                            marginBottom: 6,
                            letterSpacing: "0.04em",
                          }}
                        >
                          {getUiText("city", language)} |{" "}
                          {getUiText("craftPlannerCraftCost", language)}
                        </div>

                        <div style={{ display: "grid", gap: 4 }}>
                          {CRAFT_CITIES.map((city) => {
                            const costDetails = getRecipeCostWithBreakdown(
                              v.recipe,
                              city,
                            );

                            return (
                              <details
                                key={`${v.displayId}-${city}-cost`}
                                style={{
                                  borderBottom:
                                    "1px solid rgba(247, 184, 75, 0.12)",
                                  paddingBottom: 4,
                                }}
                              >
                                <summary
                                  style={{
                                    cursor: "pointer",
                                    listStylePosition: "inside",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 8,
                                    color: "#e7cf8d",
                                    fontSize: "0.86rem",
                                  }}
                                >
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 6,
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: "50%",
                                        background: getCityColor(city),
                                        border:
                                          "1px solid rgba(255, 255, 255, 0.35)",
                                        boxShadow:
                                          "0 0 0 1px rgba(0, 0, 0, 0.25)",
                                      }}
                                    />
                                    {city}
                                  </span>
                                  <strong>
                                    {loadingPrices
                                      ? "..."
                                      : formatPrice(costDetails?.total)}
                                  </strong>
                                </summary>

                                {!loadingPrices && costDetails && (
                                  <div
                                    style={{
                                      marginTop: 4,
                                      marginLeft: 14,
                                      display: "grid",
                                      gap: 2,
                                    }}
                                  >
                                    {costDetails.breakdown.map((b) => (
                                      <div
                                        key={`${city}-${v.displayId}-${b.itemId}`}
                                        style={{
                                          fontSize: "0.74rem",
                                          color: "#d8c08a",
                                          lineHeight: 1.35,
                                          display: "flex",
                                          justifyContent: "space-between",
                                          gap: 8,
                                        }}
                                      >
                                        <span>
                                          <span
                                            style={{
                                              display: "inline-flex",
                                              alignItems: "center",
                                              gap: 6,
                                            }}
                                          >
                                            <ItemIcon
                                              itemId={b.itemId}
                                              size={16}
                                            />
                                            <span>
                                              {b.count}x{" "}
                                              {getItemLabel(b.itemId)}
                                            </span>
                                          </span>
                                        </span>
                                        <span>{formatPrice(b.itemTotal)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </details>
                            );
                          })}
                        </div>
                      </div>

                      <div
                        style={{
                          borderRadius: 10,
                          padding: 8,
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.72rem",
                            color: "#d4b162",
                            textTransform: "uppercase",
                            marginBottom: 6,
                            letterSpacing: "0.04em",
                          }}
                        >
                          {getUiText("city", language)} |{" "}
                          {getUiText("sellPrice", language)}
                        </div>

                        <div style={{ display: "grid", gap: 4 }}>
                          {CRAFT_CITIES.map((city) => {
                            const sellPrice = getVariantSellPrice(v, city);
                            return (
                              <div
                                key={`${v.displayId}-${city}-sell`}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 8,
                                  color: "#e7cf8d",
                                  fontSize: "0.86rem",
                                  borderBottom:
                                    "1px solid rgba(247, 184, 75, 0.12)",
                                  paddingBottom: 4,
                                }}
                              >
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 8,
                                      height: 8,
                                      borderRadius: "50%",
                                      background: getCityColor(city),
                                      border:
                                        "1px solid rgba(255, 255, 255, 0.35)",
                                      boxShadow:
                                        "0 0 0 1px rgba(0, 0, 0, 0.25)",
                                    }}
                                  />
                                  {city}
                                </span>
                                <strong>
                                  {loadingPrices
                                    ? "..."
                                    : formatPrice(sellPrice)}
                                </strong>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
