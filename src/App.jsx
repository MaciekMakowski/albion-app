import { useEffect, useRef, useState } from "react";
import itemsData from "./items.json";

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

export default function App() {
  const [ingredients, setIngredients] = useState([]);
  const [outputItem, setOutputItem] = useState("T4_BAG");
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
    // deep copy and validation
    const init = ingredients.map((it) => ({
      ...it,
      required: Math.max(1, Number(it.required) || 1),
      available: Math.max(0, Number(it.available) || 0),
      buyPrice: Number(it.buyPrice) || 0,
    }));
    // store initial available for cost calc
    const initialAvailable = init.map((it) => it.available);

    const rp = Math.max(0, Math.min(100, Number(returnPercent) || 0)) / 100;

    let available = init.map((it) => it.available);
    let crafts = 0;

    while (true) {
      // can craft?
      const can = init.every((it, idx) => available[idx] >= it.required);
      if (!can) break;
      // consume
      for (let i = 0; i < init.length; i++) {
        available[i] -= init[i].required;
      }
      // salvage returns
      for (let i = 0; i < init.length; i++) {
        const ret = init[i].required * rp;
        available[i] += ret;
      }
      crafts++;
      // prevent infinite loops
      if (crafts > 100000) break;
    }

    const consumed = init.map(
      (it, idx) => initialAvailable[idx] - available[idx],
    );
    const totalCost = consumed.reduce(
      (s, c, idx) => s + c * init[idx].buyPrice,
      0,
    );

    // fetch prices for output across cities
    const host = getHostForRegion();
    const url = `${host}/api/v2/stats/prices/${encodeURIComponent(outputItem)}.json`;

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
    // load local items.json once for autocomplete
    const data = itemsData?.items || itemsData;
    const { entries, defs } = collectItemEntries(data);
    itemDefsRef.current = defs;
    setItemDefs(defs);

    const idx = entries.map((it) => ({
      id: it.id,
      name: it.name,
      text: (it.id + " " + it.name).toLowerCase(),
    }));
    const map = Object.fromEntries(entries.map((it) => [it.id, it.name]));

    setItemsIndex(idx);
    setItemsMap(map);
  }, []);

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

  function findMatches(q) {
    if (!q || q.length < 1) return [];
    const s = q.toLowerCase();
    const out = [];
    // fallback: if index is empty but itemsList exists, build a simple temp list
    const searchIndex = itemsIndex || [];
    // first pass: startsWith
    for (let i = 0; i < searchIndex.length && out.length < 10; i++) {
      const it = searchIndex[i];
      if (
        (it.id && it.id.toLowerCase().startsWith(s)) ||
        (it.name && it.name.toLowerCase().startsWith(s))
      ) {
        out.push({ id: it.id, name: it.name });
      }
    }
    // second pass: includes
    for (let i = 0; i < searchIndex.length && out.length < 10; i++) {
      const it = searchIndex[i];
      if (out.find((x) => x.id === it.id)) continue;
      if (it.text.includes(s)) out.push({ id: it.id, name: it.name });
    }
    // third pass: fuzzy subsequence
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

    const trimmed = String(nextValue).trim();
    const defs = itemDefsRef.current || itemDefs;
    if (trimmed && defs[trimmed]) {
      setSelectedOutputId(trimmed);
    }

    if (timersRef.current["out"]) clearTimeout(timersRef.current["out"]);
    timersRef.current["out"] = setTimeout(() => {
      setOutputSuggestions(findMatches(nextValue));
    }, 180);
  }

  function selectOutputSuggestion(item) {
    const nextId = item?.id || "";
    setOutputItem(nextId);
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
        <h2 style={{ margin: 0 }}>Albion Recipe Simulator</h2>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <label style={{ width: 80 }}>Region</label>
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="europe">Europe</option>
            <option value="west">Americas (West)</option>
            <option value="east">Asia (East)</option>
          </select>
        </div>
      </div>
      <p>
        Ingredients are populated from the selected output's crafting
        requirements. You can set available material quantity, buy price, and
        buy city.
      </p>

      {ingredients.map((it, idx) => (
        <div key={idx} className="item">
          <div className="row">
            <label style={{ width: 120 }}>Item id/name</label>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{it.name}</div>
              {itemsMap[it.name] && (
                <div style={{ fontSize: 12, color: "#374151", marginTop: 4 }}>
                  {itemsMap[it.name]}
                </div>
              )}
            </div>
            <label style={{ width: 140, marginLeft: 8 }}>
              Required per craft
            </label>
            <input
              type="number"
              value={it.required}
              disabled
              style={{ width: 80, opacity: 0.7, cursor: "not-allowed" }}
            />
            <label style={{ width: 120, marginLeft: 8 }}>Available</label>
            <input
              type="number"
              value={it.available}
              onChange={(e) =>
                updateIngredient(idx, { available: Number(e.target.value) })
              }
              style={{ width: 100 }}
            />
            <label style={{ width: 120, marginLeft: 8 }}>Buy price/unit</label>
            <input
              type="number"
              value={it.buyPrice}
              onChange={(e) =>
                updateIngredient(idx, { buyPrice: Number(e.target.value) })
              }
              style={{ width: 120 }}
            />
            <label style={{ width: 100, marginLeft: 8 }}>Buy city</label>
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
        <label style={{ width: 120 }}>Output item id</label>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            value={outputItem}
            onChange={(e) => onOutputSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const nextId = String(outputItem || "").trim();
                if (nextId) {
                  setSelectedOutputId(nextId);
                  setOutputSuggestions([]);
                }
              }
            }}
            style={{ width: 220 }}
          />
          {itemsMap[outputItem] && (
            <div style={{ fontSize: 12, color: "#374151", marginTop: 4 }}>
              {itemsMap[outputItem]}
            </div>
          )}
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
                  {s.id} {s.name ? `— ${s.name}` : ""}
                </div>
              ))}
            </div>
          )}
        </div>
        <label style={{ width: 160 }}>Percent return (salvage)</label>
        <input
          type="number"
          value={returnPercent}
          onChange={(e) => setReturnPercent(Number(e.target.value))}
          style={{ width: 80 }}
        />
        <button onClick={simulate}>Simulate</button>
        <button
          onClick={refreshAllPrices}
          disabled={refreshingPrices}
          style={{ marginLeft: 8 }}
        >
          {refreshingPrices ? "Refreshing..." : "Refresh all ingredient prices"}
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        {results && (
          <div>
            <h3>Simulation</h3>
            <p>
              Estimated processed outputs: <strong>{results.crafts}</strong>
            </p>
            <p>
              Total cost of consumed materials:{" "}
              <strong>{Math.round(results.totalCost)}</strong>
            </p>

            {results.loading && <p>Loading prices...</p>}
            {results.error && (
              <p style={{ color: "red" }}>
                Error fetching prices: {results.error}
              </p>
            )}
            {results.rows && (
              <div>
                <h4>Prices & profit per city (selling produced output)</h4>
                <table>
                  <thead>
                    <tr>
                      <th>City</th>
                      <th>Price</th>
                      <th>Revenue</th>
                      <th>Profit</th>
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
