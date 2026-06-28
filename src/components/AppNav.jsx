import { getUiText } from "../features/recipeSimulator/translations";

export default function AppNav({ activeModule, onModuleChange, language }) {
  return (
    <nav className="fantasy-nav" aria-label="Modules">
      <button
        type="button"
        className={`fantasy-nav-btn${activeModule === "recipe" ? " active" : ""}`}
        onClick={() => onModuleChange("recipe")}
      >
        {getUiText("navRecipe", language)}
      </button>
      <button
        type="button"
        className={`fantasy-nav-btn${activeModule === "price" ? " active" : ""}`}
        onClick={() => onModuleChange("price")}
      >
        {getUiText("navPriceChecker", language)}
      </button>
    </nav>
  );
}
