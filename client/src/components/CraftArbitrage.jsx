import { useEffect, useMemo, useState } from "react";
import {
  getCraftPlannerTaxonomyLabel,
  getUiText,
} from "../features/recipeSimulator/translations";
import { useItemsData } from "../hooks/useItemsData";
import { getCityColor, MARKET_CITIES } from "../shared/cities";
import { fetchItemsPricesBatch } from "../shared/marketApi";
import ItemIcon from "./ItemIcon";

const CITIES = MARKET_CITIES;
const BATCH_SIZE = 80;
const TOP_RESULTS = 20;

function toArr(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function extractRecipe(craftReqs) {
  if (!craftReqs) return [];
  const reqs = toArr(craftReqs);
  const req = reqs[0];
  if (!req?.craftresource) return [];
  return toArr(req.craftresource)
    .map((resource) => ({
      itemId: resource["@uniquename"],
      count: parseInt(resource["@count"], 10) || 0,
    }))
    .filter((resource) => resource.itemId && resource.count > 0);
}

function toBaseAtAlias(itemId) {
  const match = String(itemId || "").match(/^(.*)_LEVEL([1-4])$/i);
  if (!match) return null;
  return `${match[1]}@${match[2]}`;
}

function toLevelAtAlias(itemId) {
  const match = String(itemId || "").match(/^(.*_LEVEL([1-4]))$/i);
  if (!match) return null;
  return `${match[1]}@${match[2]}`;
}

function toLevelAlias(itemId) {
  const match = String(itemId || "").match(/^(.*)@([1-4])$/i);
  if (!match) return null;
  return `${match[1]}_LEVEL${match[2]}`;
}

function getAliases(itemId) {
  return [
    itemId,
    toBaseAtAlias(itemId),
    toLevelAtAlias(itemId),
    toLevelAlias(itemId),
  ].filter(Boolean);
}

function getPriceByAliases(priceMap, itemId, city) {
  for (const alias of getAliases(itemId)) {
    const price = priceMap[alias]?.[city];
    if (price) return price;
  }
  return null;
}

function collectPriceIdsFromRecipe(
  recipe,
  itemDefs,
  ids,
  visiting = new Set(),
) {
  for (const ingredient of recipe) {
    if (!ingredient?.itemId) continue;
    for (const alias of getAliases(ingredient.itemId)) ids.add(alias);

    const nestedId = ingredient.itemId;
    if (visiting.has(nestedId)) continue;

    const nestedRecipe = extractRecipe(
      itemDefs?.[nestedId]?.craftingrequirements,
    );
    if (nestedRecipe.length === 0) continue;

    visiting.add(nestedId);
    collectPriceIdsFromRecipe(nestedRecipe, itemDefs, ids, visiting);
    visiting.delete(nestedId);
  }
}

function CityDotLabel({ city }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: getCityColor(city),
          border: "1px solid rgba(255, 255, 255, 0.35)",
          boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.25)",
        }}
      />
      {city}
    </span>
  );
}

export default function CraftArbitrage({ language, region }) {
  const { itemDefs, itemNameLookup } = useItemsData(language);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [showMobileCategoryPicker, setShowMobileCategoryPicker] =
    useState(false);
  const [mobilePickerStep, setMobilePickerStep] = useState("category");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedSubcategory, setSelectedSubcategory] = useState("all");
  const [sortBy, setSortBy] = useState("gold");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [opportunities, setOpportunities] = useState([]);

  const categoryOptions = useMemo(() => {
    const categories = new Set();
    for (const [, def] of Object.entries(itemDefs || {})) {
      const categoryId = def?.["@shopcategory"];
      if (!categoryId) continue;
      if (!def?.craftingrequirements) continue;
      categories.add(categoryId);
    }

    return Array.from(categories)
      .map((id) => ({
        id,
        label: getCraftPlannerTaxonomyLabel("category", id, language),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [itemDefs, language]);

  useEffect(() => {
    if (!selectedCategory && categoryOptions.length > 0) {
      setSelectedCategory(categoryOptions[0].id);
    }
  }, [categoryOptions, selectedCategory]);

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

  const subcategoryOptions = useMemo(() => {
    if (!selectedCategory) return [];
    const subcategories = new Set();

    for (const [, def] of Object.entries(itemDefs || {})) {
      if (!def?.craftingrequirements) continue;
      if (def?.["@shopcategory"] !== selectedCategory) continue;
      const subId = def?.["@shopsubcategory1"];
      if (!subId) continue;
      subcategories.add(subId);
    }

    return Array.from(subcategories)
      .map((id) => ({
        id,
        label: getCraftPlannerTaxonomyLabel("subcategory", id, language),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [itemDefs, language, selectedCategory]);

  useEffect(() => {
    setSelectedSubcategory("all");
  }, [selectedCategory]);

  function openMobileCategoryPicker() {
    setMobilePickerStep("category");
    setShowMobileCategoryPicker(true);
  }

  function chooseMobileCategory(categoryId) {
    setSelectedCategory(categoryId);
    setMobilePickerStep("subcategory");
  }

  function chooseMobileSubcategory(subcategoryId) {
    setSelectedSubcategory(subcategoryId);
    setShowMobileCategoryPicker(false);
  }

  function goBackInMobilePicker() {
    if (mobilePickerStep === "subcategory") {
      setMobilePickerStep("category");
      return;
    }
    setShowMobileCategoryPicker(false);
  }

  useEffect(() => {
    setOpportunities([]);
    setError(null);
  }, [selectedCategory, selectedSubcategory, region]);

  const candidates = useMemo(() => {
    if (!selectedCategory) return [];
    return Object.entries(itemDefs || []).filter(([id, def]) => {
      if (!def?.craftingrequirements) return false;
      if (def?.["@shopcategory"] !== selectedCategory) return false;
      if (
        selectedSubcategory !== "all" &&
        def?.["@shopsubcategory1"] !== selectedSubcategory
      ) {
        return false;
      }
      if (id.includes("_SKIN") || id.includes("_NONTRADABLE")) return false;
      return true;
    });
  }, [itemDefs, selectedCategory, selectedSubcategory]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (refreshTick === 0) {
        return;
      }

      if (!selectedCategory || candidates.length === 0) {
        setOpportunities([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const ids = new Set();
        for (const [itemId, def] of candidates) {
          for (const alias of getAliases(itemId)) ids.add(alias);
          const recipe = extractRecipe(def?.craftingrequirements);
          collectPriceIdsFromRecipe(recipe, itemDefs, ids);
        }

        const priceIds = Array.from(ids);
        const chunks = [];
        for (let i = 0; i < priceIds.length; i += BATCH_SIZE) {
          chunks.push(priceIds.slice(i, i + BATCH_SIZE));
        }

        const allData = [];
        for (const chunk of chunks) {
          if (cancelled) return;
          const data = await fetchItemsPricesBatch(chunk, region, CITIES);
          allData.push(...(data || []));
        }

        if (cancelled) return;

        const priceMap = {};
        for (const entry of allData) {
          const itemId = entry?.item_id;
          const cityRaw = entry?.city || entry?.location || entry?.name;
          const price =
            entry?.sell_price_min || entry?.sell_price || entry?.price || 0;
          if (!itemId || !cityRaw || price <= 0) continue;

          const city = CITIES.find(
            (value) => value.toLowerCase() === String(cityRaw).toLowerCase(),
          );
          if (!city) continue;

          if (!priceMap[itemId]) priceMap[itemId] = {};
          if (!priceMap[itemId][city] || price < priceMap[itemId][city]) {
            priceMap[itemId][city] = price;
          }
        }

        const next = [];
        for (const [itemId, def] of candidates) {
          const recipe = extractRecipe(def?.craftingrequirements);
          if (recipe.length === 0) continue;

          let bestCraft = null;
          for (const craftCity of CITIES) {
            let totalCost = 0;
            let complete = true;

            for (const ingredient of recipe) {
              const price = getPriceByAliases(
                priceMap,
                ingredient.itemId,
                craftCity,
              );
              if (!price) {
                complete = false;
                break;
              }
              totalCost += price * ingredient.count;
            }

            if (!complete) continue;
            if (!bestCraft || totalCost < bestCraft.cost) {
              bestCraft = { city: craftCity, cost: totalCost };
            }
          }

          if (!bestCraft || bestCraft.cost <= 0) continue;

          let bestSell = null;
          for (const sellCity of CITIES) {
            if (sellCity === bestCraft.city) continue;
            const sellPrice = getPriceByAliases(priceMap, itemId, sellCity);
            if (!sellPrice) continue;
            if (!bestSell || sellPrice > bestSell.price) {
              bestSell = { city: sellCity, price: sellPrice };
            }
          }

          if (!bestSell || bestSell.price <= 0) continue;

          const profit = bestSell.price - bestCraft.cost;
          if (profit <= 0) continue;

          const profitPercent =
            bestCraft.cost > 0 ? (profit / bestCraft.cost) * 100 : 0;

          const label =
            itemNameLookup[itemId] ||
            itemNameLookup[`${itemId}@0`] ||
            itemNameLookup[`${itemId}@1`] ||
            itemId;

          next.push({
            itemId,
            label,
            craftCity: bestCraft.city,
            craftCost: Math.round(bestCraft.cost),
            sellCity: bestSell.city,
            sellPrice: Math.round(bestSell.price),
            profit: Math.round(profit),
            profitPercent,
          });
        }

        next.sort((a, b) =>
          sortBy === "percent"
            ? b.profitPercent - a.profitPercent
            : b.profit - a.profit,
        );

        if (!cancelled) {
          setOpportunities(next.slice(0, TOP_RESULTS));
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError?.message || "Unknown error");
          setOpportunities([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [
    refreshTick,
    candidates,
    itemDefs,
    itemNameLookup,
    region,
    selectedCategory,
    sortBy,
  ]);

  return (
    <div className="fantasy-craft-arbitrage">
      <div className="fantasy-card">
        <div className="fantasy-header">
          <div className="fantasy-title-wrap">
            <div className="fantasy-badge">🧪</div>
            <div>
              <h2>{getUiText("craftArbitrageTitle", language)}</h2>
              <p className="fantasy-subtitle">
                {getUiText("craftArbitrageIntro", language)}
              </p>
            </div>
          </div>
        </div>

        <div className="fantasy-section">
          <div className="fantasy-control-group fantasy-row">
            <div className="fantasy-control-group-item">
              <label>{getUiText("craftArbitrageCategory", language)}</label>
              {isMobileViewport ? (
                <button
                  type="button"
                  onClick={openMobileCategoryPicker}
                  className="fantasy-btn secondary"
                  style={{ width: "100%", borderRadius: 8 }}
                >
                  {categoryOptions.find(
                    (option) => option.id === selectedCategory,
                  )?.label || getUiText("craftArbitrageCategory", language)}
                </button>
              ) : (
                <select
                  value={selectedCategory}
                  onChange={(event) => setSelectedCategory(event.target.value)}
                >
                  {categoryOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="fantasy-control-group-item">
              <label>{getUiText("craftArbitrageSubcategory", language)}</label>
              {isMobileViewport ? (
                <button
                  type="button"
                  onClick={openMobileCategoryPicker}
                  className="fantasy-btn secondary"
                  style={{ width: "100%", borderRadius: 8 }}
                >
                  {selectedSubcategory === "all"
                    ? getUiText("craftArbitrageSubcategoryAll", language)
                    : subcategoryOptions.find(
                        (option) => option.id === selectedSubcategory,
                      )?.label ||
                      getUiText("craftArbitrageSubcategory", language)}
                </button>
              ) : (
                <select
                  value={selectedSubcategory}
                  onChange={(event) =>
                    setSelectedSubcategory(event.target.value)
                  }
                >
                  <option value="all">
                    {getUiText("craftArbitrageSubcategoryAll", language)}
                  </option>
                  {subcategoryOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="fantasy-control-group-item">
              <label>{getUiText("craftArbitrageSortBy", language)}</label>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
              >
                <option value="gold">
                  {getUiText("craftArbitrageSortGold", language)}
                </option>
                <option value="percent">
                  {getUiText("craftArbitrageSortPercent", language)}
                </option>
              </select>
            </div>

            <button
              className="fantasy-btn"
              onClick={() => setRefreshTick((value) => value + 1)}
              disabled={loading}
            >
              {loading
                ? getUiText("craftArbitrageRefreshing", language)
                : getUiText("craftArbitrageRefresh", language)}
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="fantasy-section">
          <p>{getUiText("craftArbitrageLoading", language)}</p>
        </div>
      )}

      {isMobileViewport && showMobileCategoryPicker && (
        <>
          <div
            onClick={() => setShowMobileCategoryPicker(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.55)",
              zIndex: 1200,
            }}
          />
          <div
            style={{
              position: "fixed",
              left: "4vw",
              right: "4vw",
              top: "10vh",
              bottom: "8vh",
              zIndex: 1201,
              background: "rgba(20, 20, 30, 0.98)",
              border: "1px solid rgba(247, 184, 75, 0.4)",
              borderRadius: 10,
              padding: 8,
            }}
          >
            {mobilePickerStep === "category" && (
              <div
                style={{
                  maxHeight: "calc(100% - 58px)",
                  overflowY: "auto",
                  display: "grid",
                  gap: 4,
                }}
              >
                {categoryOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => chooseMobileCategory(option.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 10px",
                      border: "none",
                      background:
                        selectedCategory === option.id
                          ? "rgba(247, 184, 75, 0.14)"
                          : "transparent",
                      color:
                        selectedCategory === option.id ? "#ffe7a8" : "#c9b391",
                      borderRadius: 6,
                      boxShadow: "none",
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}

            {mobilePickerStep === "subcategory" && (
              <div
                style={{
                  maxHeight: "calc(100% - 58px)",
                  overflowY: "auto",
                  display: "grid",
                  gap: 4,
                }}
              >
                <button
                  type="button"
                  onClick={() => chooseMobileSubcategory("all")}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    border: "none",
                    background:
                      selectedSubcategory === "all"
                        ? "rgba(247, 184, 75, 0.14)"
                        : "transparent",
                    color:
                      selectedSubcategory === "all" ? "#ffe7a8" : "#d4b162",
                    borderRadius: 6,
                    boxShadow: "none",
                  }}
                >
                  {getUiText("craftArbitrageSubcategoryAll", language)}
                </button>

                {subcategoryOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => chooseMobileSubcategory(option.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 10px",
                      border: "none",
                      background:
                        selectedSubcategory === option.id
                          ? "rgba(247, 184, 75, 0.14)"
                          : "transparent",
                      color:
                        selectedSubcategory === option.id
                          ? "#ffe7a8"
                          : "#d4b162",
                      borderRadius: 6,
                      boxShadow: "none",
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}

            <div
              style={{
                position: "absolute",
                left: 8,
                right: 8,
                bottom: 8,
                display: "flex",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={goBackInMobilePicker}
                className="fantasy-btn secondary"
                style={{ flex: 1, borderRadius: 8, padding: "8px 10px" }}
              >
                {String(language || "").startsWith("PL") ? "Cofnij" : "Back"}
              </button>
              <button
                type="button"
                onClick={() => setShowMobileCategoryPicker(false)}
                className="fantasy-btn"
                style={{ flex: 1, borderRadius: 8, padding: "8px 10px" }}
              >
                {String(language || "").startsWith("PL") ? "Zamknij" : "Close"}
              </button>
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="fantasy-section fantasy-error">
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && opportunities.length === 0 && (
        <div className="fantasy-section">
          <p>{getUiText("craftArbitrageNoData", language)}</p>
        </div>
      )}

      {!loading && opportunities.length > 0 && (
        <div className="fantasy-section">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 12,
            }}
          >
            {opportunities.map((item) => (
              <div
                key={item.itemId}
                style={{
                  border: "1px solid rgba(247, 184, 75, 0.2)",
                  borderRadius: 12,
                  padding: 12,
                  background: "rgba(255, 255, 255, 0.03)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 700,
                    color: "#ffe7a8",
                    marginBottom: 10,
                  }}
                >
                  <ItemIcon itemId={item.itemId} size={20} />
                  <span>{item.label}</span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "6px 10px",
                    alignItems: "center",
                    fontSize: "0.9rem",
                  }}
                >
                  <span style={{ color: "#d4b162" }}>
                    {getUiText("craftArbitrageCraftCity", language)}
                  </span>
                  <span style={{ color: "#f7e4b1" }}>
                    <CityDotLabel city={item.craftCity} />
                  </span>

                  <span style={{ color: "#d4b162" }}>
                    {getUiText("craftArbitrageCraftCost", language)}
                  </span>
                  <span className="fantasy-price" style={{ color: "#f7e4b1" }}>
                    {item.craftCost.toLocaleString()}
                  </span>

                  <span style={{ color: "#d4b162" }}>
                    {getUiText("craftArbitrageSellCity", language)}
                  </span>
                  <span style={{ color: "#f7e4b1" }}>
                    <CityDotLabel city={item.sellCity} />
                  </span>

                  <span style={{ color: "#d4b162" }}>
                    {getUiText("craftArbitrageSellPrice", language)}
                  </span>
                  <span className="fantasy-price" style={{ color: "#f7e4b1" }}>
                    {item.sellPrice.toLocaleString()}
                  </span>
                </div>

                <div
                  style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: "1px solid rgba(247, 184, 75, 0.14)",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      background: "rgba(34, 197, 94, 0.12)",
                      border: "1px solid rgba(34, 197, 94, 0.35)",
                      borderRadius: 8,
                      padding: "8px 10px",
                    }}
                  >
                    <div style={{ fontSize: "0.75rem", color: "#b8eec9" }}>
                      {getUiText("craftArbitrageProfit", language)}
                    </div>
                    <div style={{ fontWeight: 700, color: "#d7ffe7" }}>
                      {item.profit.toLocaleString()}
                    </div>
                  </div>

                  <div
                    style={{
                      background: "rgba(59, 130, 246, 0.12)",
                      border: "1px solid rgba(59, 130, 246, 0.35)",
                      borderRadius: 8,
                      padding: "8px 10px",
                    }}
                  >
                    <div style={{ fontSize: "0.75rem", color: "#b9d8ff" }}>
                      {getUiText("craftArbitrageProfitPercent", language)}
                    </div>
                    <div style={{ fontWeight: 700, color: "#d9eaff" }}>
                      {item.profitPercent.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
