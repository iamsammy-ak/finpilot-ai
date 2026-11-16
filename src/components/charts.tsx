import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import type { Category } from '../types';
import { CATEGORY_COLOR, NEUTRAL_SERIES } from '../lib/categories';
import { money, pct } from '../lib/format';
import type { CategoryTotal } from '../engine/metrics';

/** Shared, recessive axis and grid styling so every chart reads as one system. */
export const AXIS = {
  tickLine: false,
  axisLine: false,
  tick: { fill: '#76819f', fontSize: 11.5 },
} as const;
export const GRID = { stroke: '#1d2540', vertical: false } as const;
export const CURSOR_BAR = { fill: 'rgba(255,255,255,0.035)' };
export const CURSOR_LINE = { stroke: '#4a5578', strokeWidth: 1 };

/** The subset of a Recharts tooltip entry that we read. Kept loose so it accepts Recharts' own types. */
interface TipItem {
  name?: unknown;
  value?: unknown;
  color?: string;
  payload?: unknown;
}
type Row = Record<string, unknown>;

/** Tooltip body used by every Recharts chart. Values are text-coloured; the swatch carries identity. */
export function Tip({
  active,
  payload,
  label,
  title,
  fmt = money,
  footer,
}: {
  active?: boolean;
  payload?: readonly TipItem[];
  label?: unknown;
  title?: (label: unknown, row?: Row) => string;
  fmt?: (n: number) => string;
  footer?: (row?: Row) => string | null;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as Row | undefined;
  const rows = payload.filter((p) => typeof p.value === 'number');
  if (!rows.length) return null;
  const foot = footer?.(row);
  return (
    <div className="tip">
      <div className="tip-title">{title ? title(label, row) : String(label ?? '')}</div>
      {rows.map((p, i) => (
        <div className="tip-row" key={i}>
          <span>
            <i className="swatch" style={{ background: p.color, display: 'inline-block', marginRight: 7 }} />
            {String(p.name ?? '')}
          </span>
          <b className="num">{fmt(p.value as number)}</b>
        </div>
      ))}
      {foot && <div className="tip-title" style={{ margin: '6px 0 0' }}>{foot}</div>}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; kind?: 'box' | 'line' | 'dash' }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          <i className={i.kind === 'line' ? 'line' : i.kind === 'dash' ? 'dash' : ''} style={{ background: i.color, borderColor: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Spending donut. The seven largest categories keep their own colour; anything
 * beyond that folds into a neutral "Everything else" slice.
 */
export function SpendingDonut({ categories, total }: { categories: CategoryTotal[]; total: number }) {
  const [hot, setHot] = useState<number | null>(null);
  const top = categories.slice(0, 7);
  const rest = categories.slice(7);
  const slices: { name: string; value: number; fill: string; share: number; category?: Category }[] = top.map((c) => ({
    name: c.category,
    value: c.amount,
    fill: CATEGORY_COLOR[c.category],
    share: c.share,
    category: c.category,
  }));
  if (rest.length) {
    slices.push({
      name: `All others (${rest.length})`,
      value: rest.reduce((s, c) => s + c.amount, 0),
      fill: NEUTRAL_SERIES,
      share: rest.reduce((s, c) => s + c.share, 0),
    });
  }
  const active = hot !== null ? slices[hot] : null;
  return (
    <div className="donut-wrap">
      <div className="donut">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={83}
              paddingAngle={slices.length > 1 ? 2 : 0}
              cornerRadius={4}
              stroke="none"
              startAngle={90}
              endAngle={-270}
              onMouseEnter={(_, i) => setHot(i)}
              onMouseLeave={() => setHot(null)}
              isAnimationActive
              animationDuration={700}
            >
              {slices.map((s, i) => (
                <Cell key={s.name} fill={s.fill} opacity={hot === null || hot === i ? 1 : 0.35} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <b className="num">{money(active ? active.value : total)}</b>
          <span>{active ? `${active.name} · ${pct(active.share, 0)}` : 'Total spending'}</span>
        </div>
      </div>
      <div className="donut-legend">
        {slices.map((s, i) => (
          <div
            key={s.name}
            className={`donut-legend-row ${hot === i ? 'hot' : ''}`}
            onMouseEnter={() => setHot(i)}
            onMouseLeave={() => setHot(null)}
          >
            <i className="swatch" style={{ background: s.fill }} />
            <span className="name">{s.name}</span>
            <b className="num">{money(s.value)}</b>
            <span className="muted num right">{pct(s.share, 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Semicircular 0–100 gauge. */
export function HealthGauge({ score }: { score: number }) {
  const r = 88;
  const len = Math.PI * r;
  const frac = Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="gauge" role="img" aria-label={`Financial health score ${score} out of 100`}>
      <svg viewBox="0 0 210 126">
        <defs>
          <linearGradient id="gauge-g" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8b6cff" />
            <stop offset="1" stopColor="#3d8bff" />
          </linearGradient>
        </defs>
        <path d={`M 17 110 A ${r} ${r} 0 0 1 193 110`} fill="none" stroke="#1c2541" strokeWidth="13" strokeLinecap="round" />
        <path
          className="gauge-arc"
          d={`M 17 110 A ${r} ${r} 0 0 1 193 110`}
          fill="none"
          stroke="url(#gauge-g)"
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - frac)}
        />
      </svg>
      <div className="gauge-value">
        <b className="num">{score}</b>
        <span>/ 100</span>
      </div>
    </div>
  );
}
