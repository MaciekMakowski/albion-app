import { NavLink } from "react-router-dom";
import { getUiText } from "../features/recipeSimulator/translations";

export default function AppNav({ activeModule, language }) {
  return (
    <nav className="fantasy-nav" aria-label="Modules">
      <NavLink
        to="/recipe"
        className={`fantasy-nav-btn${activeModule === "recipe" ? " active" : ""}`}
      >
        {getUiText("navRecipe", language)}
      </NavLink>
      <NavLink
        to="/price-checker"
        className={`fantasy-nav-btn${activeModule === "price" ? " active" : ""}`}
      >
        {getUiText("navPriceChecker", language)}
      </NavLink>
      <NavLink
        to="/top-products"
        className={`fantasy-nav-btn${activeModule === "top" ? " active" : ""}`}
      >
        {getUiText("navTopProducts", language)}
      </NavLink>
      <NavLink
        to="/arbitrage"
        className={`fantasy-nav-btn${activeModule === "arbitrage" ? " active" : ""}`}
      >
        {getUiText("navArbitrageFinder", language)}
      </NavLink>
      <NavLink
        to="/location-map"
        className={`fantasy-nav-btn${activeModule === "locationMap" ? " active" : ""}`}
      >
        {getUiText("navLocationMap", language)}
      </NavLink>
      <NavLink
        to="/market-trends"
        className={`fantasy-nav-btn${activeModule === "trends" ? " active" : ""}`}
      >
        {getUiText("navMarketTrends", language)}
      </NavLink>
    </nav>
  );
}
