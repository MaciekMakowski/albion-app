import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppNav from "./components/AppNav";
import ArbitrageFinder from "./components/ArbitrageFinder";
import LocationArbitrageMap from "./components/LocationArbitrageMap";
import MarketTrends from "./components/MarketTrends";
import PriceChecker from "./components/PriceChecker";
import RecipeSimulator from "./components/RecipeSimulator";
import TopProducts from "./components/TopProducts";
import {
  getDefaultLanguage,
  supportedLanguages,
} from "./features/recipeSimulator/recipeSimulatorLogic";
import { getUiText } from "./features/recipeSimulator/translations";

export default function App() {
  const location = useLocation();
  const [language, setLanguage] = useState(getDefaultLanguage());
  const [region, setRegion] = useState("europe");

  const activeModule =
    location.pathname === "/price-checker"
      ? "price"
      : location.pathname === "/top-products"
        ? "top"
        : location.pathname === "/arbitrage"
          ? "arbitrage"
          : location.pathname === "/location-map"
            ? "locationMap"
            : location.pathname === "/market-trends"
              ? "trends"
              : "recipe";

  useEffect(() => {
    const titleKey =
      activeModule === "price"
        ? "priceCheckerTitle"
        : activeModule === "top"
          ? "topProductsTitle"
          : activeModule === "arbitrage"
            ? "arbitrageFinderTitle"
            : activeModule === "locationMap"
              ? "locationMapTitle"
              : activeModule === "trends"
                ? "marketTrendsTitle"
                : "title";
    document.title = getUiText(titleKey, language);
  }, [activeModule, language]);

  return (
    <div className="fantasy-app">
      <div className="fantasy-shell">
        <div className="fantasy-header">
          <AppNav activeModule={activeModule} language={language} />

          <div className="fantasy-shared-toolbar">
            <div className="fantasy-control-group">
              <label>{getUiText("language", language)}</label>
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
            <div className="fantasy-control-group">
              <label>{getUiText("region", language)}</label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              >
                <option value="europe">{getUiText("europe", language)}</option>
                <option value="west">{getUiText("west", language)}</option>
                <option value="east">{getUiText("east", language)}</option>
              </select>
            </div>
          </div>
        </div>

        <Routes>
          <Route
            path="/recipe"
            element={<RecipeSimulator language={language} region={region} />}
          />
          <Route
            path="/price-checker"
            element={<PriceChecker language={language} region={region} />}
          />
          <Route
            path="/top-products"
            element={<TopProducts language={language} region={region} />}
          />
          <Route
            path="/arbitrage"
            element={<ArbitrageFinder language={language} region={region} />}
          />
          <Route
            path="/location-map"
            element={
              <LocationArbitrageMap language={language} region={region} />
            }
          />
          <Route
            path="/market-trends"
            element={<MarketTrends language={language} region={region} />}
          />
          <Route path="/" element={<Navigate to="/recipe" replace />} />
          <Route path="*" element={<Navigate to="/recipe" replace />} />
        </Routes>
      </div>
    </div>
  );
}
