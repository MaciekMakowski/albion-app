export function isSubsequence(needle, hay) {
  let i = 0;
  let j = 0;
  while (i < needle.length && j < hay.length) {
    if (needle[i] === hay[j]) i++;
    j++;
  }
  return i === needle.length;
}

export function resolveOutputItemId(value, itemsIndex) {
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

export function findMatches(query, itemsIndex, limit = 10) {
  if (!query || query.length < 1) return [];

  const s = query.toLowerCase();
  const out = [];
  const searchIndex = itemsIndex || [];

  for (let i = 0; i < searchIndex.length && out.length < limit; i++) {
    const it = searchIndex[i];
    if (
      (it.id && it.id.toLowerCase().startsWith(s)) ||
      (it.name && it.name.toLowerCase().startsWith(s))
    ) {
      out.push({ id: it.id, name: it.name });
    }
  }

  for (let i = 0; i < searchIndex.length && out.length < limit; i++) {
    const it = searchIndex[i];
    if (out.find((x) => x.id === it.id)) continue;
    if (it.text.includes(s)) out.push({ id: it.id, name: it.name });
  }

  if (out.length < limit) {
    for (let i = 0; i < searchIndex.length && out.length < limit; i++) {
      const it = searchIndex[i];
      if (out.find((x) => x.id === it.id)) continue;
      if (isSubsequence(s, it.text)) out.push({ id: it.id, name: it.name });
    }
  }

  return out.slice(0, limit);
}
