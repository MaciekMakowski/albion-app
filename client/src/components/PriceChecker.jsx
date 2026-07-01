import { useEffect, useState } from "react";
import {
  buyCities,
  getItemDisplayLabel,
} from "../features/recipeSimulator/recipeSimulatorLogic";
import { getUiText } from "../features/recipeSimulator/translations";
import { useItemsData } from "../hooks/useItemsData";
import { getCityColor } from "../shared/cities";
import {
  fetchItemPriceHistory,
  fetchItemPricesByCity,
} from "../shared/marketApi";
import ItemIcon from "./ItemIcon";
import ItemSearchInput from "./ItemSearchInput";
import PriceHistoryChart from "./PriceHistoryChart";

const QUICK_SEARCH_STORAGE_KEY = "albion.priceChecker.quickSearch.v1";
const QUICK_SEARCH_LIMIT = 20;

function formatPrice(value) {
  return value > 0 ? Math.round(value).toLocaleString() : "—";
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

export default function PriceChecker({ language, region }) {
  const { itemNameLookup, itemsIndex } = useItemsData(language);
  const [searchValue, setSearchValue] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState(null);

  const getHistoryTimeScale = (days) => (days <= 1 ? 1 : 24);

  // History States
  const [historyDays, setHistoryDays] = useState(30);
  const [historyData, setHistoryData] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryCities, setSelectedHistoryCities] = useState(() => [
    ...buyCities,
  ]);
  const [recentSearchIds, setRecentSearchIds] = useState([]);

  function readRecentSearches() {
    try {
      if (typeof window === "undefined") return [];
      const raw = window.localStorage.getItem(QUICK_SEARCH_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function persistRecentSearches(ids) {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(
        QUICK_SEARCH_STORAGE_KEY,
        JSON.stringify(ids || []),
      );
    } catch {
      // Ignore storage write errors.
    }
  }

  function pushRecentSearch(itemId) {
    if (!itemId) return;
    setRecentSearchIds((prev) => {
      const next = [itemId, ...prev.filter((id) => id !== itemId)].slice(
        0,
        QUICK_SEARCH_LIMIT,
      );
      persistRecentSearches(next);
      return next;
    });
  }

  useEffect(() => {
    setRecentSearchIds(readRecentSearches());
  }, []);

  useEffect(() => {
    if (selectedItemId) {
      setSearchValue(
        getItemDisplayLabel(selectedItemId, itemNameLookup) || selectedItemId,
      );
    }
  }, [selectedItemId, itemNameLookup, language]);

  async function refreshHistoryData(days = historyDays) {
    if (!selectedItemId) return;

    const timeScale = getHistoryTimeScale(days);
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const historyRaw = await fetchItemPriceHistory(
        selectedItemId,
        region,
        buyCities,
        timeScale,
      );
      setHistoryData(historyRaw);
    } catch (err) {
      console.error("Failed to fetch price history:", err);
      setHistoryError(String(err));
      if (!historyData) {
        setHistoryData(null);
      }
    } finally {
      setHistoryLoading(false);
    }
  }

  async function checkPrices() {
    if (!selectedItemId) return;

    setLoading(true);
    setError(null);
    setRows(null);
    setHistoryData(null);
    setHistoryError(null);
    setHistoryLoading(false);

    try {
      const byCity = await fetchItemPricesByCity(selectedItemId, region);

      const nextRows = buyCities.map((city) => {
        const match = byCity.get(city.toLowerCase());
        return {
          city,
          sell: match?.sell || 0,
          buy: match?.buy || 0,
        };
      });
      setRows(nextRows);
      await refreshHistoryData(historyDays);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedItemId) return;
    checkPrices();
  }, [selectedItemId, region]);

  useEffect(() => {
    if (!selectedItemId) return;
    pushRecentSearch(selectedItemId);
  }, [selectedItemId]);

  useEffect(() => {
    if (!selectedItemId) return;
    refreshHistoryData(historyDays);
  }, [selectedItemId, region, historyDays]);

  useEffect(() => {
    setSelectedHistoryCities((prev) => {
      if (prev.length === 0) return [...buyCities];
      const next = prev.filter((city) => buyCities.includes(city));
      return next.length > 0 ? next : [...buyCities];
    });
  }, [selectedItemId]);

  const getFilteredHistoryPoints = (points = []) => {
    if (!points || points.length === 0) return [];

    let referenceDate = new Date();
    const timestamps = points
      .map((d) => (d.timestamp ? new Date(d.timestamp).getTime() : 0))
      .filter(Boolean);
    if (timestamps.length > 0) {
      referenceDate = new Date(Math.max(...timestamps));
    }

    const limitDate = new Date(referenceDate);
    const hoursToKeep = Math.max(1, historyDays * 24);
    limitDate.setHours(limitDate.getHours() - hoursToKeep);

    return points.filter(
      (item) => item.timestamp && new Date(item.timestamp) >= limitDate,
    );
  };

  const getCityHistoryPoints = (city) => {
    if (!historyData) return [];
    const cityLower = city.toLowerCase();
    const cityEntries = historyData.filter(
      (entry) => entry.location && entry.location.toLowerCase() === cityLower,
    );
    const selectedEntry =
      cityEntries.find((entry) => entry.quality === 1) || cityEntries[0];
    return selectedEntry ? selectedEntry.data : [];
  };

  const getCityHistoryVolume = (city) => {
    const points = getFilteredHistoryPoints(getCityHistoryPoints(city));
    return points.reduce((sum, p) => sum + (p.item_count || 0), 0);
  };

  const selectedHistorySeries = selectedHistoryCities
    .map((city) => ({
      label: city,
      city,
      data: getCityHistoryPoints(city),
      color: getCityColor(city),
    }))
    .filter((series) => series.data && series.data.length > 0);

  return (
    <div className="fantasy-card">
      <div className="fantasy-header">
        <div className="fantasy-title-wrap">
          <div className="fantasy-badge">💰</div>
          <div>
            <h2>{getUiText("priceCheckerTitle", language)}</h2>
            <p className="fantasy-subtitle">
              {getUiText("priceCheckerSubtitle", language)}
            </p>
          </div>
        </div>
      </div>

      <p className="fantasy-intro">
        {getUiText("priceCheckerIntro", language)}
      </p>

      <div className="fantasy-price-checker-controls">
        <ItemSearchInput
          value={searchValue}
          onChange={setSearchValue}
          onSelectId={setSelectedItemId}
          itemsIndex={itemsIndex}
          itemNameLookup={itemNameLookup}
          label={getUiText("searchItem", language)}
          language={language}
        />

        <div className="fantasy-actions">
          <button
            className="fantasy-btn primary"
            onClick={checkPrices}
            disabled={!selectedItemId || loading}
          >
            {loading
              ? getUiText("loadingPrices", language)
              : getUiText("checkPrices", language)}
          </button>
        </div>
      </div>

      {recentSearchIds.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            paddingLeft: 2,
            marginTop: 8,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "#d4b162",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {getUiText("quickSearch", language)}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {recentSearchIds.map((itemId) => (
              <button
                key={itemId}
                type="button"
                className="fantasy-timeframe-btn"
                onClick={() => setSelectedItemId(itemId)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <ItemIcon itemId={itemId} size={20} />
                  <span>
                    {getItemDisplayLabel(itemId, itemNameLookup) || itemId}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="fantasy-summary">
        {!rows && !loading && !error && (
          <p className="fantasy-state">
            {getUiText("selectItemPrompt", language)}
          </p>
        )}

        {error && (
          <p className="fantasy-state error">
            {getUiText("errorFetchingPrices", language)}: {error}
          </p>
        )}

        {rows && (
          <div className="fantasy-summary-card">
            <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ItemIcon itemId={selectedItemId} size={24} />
              <span>
                {getItemDisplayLabel(selectedItemId, itemNameLookup) ||
                  selectedItemId}
              </span>
            </h3>
            <div className="fantasy-price-checker-grid">
              <div className="fantasy-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{getUiText("city", language)}</th>
                      <th>{getUiText("sellPrice", language)}</th>
                      <th>{getUiText("buyPrice", language)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.city}
                        style={{
                          borderLeft: `3px solid ${getCityColor(row.city)}`,
                        }}
                      >
                        <td>
                          <CityDotLabel city={row.city} />
                        </td>
                        <td>{formatPrice(row.sell)}</td>
                        <td>{formatPrice(row.buy)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="fantasy-history-wrap">
                <div className="fantasy-history-header">
                  <div>
                    <h4>📈 {getUiText("priceHistory", language)}</h4>
                  </div>
                  <div className="fantasy-history-controls">
                    <div className="fantasy-timeframe-btns">
                      {[1, 7, 14, 30].map((days) => (
                        <button
                          key={days}
                          className={`fantasy-timeframe-btn${
                            historyDays === days ? " active" : ""
                          }`}
                          onClick={() => setHistoryDays(days)}
                        >
                          {getUiText(`days${days}`, language)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="fantasy-history-content">
                  {historyError && (
                    <p className="fantasy-state error">
                      {getUiText("errorFetchingPrices", language)}:{" "}
                      {historyError}
                    </p>
                  )}
                  {!historyError && !historyData && !historyLoading && (
                    <p className="fantasy-state">
                      {getUiText("loadingHistory", language)}
                    </p>
                  )}
                  {historyData && !historyError && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "10px",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ fontSize: "12px", color: "#e7cf8d" }}>
                          {getUiText("citySelect", language)}
                        </div>
                        {buyCities.map((city) => (
                          <label
                            key={city}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              fontSize: "12px",
                              color: "#f7e4b1",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedHistoryCities.includes(city)}
                              onChange={() => {
                                setSelectedHistoryCities((prev) => {
                                  if (prev.includes(city)) {
                                    return prev.filter((item) => item !== city);
                                  }
                                  return [...prev, city];
                                });
                              }}
                            />
                            <CityDotLabel city={city} />
                          </label>
                        ))}
                      </div>
                      <PriceHistoryChart
                        series={selectedHistorySeries}
                        days={historyDays}
                        language={language}
                        timeScale={getHistoryTimeScale(historyDays)}
                      />
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "8px",
                          padding: "8px 10px",
                          border: "1px solid rgba(247, 184, 75, 0.2)",
                          borderRadius: "8px",
                          background: "rgba(255, 255, 255, 0.02)",
                        }}
                      >
                        {selectedHistoryCities.map((city) => (
                          <div
                            key={`legend-${city}`}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              fontSize: "11px",
                              color: "#e7cf8d",
                            }}
                          >
                            <span
                              style={{
                                width: "10px",
                                height: "3px",
                                borderRadius: "2px",
                                background: getCityColor(city),
                                display: "inline-block",
                              }}
                            />
                            <CityDotLabel city={city} />
                          </div>
                        ))}
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: "12px",
                        }}
                      >
                        {buyCities.map((city) => {
                          const points = getCityHistoryPoints(city);
                          const filteredPoints =
                            getFilteredHistoryPoints(points);
                          return (
                            <div
                              key={city}
                              style={{
                                border: "1px solid rgba(247, 184, 75, 0.2)",
                                borderRadius: "10px",
                                padding: "10px",
                                background: "rgba(255, 255, 255, 0.02)",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  marginBottom: "8px",
                                }}
                              >
                                <strong style={{ color: "#f7e4b1" }}>
                                  <CityDotLabel city={city} />
                                </strong>
                                <span
                                  style={{ fontSize: "11px", color: "#e7cf8d" }}
                                >
                                  {getUiText("totalVolume", language)}:{" "}
                                  <strong>
                                    {filteredPoints
                                      .reduce(
                                        (sum, p) => sum + (p.item_count || 0),
                                        0,
                                      )
                                      .toLocaleString()}
                                  </strong>
                                </span>
                              </div>
                              <PriceHistoryChart
                                series={[
                                  {
                                    city,
                                    label: city,
                                    color: getCityColor(city),
                                    data: points,
                                  },
                                ]}
                                days={historyDays}
                                language={language}
                                timeScale={getHistoryTimeScale(historyDays)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
