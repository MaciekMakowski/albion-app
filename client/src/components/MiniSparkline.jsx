export default function MiniSparkline({ prices = [] }) {
  if (!prices || prices.length < 2) {
    return <div className="mini-sparkline" />;
  }

  const width = 120;
  const height = 40;
  const padding = 2;

  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // Find min and max
  let minPrice = Math.min(...prices);
  let maxPrice = Math.max(...prices);

  if (minPrice === maxPrice) {
    minPrice = minPrice * 0.9 || 0;
    maxPrice = maxPrice * 1.1 || 100;
  } else {
    const range = maxPrice - minPrice;
    minPrice = Math.max(0, minPrice - range * 0.1);
    maxPrice = maxPrice + range * 0.1;
  }

  // Map prices to SVG coordinates
  const points = prices.map((price, i) => {
    const x = padding + (i / (prices.length - 1)) * chartWidth;
    const y =
      padding +
      chartHeight -
      (((price - minPrice) / (maxPrice - minPrice)) * chartHeight || 0);
    return { x, y };
  });

  // Create line path
  let linePath = "";
  if (points.length > 0) {
    linePath =
      `M ${points[0].x} ${points[0].y} ` +
      points
        .slice(1)
        .map((p) => `L ${p.x} ${p.y}`)
        .join(" ");
  }

  // Determine color (green for up, red for down)
  const isUp = prices[prices.length - 1] >= prices[0];
  const lineColor = isUp ? "#34d399" : "#f472b6";
  const areaColor = isUp
    ? "rgba(52, 211, 153, 0.15)"
    : "rgba(244, 114, 182, 0.15)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="mini-sparkline"
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      <defs>
        <linearGradient id="sparkline-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0.05" />
        </linearGradient>
      </defs>

      {/* Area under curve */}
      <path
        d={
          linePath
            ? `${linePath} L ${points[points.length - 1].x} ${
                padding + chartHeight
              } L ${points[0].x} ${padding + chartHeight} Z`
            : ""
        }
        fill="url(#sparkline-grad)"
      />

      {/* Line */}
      <path
        d={linePath}
        stroke={lineColor}
        strokeWidth="1.5"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />

      {/* Start and end points */}
      <circle cx={points[0].x} cy={points[0].y} r="1.5" fill={lineColor} />
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="1.5"
        fill={lineColor}
      />
    </svg>
  );
}
