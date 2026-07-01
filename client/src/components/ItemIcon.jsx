import { useEffect, useMemo, useState } from "react";

const SERVER_ICON_BASE_URL = "/api/market/item-icon";

function normalizeItemIdentifier(itemId) {
  const value = String(itemId || "").trim();
  if (!value) return "";

  const levelMatch = value.match(/^(.*)_LEVEL([0-4])$/i);
  if (levelMatch) {
    return `${levelMatch[1]}@${levelMatch[2]}`;
  }

  return value;
}

function clampSize(size) {
  const n = Number(size);
  if (!Number.isFinite(n)) return 48;
  return Math.max(1, Math.min(217, Math.round(n)));
}

export default function ItemIcon({
  itemId,
  size = 22,
  quality,
  alt,
  title,
  className,
  style,
}) {
  const [failed, setFailed] = useState(false);

  const identifier = useMemo(() => normalizeItemIdentifier(itemId), [itemId]);
  const finalSize = clampSize(size);

  useEffect(() => {
    setFailed(false);
  }, [identifier, finalSize, quality]);

  if (!identifier || failed) {
    return (
      <span
        aria-hidden="true"
        style={{
          width: finalSize,
          height: finalSize,
          minWidth: finalSize,
          borderRadius: 6,
          display: "inline-block",
          background: "rgba(236, 85, 44, 0.14)",
          border: "1px solid rgba(236, 85, 44, 0.35)",
          ...style,
        }}
      />
    );
  }

  const proxyUrl = `${SERVER_ICON_BASE_URL}/${encodeURIComponent(identifier)}?size=${finalSize}${
    Number.isFinite(Number(quality)) ? `&quality=${Number(quality)}` : ""
  }`;

  return (
    <img
      src={proxyUrl}
      alt={alt || identifier}
      title={title || identifier}
      className={className}
      width={finalSize}
      height={finalSize}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      style={{
        width: finalSize,
        height: finalSize,
        minWidth: finalSize,
        borderRadius: 6,
        objectFit: "contain",
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(236, 85, 44, 0.28)",
        ...style,
      }}
    />
  );
}
