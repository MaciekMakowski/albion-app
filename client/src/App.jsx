import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppNav from "./components/AppNav";
import ArbitrageFinder from "./components/ArbitrageFinder";
import CraftArbitrage from "./components/CraftArbitrage";
import CraftPlanner from "./components/CraftPlanner";
import MarketTrends from "./components/MarketTrends";
import PriceChecker from "./components/PriceChecker";
import RecipeSimulator from "./components/RecipeSimulator";
import TopProducts from "./components/TopProducts";
import { getDefaultLanguage } from "./features/recipeSimulator/recipeSimulatorLogic";
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
          : location.pathname === "/craft-arbitrage"
            ? "craftArbitrage"
            : location.pathname === "/market-trends"
              ? "trends"
              : location.pathname === "/craft-planner"
                ? "craft"
                : "recipe";

  useEffect(() => {
    const titleKey =
      activeModule === "price"
        ? "priceCheckerTitle"
        : activeModule === "top"
          ? "topProductsTitle"
          : activeModule === "arbitrage"
            ? "arbitrageFinderTitle"
            : activeModule === "craftArbitrage"
              ? "craftArbitrageTitle"
              : activeModule === "trends"
                ? "marketTrendsTitle"
                : activeModule === "craft"
                  ? "craftPlannerTitle"
                  : "title";
    document.title = getUiText(titleKey, language);
  }, [activeModule, language]);

  return (
    <div className="fantasy-app">
      <AppNav
        activeModule={activeModule}
        language={language}
        onLanguageChange={setLanguage}
        region={region}
        onRegionChange={setRegion}
      />

      <div className="fantasy-shell">
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
            path="/craft-arbitrage"
            element={<CraftArbitrage language={language} region={region} />}
          />
          <Route
            path="/location-map"
            element={<Navigate to="/arbitrage" replace />}
          />
          <Route
            path="/market-trends"
            element={<MarketTrends language={language} region={region} />}
          />
          <Route
            path="/craft-planner"
            element={<CraftPlanner language={language} region={region} />}
          />
          <Route path="/" element={<Navigate to="/recipe" replace />} />
          <Route path="*" element={<Navigate to="/recipe" replace />} />
        </Routes>
      </div>
    </div>
  );
}
