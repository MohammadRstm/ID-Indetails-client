import type { ReactNode } from "react";
import { tip } from "@/shared/components/Overlays/tip";
import { Money } from "@/shared/components/Data/Money";
import { money } from "@/shared/format/money";
import { fmtH, pct } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { clickable } from "@/shared/utils/clickable";

export type RankItem = { id?: string | number; label: string; value: number; node?: ReactNode };

/** Ranked horizontal bars: hours by project, revenue by client (the prototype's V.RankBars). */
export function RankBars({ items, format = fmtH, unit = "Hours", showPct, onClick, empty = "No data in this range." }: {
    items: RankItem[];
    format?: (v: number) => string;
    unit?: string;
    showPct?: boolean;
    onClick?: (item: RankItem) => void;
    empty?: string;
}) {
    const max = Math.max(1, ...items.map((i) => i.value));
    const total = items.reduce((t, i) => t + i.value, 0);
    return (
        <div>
            {items.map((it, i) => (
                <div key={it.id ?? i} className={cx("rb", onClick && "click")} {...clickable(onClick ? () => onClick(it) : undefined, "button")}
                    onMouseMove={(e) => tip.show(e, [{ big: it.label }, { k: unit, v: format(it.value) }, total ? { k: "Share", v: `${pct(it.value, total)}%` } : null])}
                    onMouseLeave={tip.hide}>
                    <div className="rb-lab trunc">{it.node ?? <span className="trunc">{it.label}</span>}</div>
                    <div className="rb-bar"><i style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }} /></div>
                    <div className="rb-val">{format(it.value)}</div>
                    {showPct && <div className="rb-pct muted">{pct(it.value, total)}%</div>}
                </div>
            ))}
            {items.length === 0 && <p className="muted" style={{ padding: "10px 0" }}>{empty}</p>}
        </div>
    );
}

export type ProfitItem = { id?: string | number; label: string; value: number; node?: ReactNode; note?: string };

/** Diverging bars: profit to the right, losses to the left (the prototype's V.ProfitBars). */
export function ProfitBars({ items, unit, onClick }: { items: ProfitItem[]; unit?: string; onClick?: (item: ProfitItem) => void }) {
    const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
    return (
        <div>
            {items.map((it, i) => {
                const pos = it.value >= 0;
                const width = (Math.abs(it.value) / max) * 50;
                return (
                    <div key={it.id ?? i} className={cx("pb", onClick && "click")} {...clickable(onClick ? () => onClick(it) : undefined, "button")}
                        onMouseMove={(e) => tip.show(e, [{ big: it.label }, { k: unit || (pos ? "Profit" : "Loss"), v: money.fmt(it.value) }, it.note])}
                        onMouseLeave={tip.hide}>
                        <div className="pb-lab trunc">{it.node ?? it.label}</div>
                        <div className="pb-track">
                            <div className="pb-zero" />
                            <div className={cx("pb-fill", pos ? "pos" : "neg")} style={pos ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }} />
                        </div>
                        <div className={cx("pb-val mono", pos ? "up" : "down")}><Money short value={it.value} /></div>
                    </div>
                );
            })}
            {items.length === 0 && <p className="muted" style={{ padding: "10px 0" }}>Nothing in this range.</p>}
        </div>
    );
}

export type Segment = { label: string; value: number; color: string };

/** A distribution strip with its legend: projects by status (the prototype's V.StatusBar). */
export function StatusBar({ segments, unit = "Projects" }: { segments: Segment[]; unit?: string }) {
    const segs = segments.filter((s) => s.value > 0);
    const total = segs.reduce((t, s) => t + s.value, 0) || 1;
    return (
        <div>
            <div style={{ display: "flex", gap: 2, height: 10 }}>
                {segs.map((s, i) => (
                    <div key={i} style={{ width: `${(s.value / total) * 100}%`, background: s.color, borderRadius: 3 }}
                        onMouseMove={(e) => tip.show(e, [{ big: s.label }, { k: unit, v: s.value }])} onMouseLeave={tip.hide} />
                ))}
            </div>
            <div className="legend mt-s">
                {segs.map((s, i) => <span key={i}><i style={{ background: s.color }} />{s.label} <b className="num">{s.value}</b></span>)}
            </div>
        </div>
    );
}

/** One stacked bar of what something is made of: labour, expenses (the prototype's V.CompositionBar). */
export function CompositionBar({ parts, height = 14 }: { parts: Segment[]; height?: number }) {
    const shown = parts.filter((p) => p.value > 0);
    const total = shown.reduce((t, p) => t + p.value, 0) || 1;
    return (
        <div>
            <div style={{ display: "flex", gap: 2, height }}>
                {shown.map((s, i) => (
                    <div key={i} style={{ width: `${(s.value / total) * 100}%`, background: s.color, borderRadius: 3 }}
                        onMouseMove={(e) => tip.show(e, [{ big: s.label }, { k: "Amount", v: money.fmt(s.value) }, { k: "Share", v: `${Math.round((s.value / total) * 100)}%` }])}
                        onMouseLeave={tip.hide} />
                ))}
            </div>
            <div className="legend mt-s">
                {shown.map((s, i) => (
                    <span key={i}>
                        <i style={{ background: s.color }} />{s.label} <b className="num">{Math.round((s.value / total) * 100)}%</b>{" "}
                        <span className="muted"><Money short value={s.value} /></span>
                    </span>
                ))}
            </div>
        </div>
    );
}

/** Tiny bars for a row's recent weeks (the prototype's V.Spark). */
export function Spark({ values, width = 78, height = 20, dim }: { values: number[]; width?: number; height?: number; dim?: boolean }) {
    const max = Math.max(1, ...values);
    const slot = width / Math.max(1, values.length);
    const bw = Math.max(1.5, slot - 1.5);
    return (
        <svg className="chart" width={width} height={height} aria-hidden="true">
            {values.map((v, i) => {
                const bh = v > 0 ? Math.max(1.5, (v / max) * height) : 0;
                return <rect key={i} className={cx("mark", dim && "ghost")} x={i * slot} y={height - bh} width={bw} height={bh} rx="1" />;
            })}
        </svg>
    );
}

/** +12.4% vs previous, green when it's good news (the prototype's V.Delta). */
export function Delta({ value, prev, inverse, label = "vs previous" }: { value: number; prev: number | null | undefined; inverse?: boolean; label?: string }) {
    if (prev == null || prev === 0) return <span className="muted">no comparison</span>;
    const change = ((value - prev) / prev) * 100;
    const up = change >= 0;
    const good = inverse ? !up : up;
    return (
        <span className={cx("kpi-delta", good ? "up" : "down")}>
            <Icon name={up ? "trendUp" : "trendDown"} />
            {(up ? "+" : "") + change.toFixed(1)}% <span className="muted">{label}</span>
        </span>
    );
}
