import { useRef, useState } from "react";
import { tip, type TipLine } from "@/shared/components/Overlays/tip";
import { cx } from "@/shared/utils/cx";
import { barPath, clamp, fmtCount, niceMax, useWidth } from "./core";

export type ColumnDatum = {
    label: string;
    value: number;
    /** A comparison value drawn beside it (previous period). */
    ghost?: number;
    tip?: string;
    note?: string;
    muted?: boolean;
};

type ColumnsProps = {
    data: ColumnDatum[];
    height?: number;
    seriesLabel?: string;
    ghostLabel?: string;
    format?: (v: number) => string;
    /** Label every nth column (and the last). */
    labelEvery?: number;
    /** false hides the value above the last column. */
    labelLast?: boolean;
    maxBar?: number;
    axisLabels?: boolean;
    title?: string;
};

/** One measure over time, with an optional comparison series (the prototype's V.Columns). */
export default function Columns({
    data, height = 170, seriesLabel, ghostLabel, format = fmtCount, labelEvery, labelLast = true, maxBar = 24, axisLabels = true, title,
}: ColumnsProps) {
    const ref = useRef<HTMLDivElement>(null);
    const w = useWidth(ref, 640);
    const [hover, setHover] = useState(-1);
    const mL = axisLabels ? 42 : 6, mR = 10, mT = 16, mB = 22;
    const iw = Math.max(60, w - mL - mR), ih = height - mT - mB;
    const hasGhost = data.some((d) => d.ghost != null);
    const max = niceMax(Math.max(1, ...data.map((d) => Math.max(d.value || 0, d.ghost || 0))));
    const slot = iw / Math.max(1, data.length);
    const barW = Math.min(maxBar, Math.max(3, slot - (slot > 14 ? 6 : 2)));
    const pairW = hasGhost ? Math.min(11, Math.max(3, slot / 2 - 2.5)) : barW;
    const ticks = max > 3 ? [0, max / 2, max] : [0, max * 0.5, max];

    function onMove(i: number, e: { clientX: number; clientY: number }) {
        setHover(i);
        const d = data[i];
        const lines: TipLine[] = [{ big: d.tip || d.label }, { k: seriesLabel || "Hours", v: format(d.value) }];
        if (hasGhost) lines.push({ k: ghostLabel || "Previous", v: format(d.ghost || 0) });
        if (d.note) lines.push(d.note);
        tip.show(e, lines);
    }
    const leave = () => { setHover(-1); tip.hide(); };
    const labelIndex = hover >= 0 ? hover : labelLast ? data.length - 1 : -1;

    return (
        <div className="chart-wrap" ref={ref}>
            <svg className="chart" width={w} height={height} role="img" aria-label={title || "chart"}>
                {ticks.map((t, i) => {
                    const y = mT + ih - (t / max) * ih;
                    return (
                        <g key={i}>
                            <line className="gl" x1={mL} y1={y} x2={mL + iw} y2={y} />
                            {axisLabels && <text x={mL - 8} y={y + 3.5} textAnchor="end">{format(t)}</text>}
                        </g>
                    );
                })}
                {data.map((d, i) => {
                    const cxx = mL + slot * i + slot / 2;
                    const h = Math.max(d.value > 0 ? 1.5 : 0, (d.value / max) * ih);
                    const gh = hasGhost ? Math.max((d.ghost ?? 0) > 0 ? 1.5 : 0, ((d.ghost || 0) / max) * ih) : 0;
                    const x = hasGhost ? cxx - pairW - 1 : cxx - barW / 2;
                    return (
                        <g key={i}>
                            {hasGhost && <path className="mark ghost" d={barPath(x, mT + ih - gh, pairW, gh, 3)} />}
                            <path className={cx("mark", hover === i && "hl", d.muted && "ghost")}
                                d={barPath(hasGhost ? cxx + 1 : x, mT + ih - h, hasGhost ? pairW : barW, h, 4)} />
                        </g>
                    );
                })}
                {data.map((d, i) => {
                    if (!d.label || (labelEvery && i % labelEvery !== 0 && i !== data.length - 1)) return null;
                    return <text key={`l${i}`} x={mL + slot * i + slot / 2} y={height - 6} textAnchor="middle">{d.label}</text>;
                })}
                {labelIndex >= 0 && data[labelIndex]?.value ? (
                    <text className="lbl" textAnchor="middle"
                        x={clamp(mL + slot * labelIndex + slot / 2, mL + 14, mL + iw - 14)}
                        y={Math.max(mT - 4, mT + ih - (data[labelIndex].value / max) * ih - 6)}>
                        {format(data[labelIndex].value)}
                    </text>
                ) : null}
                {data.map((_, i) => (
                    <rect key={`h${i}`} className="hit" x={mL + slot * i} y={mT} width={slot} height={ih} tabIndex={0}
                        onMouseMove={(e) => onMove(i, e)} onMouseLeave={leave}
                        onFocus={(e) => { const r = e.currentTarget.getBoundingClientRect(); onMove(i, { clientX: r.left + 20, clientY: r.top + 30 }); }}
                        onBlur={leave} />
                ))}
            </svg>
            {hasGhost && (
                <div className="legend" style={{ marginTop: 2 }}>
                    <span><i style={{ background: "var(--chart)" }} />{seriesLabel || "This period"}</span>
                    <span><i style={{ background: "var(--ghost)" }} />{ghostLabel || "Previous period"}</span>
                </div>
            )}
        </div>
    );
}
