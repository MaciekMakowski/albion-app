import { useRef, useState } from "react";
import { getItemDisplayLabel, getItemDisplayName } from "../features/recipeSimulator/recipeSimulatorLogic";
import { findMatches, resolveOutputItemId } from "../shared/itemSearch";

export default function ItemSearchInput({
  value,
  onChange,
  onSelectId,
  itemsIndex,
  itemNameLookup,
  label,
  openUp = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const timerRef = useRef(null);

  function handleChange(nextValue) {
    onChange(nextValue);

    const resolvedId = resolveOutputItemId(nextValue, itemsIndex);
    if (resolvedId) {
      onSelectId(resolvedId);
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setSuggestions(findMatches(nextValue, itemsIndex));
    }, 180);
  }

  function selectSuggestion(item) {
    const nextId = item?.id || "";
    onChange(getItemDisplayName(nextId, itemNameLookup));
    onSelectId(nextId);
    setSuggestions([]);
  }

  return (
    <div className="fantasy-control-group wide">
      {label && <label>{label}</label>}
      <div
        className={`fantasy-output-search${openUp ? " open-up" : ""}`}
      >
        <div className="fantasy-input-wrap">
          <input
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const nextId = resolveOutputItemId(value, itemsIndex);
                if (nextId) {
                  onSelectId(nextId);
                  setSuggestions([]);
                }
              }
            }}
            style={{ flex: 1 }}
          />
        </div>
        {suggestions.length > 0 && (
          <div className="fantasy-suggestions">
            {suggestions.map((item) => (
              <div
                key={item.id}
                className="fantasy-suggestion"
                onMouseDown={() => selectSuggestion(item)}
              >
                {getItemDisplayLabel(item.id, itemNameLookup) || item.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
