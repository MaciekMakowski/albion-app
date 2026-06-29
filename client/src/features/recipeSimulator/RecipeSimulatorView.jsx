import { useEffect } from "react";

export default function RecipeSimulatorView({
  t,
  language,
  setLanguage,
  region,
  setRegion,
  supportedLanguages,
  ingredients,
  updateIngredient,
  updateIngredientCity,
  buyCities,
  outputItem,
  onOutputSearchChange,
  onOutputKeyDown,
  outputSuggestions,
  selectOutputSuggestion,
  returnPercent,
  setReturnPercent,
  simulate,
  refreshingPrices,
  refreshAllPrices,
  results,
  getItemLabel,
}) {
  useEffect(() => {
    document.title = t("title");
  }, [language, t]);

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h2 style={{ margin: 0 }}>{t("title")}</h2>
        <div
          className="row"
          style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}
        >
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <label style={{ width: 70 }}>{t("language")}</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {supportedLanguages.map((locale) => (
                <option key={locale} value={locale}>
                  {locale}
                </option>
              ))}
            </select>
          </div>
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <label style={{ width: 70 }}>{t("region")}</label>
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="europe">{t("europe")}</option>
              <option value="west">{t("west")}</option>
              <option value="east">{t("east")}</option>
            </select>
          </div>
        </div>
      </div>

      <p>{t("intro")}</p>

      {ingredients.map((it, idx) => (
        <div key={idx} className="item">
          <div className="row">
            <label style={{ width: 120 }}>{t("item")}</label>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>
                {getItemLabel(it.name) || it.name}
              </div>
            </div>
            <label style={{ width: 140, marginLeft: 8 }}>
              {t("requiredPerCraft")}
            </label>
            <input
              type="number"
              value={it.required}
              disabled
              style={{ width: 80, opacity: 0.7, cursor: "not-allowed" }}
            />
            <label style={{ width: 120, marginLeft: 8 }}>
              {t("available")}
            </label>
            <input
              type="number"
              value={it.available}
              onChange={(e) =>
                updateIngredient(idx, { available: Number(e.target.value) })
              }
              style={{ width: 100 }}
            />
            <label style={{ width: 120, marginLeft: 8 }}>{t("buyPrice")}</label>
            <input
              type="number"
              value={it.buyPrice}
              onChange={(e) =>
                updateIngredient(idx, { buyPrice: Number(e.target.value) })
              }
              style={{ width: 120 }}
            />
            <label style={{ width: 100, marginLeft: 8 }}>{t("buyCity")}</label>
            <select
              value={it.buyCity}
              onChange={(e) => updateIngredientCity(idx, e.target.value)}
              style={{ width: 140 }}
            >
              {buyCities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}

      <hr />

      <div className="row" style={{ gap: 10 }}>
        <label style={{ width: 120 }}>{t("outputItem")}</label>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            value={outputItem}
            onChange={(e) => onOutputSearchChange(e.target.value)}
            onKeyDown={onOutputKeyDown}
            style={{ width: 220 }}
          />
          {outputSuggestions && outputSuggestions.length > 0 && (
            <div
              style={{
                position: "absolute",
                zIndex: 40,
                background: "white",
                border: "1px solid #e6e9ef",
                width: 220,
                maxHeight: 220,
                overflow: "auto",
              }}
            >
              {outputSuggestions.map((s, si) => (
                <div
                  key={si}
                  style={{ padding: 6, cursor: "pointer" }}
                  onMouseDown={() => selectOutputSuggestion(s)}
                >
                  {getItemLabel(s.id) || s.name}
                </div>
              ))}
            </div>
          )}
        </div>
        <label style={{ width: 160 }}>{t("percentReturn")}</label>
        <input
          type="number"
          value={returnPercent}
          onChange={(e) => setReturnPercent(Number(e.target.value))}
          style={{ width: 80 }}
        />
        <button onClick={simulate}>{t("simulate")}</button>
        <button
          onClick={refreshAllPrices}
          disabled={refreshingPrices}
          style={{ marginLeft: 8 }}
        >
          {refreshingPrices ? t("refreshing") : t("refreshPrices")}
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        {results && (
          <div>
            <h3>{t("simulation")}</h3>
            <p>
              {t("estimatedOutputs")}: <strong>{results.crafts}</strong>
            </p>
            <p>
              {t("totalCost")}: <strong>{Math.round(results.totalCost)}</strong>
            </p>

            {results.loading && <p>{t("loadingPrices")}</p>}
            {results.error && (
              <p style={{ color: "red" }}>
                {t("errorFetchingPrices")}: {results.error}
              </p>
            )}
            {results.rows && (
              <div>
                <h4>{t("pricesProfit")}</h4>
                <table>
                  <thead>
                    <tr>
                      <th>{t("city")}</th>
                      <th>{t("price")}</th>
                      <th>{t("revenue")}</th>
                      <th>{t("profit")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.rows.map((r, idx) => (
                      <tr key={idx}>
                        <td>{r.city}</td>
                        <td>{Math.round(r.price)}</td>
                        <td>{Math.round(r.revenue)}</td>
                        <td>{Math.round(r.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
