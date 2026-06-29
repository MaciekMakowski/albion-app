export function isSubsequence(needle, hay) {
  let i = 0;
  let j = 0;
  while (i < needle.length && j < hay.length) {
    if (needle[i] === hay[j]) i++;
    j++;
  }
  return i === needle.length;
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
  const loweredInputAliases = getEnchantAliases(trimmed).map((id) =>
    id.toLowerCase(),
  );

  const exactId = searchIndex.find((item) => {
    const aliases = getEnchantAliases(item.id).map((id) => id.toLowerCase());
    return aliases.some((alias) => loweredInputAliases.includes(alias));
  });
  if (exactId) return exactId.id;

  const exactName = searchIndex.find(
    (item) => item.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (exactName) return exactName.id;

  return null;
}

export function findMatches(query, itemsIndex, limit = 10) {
  if (!query || query.length < 1) return [];

  const s = query.toLowerCase();
  const out = [];
  const searchIndex = itemsIndex || [];

  for (let i = 0; i < searchIndex.length && out.length < limit; i++) {
    const it = searchIndex[i];
    const aliases = getEnchantAliases(it.id).map((id) => id.toLowerCase());
    if (
      aliases.some((alias) => alias.startsWith(s)) ||
      (it.name && it.name.toLowerCase().startsWith(s))
    ) {
      out.push({ id: it.id, name: it.name });
    }
  }

  for (let i = 0; i < searchIndex.length && out.length < limit; i++) {
    const it = searchIndex[i];
    if (out.find((x) => x.id === it.id)) continue;
    const aliasesText = getEnchantAliases(it.id).join(" ").toLowerCase();
    const combinedText = `${it.text} ${aliasesText}`;
    if (combinedText.includes(s)) out.push({ id: it.id, name: it.name });
  }

  if (out.length < limit) {
    for (let i = 0; i < searchIndex.length && out.length < limit; i++) {
      const it = searchIndex[i];
      if (out.find((x) => x.id === it.id)) continue;
      const aliasesText = getEnchantAliases(it.id).join(" ").toLowerCase();
      const combinedText = `${it.text} ${aliasesText}`;
      if (isSubsequence(s, combinedText))
        out.push({ id: it.id, name: it.name });
    }
  }

  return out.slice(0, limit);
}
