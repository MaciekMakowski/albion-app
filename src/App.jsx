import { useEffect, useState } from "react";
import AppNav from "./components/AppNav";
import PriceChecker from "./components/PriceChecker";
import RecipeSimulator from "./components/RecipeSimulator";
import TopProducts from "./components/TopProducts";
import {
  getDefaultLanguage,
  supportedLanguages,
} from "./features/recipeSimulator/recipeSimulatorLogic";
import { getUiText } from "./features/recipeSimulator/translations";

export default function App() {
  const [activeModule, setActiveModule] = useState("recipe");
  const [language, setLanguage] = useState(getDefaultLanguage());
  const [region, setRegion] = useState("europe");

  useEffect(() => {
    const titleKey =
      activeModule === "price"
        ? "priceCheckerTitle"
        : activeModule === "top"
          ? "topProductsTitle"
          : "title";
    document.title = getUiText(titleKey, language);
  }, [activeModule, language]);

  return (
    <div className="fantasy-app">
      <div className="fantasy-shell">
        <div className="fantasy-header">
          <AppNav
            activeModule={activeModule}
            onModuleChange={setActiveModule}
            language={language}
          />

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

        {activeModule === "recipe" && (
          <RecipeSimulator language={language} region={region} />
        )}
        {activeModule === "price" && (
          <PriceChecker language={language} region={region} />
        )}
        {activeModule === "top" && (
          <TopProducts language={language} region={region} />
        )}
      </div>
    </div>
  );
}
