import { NavLink } from "react-router-dom";
import { supportedLanguages } from "../features/recipeSimulator/recipeSimulatorLogic";
import { getUiText } from "../features/recipeSimulator/translations";

export default function AppNav({
  activeModule,
  language,
  onLanguageChange,
  region,
  onRegionChange,
}) {
  return (
    <nav className="fantasy-nav">
      <div className="fantasy-nav-links">
        <NavLink
          to="/recipe"
          className={`fantasy-nav-link${activeModule === "recipe" ? " active" : ""}`}
        >
          {getUiText("navRecipe", language)}
        </NavLink>
        <NavLink
          to="/price-checker"
          className={`fantasy-nav-link${activeModule === "price" ? " active" : ""}`}
        >
          {getUiText("navPriceChecker", language)}
        </NavLink>
        <NavLink
          to="/top-products"
          className={`fantasy-nav-link${activeModule === "top" ? " active" : ""}`}
        >
          {getUiText("navTopProducts", language)}
        </NavLink>
        <NavLink
          to="/arbitrage"
          className={`fantasy-nav-link${activeModule === "arbitrage" ? " active" : ""}`}
        >
          {getUiText("navArbitrageFinder", language)}
        </NavLink>
        <NavLink
          to="/location-map"
          className={`fantasy-nav-link${activeModule === "locationMap" ? " active" : ""}`}
        >
          {getUiText("navLocationMap", language)}
        </NavLink>
        <NavLink
          to="/market-trends"
          className={`fantasy-nav-link${activeModule === "trends" ? " active" : ""}`}
        >
          {getUiText("navMarketTrends", language)}
        </NavLink>
        <NavLink
          to="/craft-planner"
          className={`fantasy-nav-link${activeModule === "craft" ? " active" : ""}`}
        >
          {getUiText("navCraftPlanner", language)}
        </NavLink>
      </div>

      <div className="fantasy-nav-controls">
        <div className="fantasy-nav-select">
          <label>{getUiText("language", language)}</label>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
          >
            {supportedLanguages.map((locale) => (
              <option key={locale} value={locale}>
                {locale}
              </option>
            ))}
          </select>
        </div>
        <div className="fantasy-nav-select">
          <label>{getUiText("region", language)}</label>
          <select
            value={region}
            onChange={(e) => onRegionChange(e.target.value)}
          >
            <option value="europe">{getUiText("europe", language)}</option>
            <option value="west">{getUiText("west", language)}</option>
            <option value="east">{getUiText("east", language)}</option>
          </select>
        </div>
      </div>
    </nav>
  );
}
