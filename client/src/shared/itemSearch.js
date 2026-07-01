export function isSubsequence(needle, hay) {
  let i = 0;
  let j = 0;
  while (i < needle.length && j < hay.length) {
    if (needle[i] === hay[j]) i++;
    j++;
  }
  return i === needle.length;
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_@.\-]+/g, " ")
    .replace(
      /\b(?:level|lvl|poziom|enchant|enchantment)\s+([0-4])\b/g,
      " level$1 ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function compactSearchText(value) {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

function hasLooseTokenMatch(query, target) {
  const queryTokens = normalizeSearchText(query).split(" ").filter(Boolean);
  const targetTokens = normalizeSearchText(target).split(" ").filter(Boolean);
  const targetCompact = targetTokens.join("");

  if (!queryTokens.length || !targetTokens.length) return false;

  return queryTokens.every((token) => {
    if (token.length <= 1) return true;
    if (/\d/.test(token)) {
      return targetCompact.includes(token) || targetTokens.includes(token);
    }
    if (targetCompact.includes(token)) return true;

    return targetTokens.some((word) => {
      if (word.startsWith(token) || token.startsWith(word)) return true;
      if (token.length >= 5) {
        const root = token.slice(0, 4);
        return word.startsWith(root);
      }
      return false;
    });
  });
}

function getEnchantAliases(itemId) {
  const id = String(itemId || "");
  if (!id) return [];

  const aliases = [id];
  // T5_WOOD_LEVEL1 (items.json) -> T5_WOOD_LEVEL1@1 (API / items_names.json)
  const levelMatch = id.match(/^(.*_LEVEL([1-4]))$/);
  if (levelMatch) {
    aliases.push(`${levelMatch[1]}@${levelMatch[2]}`);
  }

  // T5_WOOD_LEVEL1@1 (items_names.json) -> T5_WOOD_LEVEL1 (items.json)
  const atLevelMatch = id.match(/^(.*_LEVEL[1-4])@[1-4]$/);
  if (atLevelMatch) {
    aliases.push(atLevelMatch[1]);
  }

  return aliases;
}

export function resolveOutputItemId(value, itemsIndex) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;

  const searchIndex = itemsIndex || [];
  const normalizedInput = normalizeSearchText(trimmed);
  const compactInput = compactSearchText(trimmed);
  const loweredInputAliases = getEnchantAliases(trimmed).map((id) =>
    id.toLowerCase(),
  );

  const exactId = searchIndex.find((item) => {
    const aliases = getEnchantAliases(item.id).map((id) => id.toLowerCase());
    if (aliases.some((alias) => loweredInputAliases.includes(alias)))
      return true;

    const normalizedAliases = aliases.map((alias) =>
      normalizeSearchText(alias),
    );
    if (normalizedAliases.some((alias) => alias === normalizedInput))
      return true;

    const compactAliases = aliases.map((alias) => compactSearchText(alias));
    return compactAliases.some((alias) => alias === compactInput);
  });
  if (exactId) return exactId.id;

  const exactName = searchIndex.find((item) => {
    const itemName = String(item.name || "");
    if (itemName.toLowerCase() === trimmed.toLowerCase()) return true;
    return normalizeSearchText(itemName) === normalizedInput;
  });
  if (exactName) return exactName.id;

  return null;
}

export function findMatches(query, itemsIndex, limit = 10) {
  if (!query || query.length < 1) return [];

  const s = query.toLowerCase();
  const normalizedQuery = normalizeSearchText(query);
  const compactQuery = compactSearchText(query);
  const out = [];
  const searchIndex = itemsIndex || [];

  for (let i = 0; i < searchIndex.length && out.length < limit; i++) {
    const it = searchIndex[i];
    const aliases = getEnchantAliases(it.id).map((id) => id.toLowerCase());
    const normalizedAliases = aliases.map((alias) =>
      normalizeSearchText(alias),
    );
    const normalizedName = normalizeSearchText(it.name);
    if (
      aliases.some((alias) => alias.startsWith(s)) ||
      (it.name && it.name.toLowerCase().startsWith(s)) ||
      normalizedAliases.some((alias) => alias.startsWith(normalizedQuery)) ||
      normalizedName.startsWith(normalizedQuery)
    ) {
      out.push({ id: it.id, name: it.name });
    }
  }

  for (let i = 0; i < searchIndex.length && out.length < limit; i++) {
    const it = searchIndex[i];
    if (out.find((x) => x.id === it.id)) continue;
    const aliasesText = getEnchantAliases(it.id).join(" ").toLowerCase();
    const combinedText = `${it.text} ${aliasesText}`;
    const normalizedCombined = normalizeSearchText(combinedText);
    const compactCombined = compactSearchText(combinedText);
    if (
      combinedText.includes(s) ||
      normalizedCombined.includes(normalizedQuery) ||
      compactCombined.includes(compactQuery) ||
      hasLooseTokenMatch(normalizedQuery, combinedText)
    ) {
      out.push({ id: it.id, name: it.name });
    }
  }

  if (out.length < limit) {
    for (let i = 0; i < searchIndex.length && out.length < limit; i++) {
      const it = searchIndex[i];
      if (out.find((x) => x.id === it.id)) continue;
      const aliasesText = getEnchantAliases(it.id).join(" ").toLowerCase();
      const combinedText = `${it.text} ${aliasesText}`;
      const normalizedCombined = normalizeSearchText(combinedText);
      const compactCombined = compactSearchText(combinedText);
      if (
        isSubsequence(s, combinedText) ||
        isSubsequence(normalizedQuery, normalizedCombined) ||
        isSubsequence(compactQuery, compactCombined)
      ) {
        out.push({ id: it.id, name: it.name });
      }
    }
  }

  return out.slice(0, limit);
}
