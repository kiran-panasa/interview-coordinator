import {
  ResponsiveContainer, BarChart, Bar, Cell, LabelList,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

// Validated against the dataviz skill's colorblind/contrast checks as this
// exact 4-color, fixed-order sequence (node scripts/validate_palette.js) —
// adjacent pairs (Completed/Cancelled, Cancelled/Rescheduled, Rescheduled/
// No-Show) all clear both the CVD and normal-vision floors in light AND
// dark-simulated rendering. Never reorder or swap these per-filter — the
// whole point of a fixed categorical order is that a series' color never
// changes meaning depending on what else is on screen.
export const CATEGORY_COLORS = {
  completed:   "#257de0", // blue
  cancelled:   "#f2a600", // yellow
  rescheduled: "#6a4ce2", // violet
  noShow:      "#ec4647", // red
};
export const CATEGORY_LABELS = {
  completed: "Completed", cancelled: "Cancelled", rescheduled: "Rescheduled", noShow: "No-Show",
};
const CATEGORY_KEYS = ["completed", "cancelled", "rescheduled", "noShow"];

const AXIS_TICK = { fill: "#9ca3af", fontSize: 11, fontWeight: 600 };
const GRID_STROKE = "#eef0f3";

// Values lead, labels follow (dataviz skill's tooltip hierarchy) — the
// number is the strong, high-contrast element, the series name secondary,
// each row keyed with a short stroke of its own color rather than a filled
// box (box-weight ink is a label's job at this density).
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-card px-3 py-2 text-xs">
      <p className="font-semibold text-gray-500 mb-1.5">{label}</p>
      <div className="space-y-1">
        {payload.map(p => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span className="w-3 h-0.5 rounded-full flex-shrink-0" style={{ background: p.color }} />
            <span className="text-gray-500">{CATEGORY_LABELS[p.dataKey] || p.name}</span>
            <span className="font-bold text-gray-900 ml-auto tabular-nums">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Day view — a single snapshot, no time axis at all: "compare magnitude
// across categories" (dataviz skill's form table), not a trend. Only 4 bars
// total, so every one gets a direct value label on top — no reliance on
// hover to read a number that's this easy to just print.
export function DaySnapshotChart({ totals }) {
  const data = CATEGORY_KEYS.map(key => ({ key, label: CATEGORY_LABELS[key], value: totals[key] || 0 }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: "#e5e7eb" }} tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={32} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f9fafb" }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={64}>
          <LabelList dataKey="value" position="top" style={{ fontSize: 12, fontWeight: 700, fill: "#374151" }} />
          {data.map(d => <Cell key={d.key} fill={CATEGORY_COLORS[d.key]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Week/Month trend — "trend over time, tell distinct series apart" ->
// multi-line, categorical color (dataviz skill's form table). A line reads
// cleanly whether there are 7 points (a week) or ~30 (a month per-day),
// where a grouped-bar equivalent would turn into unreadable clutter.
export function SeriesTrendChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid vertical={false} stroke={GRID_STROKE} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: "#e5e7eb" }} tickLine={false}
          interval="preserveStartEnd" minTickGap={16} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={32} />
        {/* Shared crosshair + one tooltip listing every series at that X —
           the dataviz skill's default hover layer for a line chart. */}
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#d1d5db", strokeWidth: 1 }} />
        {/* Legend always present for >=2 series — identity is never
           color-alone. Line-shaped keys (iconType="plainline") mirror the
           mark itself, same rule the tooltip rows follow. */}
        <Legend
          formatter={(value) => <span className="text-xs font-semibold text-gray-600">{CATEGORY_LABELS[value] || value}</span>}
          iconType="plainline" iconSize={14}
        />
        {CATEGORY_KEYS.map(key => (
          <Line key={key} type="monotone" dataKey={key} name={key}
            stroke={CATEGORY_COLORS[key]} strokeWidth={2} dot={{ r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
