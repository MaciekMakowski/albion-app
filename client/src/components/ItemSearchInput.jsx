import { useEffect, useMemo, useRef, useState } from "react";
import {
  getItemDisplayLabel,
  getItemDisplayName,
} from "../features/recipeSimulator/recipeSimulatorLogic";
import { getUiText } from "../features/recipeSimulator/translations";
import { findMatches, resolveOutputItemId } from "../shared/itemSearch";
import ItemIcon from "./ItemIcon";

function getTierFromId(itemId) {
  const match = String(itemId || "").match(/(^|[_-])T(\d+)(?=_|$)/i);
  return match ? `T${match[2]}` : "";
}

function getEnchantmentFromId(itemId) {
  const levelMatch = String(itemId || "").match(/_LEVEL([1-4])$/i);
  if (levelMatch) return Number(levelMatch[1]);

  const atMatch = String(itemId || "").match(/@(\d+)$/);
  if (atMatch) return Number(atMatch[1]);

  return 0;
}

export default function ItemSearchInput({
  value,
  onChange,
  onSelectId,
  itemsIndex,
  itemNameLookup,
  label,
  openUp = false,
  language = "EN-US",
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [selectedTier, setSelectedTier] = useState("all");
  const [selectedEnchantment, setSelectedEnchantment] = useState("all");
  const timerRef = useRef(null);
  const containerRef = useRef(null);

  const tierOptions = useMemo(() => {
    const tiers = new Set();
    for (const item of itemsIndex || []) {
      const tier = getTierFromId(item.id);
      if (tier) tiers.add(tier);
    }
    return [...tiers].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  }, [itemsIndex]);

  const enchantmentOptions = useMemo(() => {
    const enchantments = new Set([0]);
    for (const item of itemsIndex || []) {
      enchantments.add(getEnchantmentFromId(item.id));
    }
    return [...enchantments].sort((a, b) => a - b);
  }, [itemsIndex]);

  function applyFilters(items) {
    return (items || []).filter((item) => {
      const tier = getTierFromId(item.id);
      const enchantment = getEnchantmentFromId(item.id);

      const tierOk = selectedTier === "all" || tier === selectedTier;
      const enchantmentOk =
        selectedEnchantment === "all" ||
        enchantment === Number(selectedEnchantment);

      return tierOk && enchantmentOk;
    });
  }

  function updateSuggestions(inputValue) {
    const hasActiveFilters =
      selectedTier !== "all" || selectedEnchantment !== "all";
    const candidateLimit = hasActiveFilters ? 200 : 10;
    const matches = findMatches(inputValue, itemsIndex, candidateLimit);
    setSuggestions(applyFilters(matches).slice(0, 10));
  }

  function handleChange(nextValue) {
    onChange(nextValue);

    const resolvedId = resolveOutputItemId(nextValue, itemsIndex);
    if (resolvedId) {
      onSelectId(resolvedId);
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      updateSuggestions(nextValue);
    }, 180);
  }

  function selectSuggestion(item) {
    const nextId = item?.id || "";
    onChange(getItemDisplayName(nextId, itemNameLookup));
    onSelectId(nextId);
    setSuggestions([]);
  }

  useEffect(() => {
    updateSuggestions(value);
  }, [selectedTier, selectedEnchantment, itemsIndex]);

  useEffect(() => {
    function handleDocumentMouseDown(event) {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target)) return;
      setSuggestions([]);
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
    };
  }, []);

  return (
    <div className="fantasy-control-group wide" ref={containerRef}>
      {label && <label>{label}</label>}
      <div
        style={{
          display: "flex",
          gap: "8px",
        }}
      >
        <select
          value={selectedTier}
          onChange={(e) => setSelectedTier(e.target.value)}
          aria-label={getUiText("filterTier", language)}
        >
          <option value="all">{getUiText("filterTierAll", language)}</option>
          {tierOptions.map((tier) => (
            <option key={tier} value={tier}>
              {tier}
            </option>
          ))}
        </select>

        <select
          value={selectedEnchantment}
          onChange={(e) => setSelectedEnchantment(e.target.value)}
          aria-label={getUiText("filterEnchantment", language)}
        >
          <option value="all">
            {getUiText("filterEnchantmentAll", language)}
          </option>
          {enchantmentOptions.map((enchantment) => (
            <option key={enchantment} value={String(enchantment)}>
              {enchantment}
            </option>
          ))}
        </select>
      </div>
      <div className={`fantasy-output-search${openUp ? " open-up" : ""}`}>
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
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <ItemIcon itemId={item.id} size={24} />
                <span>
                  {getItemDisplayLabel(item.id, itemNameLookup) || item.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
