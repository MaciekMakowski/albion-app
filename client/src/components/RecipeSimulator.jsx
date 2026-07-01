import { useEffect, useRef, useState } from "react";
import itemsData from "../data/items.json";
import namesData from "../data/items_names.json";
import { getUiText } from "../features/recipeSimulator/translations";
import { getCityColor, MARKET_CITIES } from "../shared/cities";
import {
  fetchItemPriceHistory,
  fetchItemsPricesBatch,
  fetchItemMarketPrice as fetchMarketPrice,
} from "../shared/marketApi";
import ItemIcon from "./ItemIcon";
import ItemSearchInput from "./ItemSearchInput";

const buyCities = MARKET_CITIES;

function collectItemEntries(source) {
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

function buildNameLookup(source, language) {
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

function getItemDisplayName(itemId, lookup) {
  if (!itemId) return "";
  return lookup[itemId] || itemId;
}

function getItemTier(itemId) {
  if (!itemId) return null;
  const match = String(itemId).match(/(^|[_-])(t\d+)(?=_|$)/i);
  if (!match) return null;
  return match[2].toUpperCase();
}

function getItemDisplayLabel(itemId, lookup) {
  const name = getItemDisplayName(itemId, lookup);
  const tier = getItemTier(itemId);
  if (!name) return "";
  return tier ? `${name} (${tier})` : name;
}

function formatProfitPercent(profit, totalCost) {
  if (!totalCost) return null;
  const pct = Math.round((profit / totalCost) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
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

function Sparkline({ data, city, language }) {
  const renderFlatLine = () => (
    <svg
      width="45"
      height="12"
      style={{
        verticalAlign: "middle",
        marginRight: "8px",
        display: "inline-block",
      }}
      aria-label="sparkline-placeholder"
    >
      <title>No history data (flat line)</title>
      <line
        x1="0"
        y1="6"
        x2="45"
        y2="6"
        stroke="rgba(247, 184, 75, 0.3)"
        strokeWidth="1.5"
      />
    </svg>
  );

  if (!data || !city) return renderFlatLine();

  const cityLower = city.toLowerCase();
  const cityEntries = data.filter(
    (entry) => entry.location && entry.location.toLowerCase() === cityLower,
  );
  const selectedEntry =
    cityEntries.find((entry) => entry.quality === 1) || cityEntries[0];
  const points = selectedEntry ? selectedEntry.data : [];

  if (points.length === 0) return renderFlatLine();

  // Filter 14 days
  let referenceDate = new Date();
  const timestamps = points
    .map((d) => (d.timestamp ? new Date(d.timestamp).getTime() : 0))
    .filter(Boolean);
  if (timestamps.length > 0) {
    referenceDate = new Date(Math.max(...timestamps));
  }

  const limitDate = new Date(referenceDate);
  limitDate.setDate(limitDate.getDate() - 14);

  const filteredPoints = points
    .filter((item) => item.timestamp && new Date(item.timestamp) >= limitDate)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  if (filteredPoints.length < 2) {
    return renderFlatLine();
  }

  const prices = filteredPoints.map((p) => p.avg_price || 0);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice;

  const firstPrice = prices[0];
  const lastPrice = prices[prices.length - 1];
  const strokeColor =
    lastPrice > firstPrice
      ? "#7dffb0" // green (upward trend)
      : lastPrice < firstPrice
        ? "#ff8e8e" // red (downward trend)
        : "#f7b84b"; // gold (flat trend)

  const width = 45;
  const height = 12;
  const padding = 1;
  const effectiveHeight = height - padding * 2;

  const pathData = filteredPoints
    .map((p, idx) => {
      const x = (idx / (filteredPoints.length - 1)) * width;
      const y =
        range === 0
          ? height / 2
          : padding +
            effectiveHeight -
            (((p.avg_price || 0) - minPrice) / range) * effectiveHeight;
      return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const formatTooltipDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(language || "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const colWidth = width / filteredPoints.length;

  return (
    <svg
      width={width}
      height={height}
      style={{
        verticalAlign: "middle",
        marginRight: "8px",
        display: "inline-block",
        overflow: "visible",
      }}
    >
      <path
        d={pathData}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {filteredPoints.map((p, idx) => {
        const x = (idx / (filteredPoints.length - 1)) * width;
        const titleText = `${formatTooltipDate(p.timestamp)}: ${Math.round(
          p.avg_price,
        ).toLocaleString()}`;
        return (
          <rect
            key={idx}
            x={x - colWidth / 2}
            y={0}
            width={colWidth}
            height={height}
            fill="transparent"
            style={{ cursor: "pointer" }}
          >
            <title>{titleText}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export default function RecipeSimulator({ language, region }) {
  const [ingredients, setIngredients] = useState([]);
  const [outputItem, setOutputItem] = useState("");
  const [selectedOutputId, setSelectedOutputId] = useState("T4_BAG");
  const [itemsIndex, setItemsIndex] = useState([]);
  const [itemsMap, setItemsMap] = useState({});
  const [itemDefs, setItemDefs] = useState({});
  const itemDefsRef = useRef({});
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [returnPercent, setReturnPercent] = useState(20);
  const [saleTaxPercent, setSaleTaxPercent] = useState(4);
  const [itemNameLookup, setItemNameLookup] = useState({});
  const [results, setResults] = useState(null);

  function updateIngredient(i, changes) {
    setIngredients((prev) =>
      prev.map((item, idx) => (idx === i ? { ...item, ...changes } : item)),
    );
  }

  function simulate() {
    const init = ingredients.map((it) => ({
      ...it,
      required: Math.max(1, Number(it.required) || 1),
      available: Math.max(0, Number(it.available) || 0),
      buyPrice: Number(it.buyPrice) || 0,
    }));
    const initialAvailable = init.map((it) => it.available);

    const rp = Math.max(0, Math.min(100, Number(returnPercent) || 0)) / 100;
    const taxRate = Math.max(0, Number(saleTaxPercent) || 0) / 100;

    let available = init.map((it) => it.available);
    let crafts = 0;

    while (true) {
      const can = init.every((it, idx) => available[idx] >= it.required);
      if (!can) break;
      for (let i = 0; i < init.length; i++) {
        available[i] -= init[i].required;
      }
      for (let i = 0; i < init.length; i++) {
        const ret = init[i].required * rp;
        available[i] += ret;
      }
      crafts++;
      if (crafts > 100000) break;
    }

    const consumed = init.map(
      (it, idx) => initialAvailable[idx] - available[idx],
    );
    const initialCost = init.reduce(
      (sum, it, idx) => sum + initialAvailable[idx] * it.buyPrice,
      0,
    );
    const remainingInventoryValue = init.reduce(
      (sum, it, idx) => sum + Math.max(0, available[idx]) * it.buyPrice,
      0,
    );
    const totalCost = Math.max(0, initialCost - remainingInventoryValue);

    const outputId = selectedOutputId || outputItem;

    setResults({
      loading: true,
      crafts,
      consumed,
      totalCost,
      comparison: { loading: true, rows: [] },
    });

    const cityComparisonPromise = buildCityCostComparison(
      init,
      consumed,
      totalCost,
    );

    Promise.all([
      fetchItemsPricesBatch([outputId], region),
      fetchItemPriceHistory(outputId, region, buyCities).catch((err) => {
        console.error("Failed to fetch simulator price history:", err);
        return null;
      }),
      cityComparisonPromise,
    ])
      .then(([data, historyRaw, comparison]) => {
        const rowsByCity = new Map();

        for (const d of data) {
          const city =
            d.city ||
            d.location ||
            d.sell_location ||
            d.name ||
            d.ItemId ||
            "unknown";
          const price =
            d.sell_price_min || d.sell_price || d.buy_price_max || d.price || 0;

          const existing = rowsByCity.get(city);
          const candidate = {
            city,
            price,
            revenue: price * crafts,
            tax: price * crafts * taxRate,
            profit: price * crafts - price * crafts * taxRate - totalCost,
          };

          if (
            !existing ||
            (price > 0 && (!existing.price || price < existing.price))
          ) {
            rowsByCity.set(city, candidate);
          }
        }

        const rows = Array.from(rowsByCity.values()).sort((a, b) =>
          a.city.localeCompare(b.city),
        );
        setResults((prev) => ({
          ...prev,
          loading: false,
          rows,
          history: historyRaw,
          comparison,
        }));
      })
      .catch((err) =>
        setResults((prev) => ({
          ...prev,
          loading: false,
          error: String(err),
          comparison: {
            loading: false,
            rows: [],
            error: String(err),
          },
        })),
      );
  }

  async function buildCityCostComparison(init, consumed, baseTotalCost) {
    try {
      const rows = await Promise.all(
        buyCities.map(async (city) => {
          let cost = 0;
          let missingPrices = 0;

          for (let i = 0; i < init.length; i++) {
            const qty = Number(consumed[i]) || 0;
            if (qty <= 0) continue;

            const price = await fetchItemMarketPrice(init[i].name, city);
            if (!price || price <= 0) {
              missingPrices++;
              continue;
            }
            cost += qty * price;
          }

          const isComplete = missingPrices === 0;
          const profitabilityVsCurrent =
            isComplete && baseTotalCost > 0
              ? ((baseTotalCost - cost) / baseTotalCost) * 100
              : null;

          return {
            city,
            cost: isComplete ? cost : null,
            missingPrices,
            profitabilityVsCurrent,
          };
        }),
      );

      const sorted = rows.sort((a, b) => {
        if (a.cost == null && b.cost == null)
          return a.city.localeCompare(b.city);
        if (a.cost == null) return 1;
        if (b.cost == null) return -1;
        return a.cost - b.cost;
      });

      return { loading: false, rows: sorted };
    } catch (err) {
      return { loading: false, rows: [], error: String(err) };
    }
  }

  const bestComparisonCity =
    results?.comparison?.rows?.find((row) => row.cost != null)?.city || null;

  useEffect(() => {
    setItemNameLookup(buildNameLookup(namesData, language));
  }, [language]);

  useEffect(() => {
    if (selectedOutputId) {
      setOutputItem(getItemDisplayName(selectedOutputId, itemNameLookup));
    }
  }, [selectedOutputId, itemNameLookup, language]);

  useEffect(() => {
    const data = itemsData?.items || itemsData;
    const { entries, defs } = collectItemEntries(data);
    itemDefsRef.current = defs;
    setItemDefs(defs);

    const idx = entries.map((it) => {
      const displayName = itemNameLookup[it.id] || it.name || it.id;
      return {
        id: it.id,
        name: displayName,
        text: (it.id + " " + displayName).toLowerCase(),
      };
    });
    const map = Object.fromEntries(
      entries.map((it) => [it.id, itemNameLookup[it.id] || it.name || it.id]),
    );

    setItemsIndex(idx);
    setItemsMap(map);
  }, [itemNameLookup]);

  function applyIngredientsForOutput(nextOutputId) {
    const trimmedOutput = String(nextOutputId || "").trim();
    if (!trimmedOutput) return;

    const defs = itemDefsRef.current || itemDefs;
    const def = defs[trimmedOutput];
    if (!def || !def.craftingrequirements) return;

    const recipeList = normalizeArray(def.craftingrequirements);
    const recipe = recipeList[0] || null;
    const resources = normalizeArray(recipe?.craftresource);

    const builtIngredients = resources
      .map((res) => {
        const name = res["@uniquename"] || res["@id"] || "";
        const count = Number(res["@count"] || res["@amount"] || 1);
        if (!name) return null;
        return {
          name,
          required: Math.max(1, count),
          available: 0,
          buyPrice: 0,
          buyCity: "Bridgewatch",
        };
      })
      .filter(Boolean);

    setIngredients(builtIngredients);
  }

  useEffect(() => {
    const trimmedOutput = String(selectedOutputId || "").trim();
    if (!trimmedOutput) return;

    const defs = itemDefsRef.current || itemDefs;
    const def = defs[trimmedOutput];
    if (!def) return;

    applyIngredientsForOutput(trimmedOutput);
  }, [selectedOutputId, itemDefs]);

  useEffect(() => {
    if (!ingredients.length) return;

    const refreshPricesForRegion = async () => {
      const copy = [...ingredients];
      const promises = copy.map(async (it, idx) => {
        if (!it.name) return null;
        const price = await fetchItemMarketPrice(it.name, it.buyCity);
        return { idx, price };
      });

      const results = await Promise.all(promises);
      for (const r of results) {
        if (!r) continue;
        if (r.price && r.price > 0) {
          copy[r.idx] = { ...copy[r.idx], buyPrice: r.price };
        }
      }
      setIngredients(copy);
    };

    refreshPricesForRegion();
  }, [region]);

  async function fetchItemMarketPrice(itemId, city) {
    return fetchMarketPrice(itemId, city, region);
  }

  async function refreshAllPrices() {
    setRefreshingPrices(true);
    try {
      const copy = [...ingredients];
      const promises = copy.map(async (it, idx) => {
        if (!it.name) return null;
        const price = await fetchItemMarketPrice(it.name, it.buyCity);
        return { idx, price };
      });
      const results = await Promise.all(promises);
      for (const r of results) {
        if (!r) continue;
        if (r.price && r.price > 0) {
          copy[r.idx] = { ...copy[r.idx], buyPrice: r.price };
        }
      }
      setIngredients(copy);
    } finally {
      setRefreshingPrices(false);
    }
  }

  function normalizeArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    return [value];
  }

  async function updateIngredientCity(idx, buyCity) {
    updateIngredient(idx, { buyCity });
    const itemId = ingredients[idx]?.name;
    if (!itemId) return;
    const price = await fetchItemMarketPrice(itemId, buyCity);
    if (price > 0) {
      updateIngredient(idx, { buyPrice: price });
    }
  }

  return (
    <div className="fantasy-card">
      <div className="fantasy-header">
        <div className="fantasy-title-wrap">
          <div className="fantasy-badge">⚔️</div>
          <div>
            <h2>{getUiText("title", language)}</h2>
            <p className="fantasy-subtitle">
              {getUiText("subtitle", language)}
            </p>
          </div>
        </div>
      </div>

      <p className="fantasy-intro">{getUiText("intro", language)}</p>

      <div className="fantasy-section">
        {ingredients.map((it, idx) => (
          <div key={idx} className="fantasy-ingredient-card">
            <div className="fantasy-ingredient-name-row">
              <div
                className="fantasy-ingredient-name"
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <ItemIcon itemId={it.name} size={24} />
                <span>
                  {getItemDisplayLabel(it.name, itemNameLookup) || it.name}
                </span>
              </div>
            </div>

            <div className="fantasy-ingredient-grid">
              <div className="fantasy-ingredient-field">
                <label>{getUiText("requiredPerCraft", language)}</label>
                <div className="fantasy-ingredient-value">{it.required}</div>
              </div>

              <div className="fantasy-ingredient-field">
                <label>{getUiText("available", language)}</label>
                <input
                  type="number"
                  value={it.available}
                  onChange={(e) =>
                    updateIngredient(idx, {
                      available: Number(e.target.value),
                    })
                  }
                />
              </div>

              <div className="fantasy-ingredient-field">
                <label>{getUiText("buyPrice", language)}</label>
                <input
                  type="number"
                  value={it.buyPrice}
                  onChange={(e) =>
                    updateIngredient(idx, {
                      buyPrice: Number(e.target.value),
                    })
                  }
                />
              </div>

              <div className="fantasy-ingredient-field">
                <label>{getUiText("buyCity", language)}</label>
                <select
                  value={it.buyCity}
                  onChange={(e) => updateIngredientCity(idx, e.target.value)}
                >
                  {buyCities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="fantasy-divider" />

      <div className="fantasy-control-group-col">
        <div className="fantasy-control-group wide">
          <ItemSearchInput
            value={outputItem}
            onChange={setOutputItem}
            onSelectId={setSelectedOutputId}
            itemsIndex={itemsIndex}
            itemNameLookup={itemNameLookup}
            label={getUiText("outputItem", language)}
            openUp
            language={language}
          />
        </div>
        <div className="fantasy-control-group">
          <div className="fantasy-control-group">
            <label>{getUiText("percentReturn", language)}</label>
            <input
              type="number"
              value={returnPercent}
              onChange={(e) => setReturnPercent(Number(e.target.value))}
              style={{ width: 90 }}
            />
          </div>

          <div className="fantasy-control-group">
            <label>{getUiText("saleTaxRate", language)}</label>
            <select
              value={saleTaxPercent}
              onChange={(e) => setSaleTaxPercent(Number(e.target.value))}
              style={{ width: 170 }}
            >
              <option value={4}>
                4% - {getUiText("saleTaxPremium", language)}
              </option>
              <option value={6}>
                6% - {getUiText("saleTaxStandard", language)}
              </option>
            </select>
          </div>
        </div>

        <div className="fantasy-actions">
          <button className="fantasy-btn primary" onClick={simulate}>
            {getUiText("simulate", language)}
          </button>
          <button
            className="fantasy-btn secondary"
            onClick={refreshAllPrices}
            disabled={refreshingPrices}
          >
            {refreshingPrices
              ? getUiText("refreshing", language)
              : getUiText("refreshPrices", language)}
          </button>
        </div>
      </div>

      <div className="fantasy-summary">
        {results && (
          <div className="fantasy-summary-card">
            <h3>{getUiText("simulation", language)}</h3>
            <div className="fantasy-stats-grid">
              <div className="fantasy-stat">
                <span>{getUiText("estimatedOutputs", language)}</span>
                <strong>{results.crafts}</strong>
              </div>
              <div className="fantasy-stat">
                <span>{getUiText("totalCost", language)}</span>
                <strong>{Math.round(results.totalCost)}</strong>
              </div>
            </div>

            {results.loading && (
              <p className="fantasy-state">
                {getUiText("loadingPrices", language)}
              </p>
            )}
            {results.error && (
              <p className="fantasy-state error">
                {getUiText("errorFetchingPrices", language)}: {results.error}
              </p>
            )}
            {results.rows && (
              <div className="fantasy-table-wrap">
                <h4>{getUiText("pricesProfit", language)}</h4>
                <table>
                  <thead>
                    <tr>
                      <th>{getUiText("city", language)}</th>
                      <th>{getUiText("price", language)}</th>
                      <th>{getUiText("revenue", language)}</th>
                      <th>{getUiText("tax", language)}</th>
                      <th>{getUiText("profit", language)}</th>
                      <th>{getUiText("profitPercent", language)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.rows.map((r, idx) => {
                      const profitPct = formatProfitPercent(
                        r.profit,
                        results.totalCost,
                      );
                      const profitClass =
                        r.profit > 0
                          ? "profit-positive"
                          : r.profit < 0
                            ? "profit-negative"
                            : "";

                      return (
                        <tr key={idx}>
                          <td>
                            <CityDotLabel city={r.city} />
                          </td>
                          <td>
                            <Sparkline
                              data={results.history}
                              city={r.city}
                              language={language}
                            />
                            {Math.round(r.price).toLocaleString()}
                          </td>
                          <td>{Math.round(r.revenue).toLocaleString()}</td>
                          <td>{Math.round(r.tax).toLocaleString()}</td>
                          <td className={profitClass}>
                            {Math.round(r.profit).toLocaleString()}
                          </td>
                          <td className={profitClass}>{profitPct ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {results && (
        <div className="fantasy-summary" style={{ marginTop: 16 }}>
          <div className="fantasy-summary-card">
            <h3>{getUiText("cityCostComparisonTitle", language)}</h3>
            <p className="fantasy-intro" style={{ marginTop: 0 }}>
              {getUiText("currentVariantCost", language)}:{" "}
              <strong>
                {Math.round(results.totalCost || 0).toLocaleString()}
              </strong>
            </p>

            {results.comparison?.loading && (
              <p className="fantasy-state">
                {getUiText("comparisonLoading", language)}
              </p>
            )}

            {results.comparison?.error && (
              <p className="fantasy-state error">
                {getUiText("comparisonError", language)}:{" "}
                {results.comparison.error}
              </p>
            )}

            {!!results.comparison?.rows?.length && (
              <div className="fantasy-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{getUiText("city", language)}</th>
                      <th>{getUiText("comparisonCost", language)}</th>
                      <th>{getUiText("comparisonProfitability", language)}</th>
                      <th>{getUiText("comparisonStatus", language)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.comparison.rows.map((r, idx) => {
                      const isBest =
                        bestComparisonCity && r.city === bestComparisonCity;
                      const profitability =
                        r.profitabilityVsCurrent == null
                          ? "—"
                          : `${r.profitabilityVsCurrent >= 0 ? "+" : ""}${r.profitabilityVsCurrent.toFixed(1)}%`;

                      const profitabilityClass =
                        r.profitabilityVsCurrent > 0
                          ? "profit-positive"
                          : r.profitabilityVsCurrent < 0
                            ? "profit-negative"
                            : "";

                      return (
                        <tr key={idx}>
                          <td>
                            <CityDotLabel city={r.city} />
                            {isBest && (
                              <span
                                style={{
                                  marginLeft: 8,
                                  padding: "2px 8px",
                                  borderRadius: 999,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  background: "rgba(76, 175, 80, 0.15)",
                                  color: "#2e7d32",
                                }}
                              >
                                {getUiText("comparisonBest", language)}
                              </span>
                            )}
                          </td>
                          <td>
                            {r.cost == null
                              ? "—"
                              : Math.round(r.cost).toLocaleString()}
                          </td>
                          <td className={profitabilityClass}>
                            {profitability}
                          </td>
                          <td>
                            {r.missingPrices > 0
                              ? `${getUiText("comparisonMissingPrices", language)}: ${r.missingPrices}`
                              : getUiText("comparisonComplete", language)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
