import { useRef, useState } from "react";
import { getUiText } from "../features/recipeSimulator/translations";

function formatPrice(value) {
  return value > 0 ? Math.round(value).toLocaleString() : "—";
}

export default function PriceHistoryChart({
  data,
  days,
  language,
  timeScale = 24,
  series,
  showLegend = false,
}) {
  const svgRef = useRef(null);
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [hoveredSeriesIdx, setHoveredSeriesIdx] = useState(null);

  const baseSeries =
    Array.isArray(series) && series.length > 0
      ? series.map((entry) => ({
          label: entry.label || entry.city || "Series",
          color: entry.color || "#f7b84b",
          data: entry.data || [],
        }))
      : [{ label: "Series", color: "#f7b84b", data: data || [] }];

  let referenceDate = new Date();
  const allSeriesData = baseSeries.flatMap((entry) => entry.data || []);
  if (allSeriesData.length > 0) {
    const timestamps = allSeriesData
      .map((d) => (d.timestamp ? new Date(d.timestamp).getTime() : 0))
      .filter(Boolean);
    if (timestamps.length > 0) {
      referenceDate = new Date(Math.max(...timestamps));
    }
  }

  const limitDate = new Date(referenceDate);
  const hoursToKeep = Math.max(1, days * 24);
  limitDate.setHours(limitDate.getHours() - hoursToKeep);

  const preparedSeries = baseSeries
    .map((entry) => {
      const filteredData = (entry.data || [])
        .filter(
          (item) => item.timestamp && new Date(item.timestamp) >= limitDate,
        )
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      return { ...entry, filteredData };
    })
    .filter((entry) => entry.filteredData.length > 0);

  if (preparedSeries.length === 0) {
    return (
      <div className="fantasy-chart-empty">
        <p>{getUiText("noHistoryData", language)}</p>
      </div>
    );
  }

  // 2. Chart Layout Params (viewBox = 0 0 600 250)
  const width = 600;
  const height = 250;
  const paddingLeft = 70;
  const paddingRight = 20;
  const paddingTop = 30;
  const paddingBottom = 40;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // 3. Min, Max, and Avg values for scaling
  const allPrices = preparedSeries.flatMap((entry) =>
    entry.filteredData.map((d) => d.avg_price || 0),
  );
  let minPrice = Math.min(...allPrices);
  let maxPrice = Math.max(...allPrices);

  // Pad min and max so the chart lines are not cut off at borders
  if (minPrice === maxPrice) {
    minPrice = minPrice * 0.9 || 0;
    maxPrice = maxPrice * 1.1 || 100;
  } else {
    const range = maxPrice - minPrice;
    minPrice = Math.max(0, minPrice - range * 0.1);
    maxPrice = maxPrice + range * 0.1;
  }

  const avgPrice = Math.round(
    allPrices.reduce((sum, p) => sum + p, 0) / allPrices.length,
  );

  // 4. Map data points to SVG coordinates
  const allPointTimes = preparedSeries.flatMap((entry) =>
    entry.filteredData
      .map((d) => (d.timestamp ? new Date(d.timestamp).getTime() : null))
      .filter((value) => value !== null),
  );
  const timeRange =
    allPointTimes.length > 1
      ? Math.max(...allPointTimes) - Math.min(...allPointTimes)
      : 1;
  const timeStart = allPointTimes.length > 0 ? Math.min(...allPointTimes) : 0;

  const seriesPoints = preparedSeries.map((entry) => {
    const points = entry.filteredData.map((d) => {
      const timestamp = d.timestamp ? new Date(d.timestamp).getTime() : null;
      const x =
        paddingLeft +
        (timestamp !== null && allPointTimes.length > 1
          ? ((timestamp - timeStart) / timeRange) * chartWidth
          : chartWidth / 2);
      const y =
        paddingTop +
        chartHeight -
        (((d.avg_price || 0) - minPrice) / (maxPrice - minPrice)) * chartHeight;
      return { x, y, ...d };
    });

    let linePath = "";
    let areaPath = "";

    if (points.length > 0) {
      linePath =
        `M ${points[0].x} ${points[0].y} ` +
        points
          .slice(1)
          .map((p) => `L ${p.x} ${p.y}`)
          .join(" ");

      areaPath =
        `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartHeight} ` +
        `L ${points[0].x} ${paddingTop + chartHeight} Z`;
    }

    return { ...entry, points, linePath, areaPath };
  });

  // Calculate Average line Y position
  const avgY =
    paddingTop +
    chartHeight -
    ((avgPrice - minPrice) / (maxPrice - minPrice)) * chartHeight;

  // 6. Handle interactions
  const handleMouseMove = (e) => {
    if (!svgRef.current || seriesPoints.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const svgX = (mouseX / rect.width) * width;

    let closestSeriesIdx = 0;
    let closestPointIdx = 0;
    let minDiff = Infinity;

    seriesPoints.forEach((seriesEntry, seriesIdx) => {
      seriesEntry.points.forEach((p, pointIdx) => {
        const diff = Math.abs(p.x - svgX);
        if (diff < minDiff) {
          minDiff = diff;
          closestSeriesIdx = seriesIdx;
          closestPointIdx = pointIdx;
        }
      });
    });

    setHoveredIdx(closestPointIdx);
    setHoveredSeriesIdx(closestSeriesIdx);
  };

  const handleMouseLeave = () => {
    setHoveredIdx(null);
    setHoveredSeriesIdx(null);
  };

  const hoveredSeries =
    hoveredSeriesIdx !== null ? seriesPoints[hoveredSeriesIdx] : null;
  const hoveredPoint = hoveredSeries ? hoveredSeries.points[hoveredIdx] : null;

  const isHourly = timeScale <= 1;

  // Format tick labels
  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    if (isHourly) {
      return d.toLocaleTimeString(language, {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return d.toLocaleDateString(language, { month: "short", day: "numeric" });
  };

  const formatTooltipDate = (dateStr) => {
    const d = new Date(dateStr);
    if (isHourly) {
      return d.toLocaleString(language, {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return d.toLocaleDateString(language, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Generate X-axis ticks (e.g. 4 ticks)
  const xTicksIndices = [];
  const samplePoints = seriesPoints[0]?.points || [];
  if (samplePoints.length >= 2) {
    const step = Math.floor((samplePoints.length - 1) / 3) || 1;
    for (let i = 0; i < samplePoints.length; i += step) {
      xTicksIndices.push(i);
    }
    if (xTicksIndices[xTicksIndices.length - 1] !== samplePoints.length - 1) {
      xTicksIndices[xTicksIndices.length - 1] = samplePoints.length - 1;
    }
  } else if (samplePoints.length === 1) {
    xTicksIndices.push(0);
  }

  // Y-axis ticks (min, avg, max)
  const yTicks = [
    { value: minPrice, label: formatPrice(minPrice) },
    { value: avgPrice, label: formatPrice(avgPrice) },
    { value: maxPrice, label: formatPrice(maxPrice) },
  ];

  return (
    <div className="fantasy-chart-container" style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="fantasy-chart-svg"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          {/* Glow filter */}
          <filter id="chart-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Area gradient */}
          <linearGradient id="chart-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f7b84b" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#f7b84b" stopOpacity="0.0" />
          </linearGradient>

          {/* Average Line Dash */}
          <linearGradient id="avg-line-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(247, 184, 75, 0.15)" />
            <stop offset="50%" stopColor="rgba(247, 184, 75, 0.45)" />
            <stop offset="100%" stopColor="rgba(247, 184, 75, 0.15)" />
          </linearGradient>
        </defs>

        {/* Y Axis Grid Lines */}
        {yTicks.map((tick, i) => {
          const y =
            paddingTop +
            chartHeight -
            ((tick.value - minPrice) / (maxPrice - minPrice)) * chartHeight;
          return (
            <g key={i} className="chart-grid-line">
              <line
                x1={paddingLeft}
                y1={y}
                x2={width - paddingRight}
                y2={y}
                stroke="rgba(247, 184, 75, 0.1)"
                strokeDasharray={tick.value === avgPrice ? "4 4" : "0"}
              />
              <text
                x={paddingLeft - 10}
                y={y + 4}
                textAnchor="end"
                className="chart-axis-text"
                fill="rgba(247, 184, 75, 0.6)"
                fontSize="10px"
              >
                {tick.label}
              </text>
            </g>
          );
        })}

        {/* Average Price Line Label */}
        {seriesPoints.length > 0 && (
          <text
            x={width - paddingRight}
            y={avgY - 6}
            textAnchor="end"
            className="chart-avg-label"
            fill="rgba(247, 184, 75, 0.5)"
            fontSize="9px"
            letterSpacing="0.5px"
          >
            {getUiText("avgPrice", language)}: {formatPrice(avgPrice)}
          </text>
        )}

        {/* X Axis Labels */}
        {xTicksIndices.map((idx) => {
          const p = samplePoints[idx];
          if (!p) return null;
          return (
            <text
              key={idx}
              x={p.x}
              y={height - paddingBottom + 20}
              textAnchor="middle"
              className="chart-axis-text"
              fill="rgba(247, 184, 75, 0.6)"
              fontSize="10px"
            >
              {formatDate(p.timestamp)}
            </text>
          );
        })}

        {/* Chart Line & Area */}
        {seriesPoints.length > 0 && (
          <>
            {seriesPoints.map((entry) => (
              <g key={entry.label}>
                <path
                  d={entry.areaPath}
                  fill={entry.color + "22"}
                  pointerEvents="none"
                />
                <path
                  d={entry.linePath}
                  fill="none"
                  stroke={entry.color}
                  strokeWidth="2"
                  filter="url(#chart-glow)"
                  pointerEvents="none"
                />
              </g>
            ))}
          </>
        )}

        {/* Hover elements */}
        {hoveredPoint && hoveredSeries && (
          <g>
            <line
              x1={hoveredPoint.x}
              y1={paddingTop}
              x2={hoveredPoint.x}
              y2={paddingTop + chartHeight}
              stroke={hoveredSeries.color}
              strokeOpacity="0.4"
              strokeDasharray="2 2"
              pointerEvents="none"
            />
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.y}
              r="6"
              fill={hoveredSeries.color + "33"}
              stroke={hoveredSeries.color}
              strokeWidth="1.5"
              pointerEvents="none"
            />
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.y}
              r="3.5"
              fill="#ffe7a8"
              pointerEvents="none"
            />
          </g>
        )}
      </svg>

      {/* Floating Tooltip */}
      {hoveredPoint && hoveredSeries && (
        <div
          className="fantasy-chart-tooltip"
          style={{
            position: "absolute",
            left: `${((hoveredPoint.x - paddingLeft) / chartWidth) * 75 + 10}%`,
            top: "10px",
            pointerEvents: "none",
            zIndex: 10,
            background: "rgba(18, 12, 8, 0.95)",
            border: `1px solid ${hoveredSeries.color}`,
            boxShadow: "0 4px 15px rgba(0, 0, 0, 0.6)",
            padding: "8px 12px",
            borderRadius: "8px",
            fontSize: "12px",
            color: "#f7e4b1",
            transition: "left 0.1s ease, top 0.1s ease",
          }}
        >
          <div
            className="tooltip-date"
            style={{
              fontWeight: "bold",
              marginBottom: "4px",
              color: "#ffe7a8",
            }}
          >
            {hoveredSeries.label}
          </div>
          <div
            className="tooltip-date"
            style={{
              fontWeight: "bold",
              marginBottom: "4px",
              color: "#ffe7a8",
            }}
          >
            {formatTooltipDate(hoveredPoint.timestamp)}
          </div>
          <div
            className="tooltip-row"
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
            }}
          >
            <span>💰 {getUiText("price", language)}:</span>
            <span style={{ color: "#fff", fontWeight: "bold" }}>
              {formatPrice(hoveredPoint.avg_price)}
            </span>
          </div>
          <div
            className="tooltip-row"
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
              marginTop: "2px",
            }}
          >
            <span>📦 {getUiText("volume", language)}:</span>
            <span style={{ color: "#fff", fontWeight: "bold" }}>
              {(hoveredPoint.item_count || 0).toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {showLegend && preparedSeries.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            marginTop: "8px",
          }}
        >
          {preparedSeries.map((entry) => (
            <div
              key={entry.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "11px",
                color: "#e7cf8d",
              }}
            >
              <span
                style={{
                  width: "10px",
                  height: "3px",
                  borderRadius: "2px",
                  background: entry.color,
                  display: "inline-block",
                }}
              />
              <span>{entry.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
