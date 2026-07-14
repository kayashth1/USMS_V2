/**
 * Lightweight SVG donut chart — no external dependency.
 * Uses stroke-dasharray on concentric circles.
 *
 * Props:
 *   segments — [{ label, value, color }]
 *   size     — rendered size in px (default 130)
 */
export default function SvgDonutChart({ segments = [], size = 130 }) {
  const total = segments.reduce((s, d) => s + (d.value ?? 0), 0);
  if (!total) return null;

  const R    = 38;
  const CIRC = 2 * Math.PI * R;

  // Compute dasharray + dashoffset for each segment
  // Start at 12 o'clock = offset of CIRC * 0.25 from the default 3 o'clock
  let cumDash = 0;
  const arcs = segments.map(seg => {
    const frac   = seg.value / total;
    const dash   = frac * CIRC;
    const offset = ((CIRC * 0.25 - cumDash) % CIRC + CIRC) % CIRC;
    cumDash += dash;
    return { ...seg, dash, offset };
  });

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className="shrink-0"
        aria-hidden="true"
      >
        {/* Background track */}
        <circle cx="50" cy="50" r={R} fill="none" stroke="#f3f4f6" strokeWidth="15" />

        {/* Segments */}
        {arcs.map((arc, i) =>
          arc.value > 0 ? (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={arc.color}
              strokeWidth="15"
              strokeDasharray={`${arc.dash.toFixed(3)} ${(CIRC - arc.dash).toFixed(3)}`}
              strokeDashoffset={arc.offset.toFixed(3)}
            />
          ) : null
        )}

        {/* Centre label */}
        <text x="50" y="46" textAnchor="middle" fontSize="17" fontWeight="700" fill="#111827">
          {total}
        </text>
        <text x="50" y="58" textAnchor="middle" fontSize="7" fill="#9ca3af" letterSpacing="0.5">
          TOTAL
        </text>
      </svg>

      {/* Legend */}
      <div className="space-y-1.5 min-w-0">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2 text-sm min-w-0">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: seg.color }}
            />
            <span className="text-gray-600 truncate">{seg.label}</span>
            <span className="font-semibold text-gray-900 ml-auto pl-3 tabular-nums">{seg.value}</span>
            <span className="text-gray-400 text-xs tabular-nums">
              ({total > 0 ? Math.round(seg.value / total * 100) : 0}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
