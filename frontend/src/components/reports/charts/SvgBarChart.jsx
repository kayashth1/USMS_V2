/**
 * Lightweight SVG bar chart — no external dependency.
 * Uses viewBox so it scales to any container width.
 *
 * Props:
 *   data     — array of objects
 *   xKey     — key for x-axis label
 *   yKey     — key for bar value
 *   color    — bar fill color (default indigo)
 *   formatX  — (val) => string  label formatter for x-axis
 *   formatY  — (val) => string  label formatter for y-axis gridlines
 *   height   — rendered height in px (viewBox height stays 200)
 *   horizontal — render horizontal bars (for Outstanding by Class)
 */
export default function SvgBarChart({
  data = [],
  xKey,
  yKey,
  color    = "#6366f1",
  formatX,
  formatY,
  height   = 200,
  horizontal = false,
}) {
  if (!data.length) return null;

  const VW = 600;
  const VH = 200;
  const P  = { top: 16, right: 16, bottom: 36, left: horizontal ? 80 : 52 };
  const CW = VW - P.left - P.right;
  const CH = VH - P.top  - P.bottom;

  const maxVal = Math.max(...data.map(d => d[yKey]), 1);
  const TICKS  = [0, 0.25, 0.5, 0.75, 1];

  if (horizontal) {
    // ── Horizontal bars (class strength / outstanding by class) ──────────────
    const barH  = Math.max(6, Math.floor(CH / data.length) - 4);
    const gap   = CH / data.length;

    return (
      <svg viewBox={`0 0 ${VW} ${VH}`} style={{ height }} className="w-full block" aria-hidden="true">
        {/* vertical gridlines */}
        {TICKS.map(t => {
          const x = P.left + CW * t;
          return (
            <g key={t}>
              <line x1={x} x2={x} y1={P.top} y2={P.top + CH} stroke="#f3f4f6" strokeWidth={1} />
              <text x={x} y={P.top + CH + 14} textAnchor="middle" fontSize={9} fill="#9ca3af">
                {formatY ? formatY(maxVal * t) : Math.round(maxVal * t).toLocaleString("en-IN")}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const val  = d[yKey] ?? 0;
          const barW = (val / maxVal) * CW;
          const y    = P.top + gap * i + (gap - barH) / 2;
          const label = formatX ? formatX(d[xKey]) : d[xKey];
          return (
            <g key={i}>
              <text x={P.left - 6} y={y + barH / 2 + 3.5} textAnchor="end" fontSize={9} fill="#6b7280">
                {label}
              </text>
              <rect x={P.left} y={y} width={barW} height={barH} rx={2} fill={color} fillOpacity={0.82} />
              {val > 0 && (
                <text x={P.left + barW + 4} y={y + barH / 2 + 3.5} fontSize={9} fill="#374151">
                  {formatY ? formatY(val) : val.toLocaleString("en-IN")}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    );
  }

  // ── Vertical bars ────────────────────────────────────────────────────────────
  const barW = Math.max(6, Math.floor(CW / data.length * 0.6));
  const gap  = CW / data.length;

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} style={{ height }} className="w-full block" aria-hidden="true">
      {/* Horizontal gridlines */}
      {TICKS.map(t => {
        const y = P.top + CH * (1 - t);
        return (
          <g key={t}>
            <line x1={P.left} x2={P.left + CW} y1={y} y2={y} stroke="#f3f4f6" strokeWidth={1} />
            <text x={P.left - 4} y={y + 3.5} textAnchor="end" fontSize={9} fill="#9ca3af">
              {formatY ? formatY(maxVal * t) : Math.round(maxVal * t).toLocaleString("en-IN")}
            </text>
          </g>
        );
      })}

      {/* Baseline */}
      <line x1={P.left} x2={P.left + CW} y1={P.top + CH} y2={P.top + CH} stroke="#e5e7eb" strokeWidth={1} />

      {/* Bars */}
      {data.map((d, i) => {
        const val  = d[yKey] ?? 0;
        const barH = (val / maxVal) * CH;
        const x    = P.left + gap * i + (gap - barW) / 2;
        const y    = P.top + CH - barH;
        const label = formatX ? formatX(d[xKey]) : String(d[xKey]);
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={3} fill={color} fillOpacity={0.85} />
            <text x={x + barW / 2} y={P.top + CH + 16} textAnchor="middle" fontSize={9} fill="#6b7280">
              {label.length > 5 ? label.slice(0, 5) + "…" : label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
