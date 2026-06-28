import { useEffect, useRef, useState } from "react";
import itemsData from "../data/items.json";
import namesData from "../data/items_names.json";

const buyCities = [
  "Bridgewatch",
  "Martlock",
  "Lymhurst",
  "Fort Sterling",
  "Thetford",
  "Caerleon",
  "Black Market",
];

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

function buildLanguageOptions(source) {
  const locales = new Set();
  (source || []).forEach((entry) => {
    if (entry?.LocalizedNames && typeof entry.LocalizedNames === "object") {
      Object.keys(entry.LocalizedNames).forEach((locale) =>
        locales.add(locale),
      );
    }
  });
  const ordered = Array.from(locales).sort();
  return ordered.length > 0 ? ordered : ["EN-US", "PL-PL"];
}

function buildNameLookup(source, language) {
  const lookup = {};
  (source || []).forEach((entry) => {
    const uniqueName = entry?.UniqueName;
    const localizedName = entry?.LocalizedNames?.[language];
    if (uniqueName) {
      lookup[uniqueName] = localizedName || uniqueName;
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

const supportedLanguages = buildLanguageOptions(namesData);

const uiTranslations = {
  "EN-US": {
    title: "Albion Recipe Simulator",
    language: "Language",
    region: "Region",
    item: "Item",
    requiredPerCraft: "Required per craft",
    available: "Available",
    buyPrice: "Buy price/unit",
    buyCity: "Buy city",
    outputItem: "Output item",
    percentReturn: "Percent return (salvage)",
    simulate: "Simulate",
    refreshPrices: "Refresh all ingredient prices",
    refreshing: "Refreshing...",
    intro:
      "Ingredients are populated from the selected output's crafting requirements. Item names are shown in the selected language and you can set available material quantity, buy price, and buy city.",
    simulation: "Simulation",
    estimatedOutputs: "Estimated processed outputs",
    totalCost: "Total cost of consumed materials",
    loadingPrices: "Loading prices...",
    errorFetchingPrices: "Error fetching prices",
    pricesProfit: "Prices & profit per city (selling produced output)",
    city: "City",
    price: "Price",
    revenue: "Revenue",
    profit: "Profit",
    europe: "Europe",
    west: "Americas (West)",
    east: "Asia (East)",
  },
  "PL-PL": {
    title: "Symulator receptur Albion",
    language: "Język",
    region: "Region",
    item: "Przedmiot",
    requiredPerCraft: "Wymagane na rzemiosło",
    available: "Dostępne",
    buyPrice: "Cena zakupu/jednostka",
    buyCity: "Miasto zakupu",
    outputItem: "Przedmiot wyjściowy",
    percentReturn: "Zwrot procentowy (salvage)",
    simulate: "Symuluj",
    refreshPrices: "Odśwież ceny wszystkich składników",
    refreshing: "Odświeżanie...",
    intro:
      "Składniki są uzupełniane na podstawie wymagań rzemieślniczych dla wybranego przedmiotu wyjściowego. Nazwy przedmiotów są wyświetlane w wybranym języku, a możesz ustawić dostępne ilości, cenę zakupu i miasto zakupu.",
    simulation: "Symulacja",
    estimatedOutputs: "Szacowana liczba przetworzonych wyjść",
    totalCost: "Całkowity koszt zużytych materiałów",
    loadingPrices: "Pobieranie cen...",
    errorFetchingPrices: "Błąd pobierania cen",
    pricesProfit: "Ceny i zysk według miasta (sprzedaż wytworzonego wyjścia)",
    city: "Miasto",
    price: "Cena",
    revenue: "Przychód",
    profit: "Zysk",
    europe: "Europa",
    west: "Ameryki (Zachód)",
    east: "Azja (Wschód)",
  },
  "DE-DE": {
    title: "Albion-Rezept-Simulator",
    language: "Sprache",
    region: "Region",
    item: "Gegenstand",
    requiredPerCraft: "Benötigt pro Handwerk",
    available: "Verfügbar",
    buyPrice: "Kaufpreis/Einheit",
    buyCity: "Kaufstadt",
    outputItem: "Ausgangsgegenstand",
    percentReturn: "Rückzahlungsprozentsatz (Salvage)",
    simulate: "Simulieren",
    refreshPrices: "Preise aller Zutaten aktualisieren",
    refreshing: "Aktualisieren...",
    intro:
      "Die Zutaten werden aus den Handwerksanforderungen des ausgewählten Ausgabegegenstands übernommen. Die Gegenstandsnamen werden in der ausgewählten Sprache angezeigt und Sie können verfügbare Mengen, Kaufpreis und Kaufstadt festlegen.",
    simulation: "Simulation",
    estimatedOutputs: "Geschätzte verarbeitete Ausgaben",
    totalCost: "Gesamtkosten der verbrauchten Materialien",
    loadingPrices: "Preise werden geladen...",
    errorFetchingPrices: "Fehler beim Laden der Preise",
    pricesProfit:
      "Preise und Gewinn pro Stadt (Verkauf des erzeugten Ausgangs)",
    city: "Stadt",
    price: "Preis",
    revenue: "Umsatz",
    profit: "Gewinn",
    europe: "Europa",
    west: "Amerika (West)",
    east: "Asien (Ost)",
  },
  "FR-FR": {
    title: "Simulateur de recettes Albion",
    language: "Langue",
    region: "Région",
    item: "Objet",
    requiredPerCraft: "Requis par artisanat",
    available: "Disponible",
    buyPrice: "Prix d'achat/unité",
    buyCity: "Ville d'achat",
    outputItem: "Objet de sortie",
    percentReturn: "Pourcentage de retour (salvage)",
    simulate: "Simuler",
    refreshPrices: "Actualiser les prix de tous les ingrédients",
    refreshing: "Actualisation...",
    intro:
      "Les ingrédients sont remplis à partir des exigences de fabrication de l'objet de sortie sélectionné. Les noms d'objets sont affichés dans la langue sélectionnée et vous pouvez définir les quantités disponibles, le prix d'achat et la ville d'achat.",
    simulation: "Simulation",
    estimatedOutputs: "Sorties traitées estimées",
    totalCost: "Coût total des matériaux consommés",
    loadingPrices: "Chargement des prix...",
    errorFetchingPrices: "Erreur lors du chargement des prix",
    pricesProfit: "Prix et bénéfice par ville (vente de la sortie produite)",
    city: "Ville",
    price: "Prix",
    revenue: "Revenu",
    profit: "Bénéfice",
    europe: "Europe",
    west: "Amériques (Ouest)",
    east: "Asie (Est)",
  },
  "RU-RU": {
    title: "Симулятор рецептов Albion",
    language: "Язык",
    region: "Регион",
    item: "Предмет",
    requiredPerCraft: "Требуется на крафт",
    available: "Доступно",
    buyPrice: "Цена покупки/единица",
    buyCity: "Город покупки",
    outputItem: "Выходной предмет",
    percentReturn: "Процент возврата (salvage)",
    simulate: "Симулировать",
    refreshPrices: "Обновить цены всех ингредиентов",
    refreshing: "Обновление...",
    intro:
      "Ингредиенты заполняются на основе требований к крафту выбранного выходного предмета. Названия предметов отображаются на выбранном языке, и вы можете задать доступное количество, цену покупки и город покупки.",
    simulation: "Симуляция",
    estimatedOutputs: "Оценочное количество обработанных выходов",
    totalCost: "Общая стоимость израсходованных материалов",
    loadingPrices: "Загрузка цен...",
    errorFetchingPrices: "Ошибка загрузки цен",
    pricesProfit: "Цены и прибыль по городам (продажа полученного предмета)",
    city: "Город",
    price: "Цена",
    revenue: "Выручка",
    profit: "Прибыль",
    europe: "Европа",
    west: "Америка (Запад)",
    east: "Азия (Восток)",
  },
};

function getUiText(key, language) {
  const locale = uiTranslations[language] || uiTranslations["EN-US"];
  return locale[key] || uiTranslations["EN-US"][key] || key;
}

export default function RecipeSimulator() {
  const [ingredients, setIngredients] = useState([]);
  const [outputItem, setOutputItem] = useState("");
  const [selectedOutputId, setSelectedOutputId] = useState("T4_BAG");
  const [outputSuggestions, setOutputSuggestions] = useState([]);
  const timersRef = useRef({});
  const [itemsIndex, setItemsIndex] = useState([]);
  const [itemsMap, setItemsMap] = useState({});
  const [itemDefs, setItemDefs] = useState({});
  const itemDefsRef = useRef({});
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [returnPercent, setReturnPercent] = useState(20);
  const [region, setRegion] = useState("europe");
  const [language, setLanguage] = useState(
    supportedLanguages.includes("PL-PL")
      ? "PL-PL"
      : supportedLanguages[0] || "EN-US",
  );
  const [itemNameLookup, setItemNameLookup] = useState({});
  const [results, setResults] = useState(null);

  function updateIngredient(i, changes) {
    setIngredients((prev) =>
      prev.map((item, idx) => (idx === i ? { ...item, ...changes } : item)),
    );
  }

  function getHostForRegion() {
    return region === "europe"
      ? "https://europe.albion-online-data.com"
      : region === "west"
        ? "https://west.albion-online-data.com"
        : "https://east.albion-online-data.com";
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
    const totalCost = consumed.reduce(
      (s, c, idx) => s + c * init[idx].buyPrice,
      0,
    );

    const host = getHostForRegion();
    const outputId = selectedOutputId || outputItem;
    const url = `${host}/api/v2/stats/prices/${encodeURIComponent(outputId)}.json`;

    setResults({ loading: true, crafts, consumed, totalCost });

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
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
            profit: price * crafts - totalCost,
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
        setResults((prev) => ({ ...prev, loading: false, rows }));
      })
      .catch((err) =>
        setResults((prev) => ({ ...prev, loading: false, error: String(err) })),
      );
  }

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

  function isSubsequence(needle, hay) {
    let i = 0,
      j = 0;
    while (i < needle.length && j < hay.length) {
      if (needle[i] === hay[j]) i++;
      j++;
    }
    return i === needle.length;
  }

  function resolveOutputItemId(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return null;

    const searchIndex = itemsIndex || [];
    const exactId = searchIndex.find(
      (item) => item.id.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exactId) return exactId.id;

    const exactName = searchIndex.find(
      (item) => item.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exactName) return exactName.id;

    return null;
  }

  function findMatches(q) {
    if (!q || q.length < 1) return [];
    const s = q.toLowerCase();
    const out = [];
    const searchIndex = itemsIndex || [];
    for (let i = 0; i < searchIndex.length && out.length < 10; i++) {
      const it = searchIndex[i];
      if (
        (it.id && it.id.toLowerCase().startsWith(s)) ||
        (it.name && it.name.toLowerCase().startsWith(s))
      ) {
        out.push({ id: it.id, name: it.name });
      }
    }
    for (let i = 0; i < searchIndex.length && out.length < 10; i++) {
      const it = searchIndex[i];
      if (out.find((x) => x.id === it.id)) continue;
      if (it.text.includes(s)) out.push({ id: it.id, name: it.name });
    }
    if (out.length < 10) {
      for (let i = 0; i < searchIndex.length && out.length < 10; i++) {
        const it = searchIndex[i];
        if (out.find((x) => x.id === it.id)) continue;
        if (isSubsequence(s, it.text)) out.push({ id: it.id, name: it.name });
      }
    }
    return out.slice(0, 10);
  }

  function onOutputSearchChange(q) {
    const nextValue = q || "";
    setOutputItem(nextValue);

    const resolvedId = resolveOutputItemId(nextValue);
    if (resolvedId) {
      setSelectedOutputId(resolvedId);
    }

    if (timersRef.current["out"]) clearTimeout(timersRef.current["out"]);
    timersRef.current["out"] = setTimeout(() => {
      setOutputSuggestions(findMatches(nextValue));
    }, 180);
  }

  function selectOutputSuggestion(item) {
    const nextId = item?.id || "";
    setOutputItem(getItemDisplayName(nextId, itemNameLookup));
    setSelectedOutputId(nextId);
    setOutputSuggestions([]);
  }

  async function fetchItemMarketPrice(itemId, city) {
    try {
      const host = getHostForRegion();
      const url = `${host}/api/v2/stats/prices/${encodeURIComponent(itemId)}.json`;
      const r = await fetch(url);
      const data = await r.json();
      if (city) {
        const normalizedCity = city.toLowerCase();
        const matched = data.find((d) => {
          const value = (d.city || d.location || d.name || "").toLowerCase();
          return value === normalizedCity;
        });
        if (matched) {
          return (
            matched.sell_price_min || matched.sell_price || matched.price || 0
          );
        }
      }
      let min = Infinity;
      for (const d of data) {
        const p = d.sell_price_min || d.sell_price || d.price || 0;
        if (p && p > 0 && p < min) min = p;
      }
      if (min === Infinity) return 0;
      return min;
    } catch (e) {
      return 0;
    }
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
    <div className="max-w-3xl mx-auto p-4">
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h2 style={{ margin: 0 }}>{getUiText("title", language)}</h2>
        <div
          className="row"
          style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}
        >
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <label style={{ width: 70 }}>
              {getUiText("language", language)}
            </label>
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
            <label style={{ width: 70 }}>{getUiText("region", language)}</label>
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="europe">{getUiText("europe", language)}</option>
              <option value="west">{getUiText("west", language)}</option>
              <option value="east">{getUiText("east", language)}</option>
            </select>
          </div>
        </div>
      </div>
      <p>{getUiText("intro", language)}</p>

      {ingredients.map((it, idx) => (
        <div key={idx} className="item">
          <div className="row">
            <label style={{ width: 120 }}>{getUiText("item", language)}</label>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>
                {getItemDisplayLabel(it.name, itemNameLookup) || it.name}
              </div>
            </div>
            <label style={{ width: 140, marginLeft: 8 }}>
              {getUiText("requiredPerCraft", language)}
            </label>
            <input
              type="number"
              value={it.required}
              disabled
              style={{ width: 80, opacity: 0.7, cursor: "not-allowed" }}
            />
            <label style={{ width: 120, marginLeft: 8 }}>
              {getUiText("available", language)}
            </label>
            <input
              type="number"
              value={it.available}
              onChange={(e) =>
                updateIngredient(idx, { available: Number(e.target.value) })
              }
              style={{ width: 100 }}
            />
            <label style={{ width: 120, marginLeft: 8 }}>
              {getUiText("buyPrice", language)}
            </label>
            <input
              type="number"
              value={it.buyPrice}
              onChange={(e) =>
                updateIngredient(idx, { buyPrice: Number(e.target.value) })
              }
              style={{ width: 120 }}
            />
            <label style={{ width: 100, marginLeft: 8 }}>
              {getUiText("buyCity", language)}
            </label>
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
        <label style={{ width: 120 }}>
          {getUiText("outputItem", language)}
        </label>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            value={outputItem}
            onChange={(e) => onOutputSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const nextId = resolveOutputItemId(outputItem);
                if (nextId) {
                  setSelectedOutputId(nextId);
                  setOutputSuggestions([]);
                }
              }
            }}
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
                  {getItemDisplayLabel(s.id, itemNameLookup) || s.name}
                </div>
              ))}
            </div>
          )}
        </div>
        <label style={{ width: 160 }}>
          {getUiText("percentReturn", language)}
        </label>
        <input
          type="number"
          value={returnPercent}
          onChange={(e) => setReturnPercent(Number(e.target.value))}
          style={{ width: 80 }}
        />
        <button onClick={simulate}>{getUiText("simulate", language)}</button>
        <button
          onClick={refreshAllPrices}
          disabled={refreshingPrices}
          style={{ marginLeft: 8 }}
        >
          {refreshingPrices
            ? getUiText("refreshing", language)
            : getUiText("refreshPrices", language)}
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        {results && (
          <div>
            <h3>{getUiText("simulation", language)}</h3>
            <p>
              {getUiText("estimatedOutputs", language)}:{" "}
              <strong>{results.crafts}</strong>
            </p>
            <p>
              {getUiText("totalCost", language)}:{" "}
              <strong>{Math.round(results.totalCost)}</strong>
            </p>

            {results.loading && <p>{getUiText("loadingPrices", language)}</p>}
            {results.error && (
              <p style={{ color: "red" }}>
                {getUiText("errorFetchingPrices", language)}: {results.error}
              </p>
            )}
            {results.rows && (
              <div>
                <h4>{getUiText("pricesProfit", language)}</h4>
                <table>
                  <thead>
                    <tr>
                      <th>{getUiText("city", language)}</th>
                      <th>{getUiText("price", language)}</th>
                      <th>{getUiText("revenue", language)}</th>
                      <th>{getUiText("profit", language)}</th>
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
