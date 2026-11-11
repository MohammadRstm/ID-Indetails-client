import { useRef, useState } from "react";
import { tip, type TipLine } from "@/shared/components/Overlays/tip";
import { barPath, clamp, fmtCount, niceMax, useWidth } from "./core";

/** One part every column is split into, in the order they stack from the bottom up. */
export type StackSeries = { label: string; color: string };

export type StackedDatum = {
    label: string;
    /** One value per series, in the series' order. */
    values: number[];
    /** The column's total as it was given, for the axis and the label above it: never added up here. */
    total: number;
    tip?: string;
};

type StackedColumnsProps = {
    series: StackSeries[];
    data: StackedDatum[];
    height?: number;
    format?: (v: number) => string;
    /** Label every nth column (and the last). */
    labelEvery?: number;
    title?: string;
};

/** Where each part of a column is drawn, from the bottom up: its top and its height in pixels. Nothing below 0 is drawn. */
function segmentsOf(values: number[], bottom: number, pixelsPerUnit: number) {
    return values.reduce<{ y: number; h: number }[]>((out, v) => {
        const h = Math.max(0, v) * pixelsPerUnit;
        const below = out.length ? out[out.length - 1].y : bottom;
        return [...out, { y: below - h, h }];
    }, []);
}

/**
 * One measure over time with each column split into its parts, and their legend: spending by category, month by
 * month. Built like Columns, from the same marks and axis.
 */
export default function StackedColumns({ series, data, height = 190, format = fmtCount, labelEvery, title }: StackedColumnsProps) {
    const ref = useRef<HTMLDivElement>(null);
    const w = useWidth(ref, 640);
    const [hover, setHover] = useState(-1);
    const mL = 42, mR = 10, mT = 16, mB = 22;
    const iw = Math.max(60, w - mL - mR), ih = height - mT - mB;
    const max = niceMax(Math.max(1, ...data.map((d) => d.total)));
    const slot = iw / Math.max(1, data.length);
    const barW = Math.min(24, Math.max(3, slot - (slot > 14 ? 6 : 2)));
    const ticks = [0, max / 2, max];

    function onMove(i: number, e: { clientX: number; clientY: number }) {
        setHover(i);
        const d = data[i];
        const lines: TipLine[] = [{ big: d.tip || d.label }];
        series.forEach((s, j) => {
            if (d.values[j]) lines.push({ k: s.label, v: format(d.values[j]) });
        });
        lines.push({ k: "Total", v: format(d.total) });
        tip.show(e, lines);
    }
    const leave = () => { setHover(-1); tip.hide(); };
    const labelIndex = hover >= 0 ? hover : data.length - 1;

    return (
        <div className="chart-wrap" ref={ref}>
            <svg className="chart" width={w} height={height} role="img" aria-label={title || `Stacked columns: ${series.map((s) => s.label).join(", ")}`}>
                {ticks.map((t, i) => {
                    const y = mT + ih - (t / max) * ih;
                    return (
                        <g key={i}>
                            <line className="gl" x1={mL} y1={y} x2={mL + iw} y2={y} />
                            <text x={mL - 8} y={y + 3.5} textAnchor="end">{format(t)}</text>
                        </g>
                    );
                })}
                {data.map((d, i) => {
                    const x = mL + slot * i + slot / 2 - barW / 2;
                    const parts = segmentsOf(d.values, mT + ih, ih / max);
                    const top = parts.findLastIndex((p) => p.h > 0);
                    return (
                        <g key={i} style={hover === i ? { opacity: 0.82 } : undefined}>
                            {parts.map((p, j) => p.h > 0 && (
                                <path key={j} className="mark" style={{ fill: series[j]?.color }} d={barPath(x, p.y, barW, p.h, j === top ? 3 : 0)} />
                            ))}
                        </g>
                    );
                })}
                {data.map((d, i) => {
                    if (!d.label || (labelEvery && i % labelEvery !== 0 && i !== data.length - 1)) return null;
                    return <text key={`l${i}`} x={mL + slot * i + slot / 2} y={height - 6} textAnchor="middle">{d.label}</text>;
                })}
                {labelIndex >= 0 && data[labelIndex]?.total ? (
                    <text className="lbl" textAnchor="middle"
                        x={clamp(mL + slot * labelIndex + slot / 2, mL + 14, mL + iw - 14)}
                        y={Math.max(mT - 4, mT + ih - (data[labelIndex].total / max) * ih - 6)}>
                        {format(data[labelIndex].total)}
                    </text>
                ) : null}
                {data.map((_, i) => (
                    <rect key={`h${i}`} className="hit" x={mL + slot * i} y={mT} width={slot} height={ih} tabIndex={0}
                        onMouseMove={(e) => onMove(i, e)} onMouseLeave={leave}
                        onFocus={(e) => { const r = e.currentTarget.getBoundingClientRect(); onMove(i, { clientX: r.left + 20, clientY: r.top + 30 }); }}
                        onBlur={leave} />
                ))}
            </svg>
            <div className="legend" style={{ marginTop: 2 }}>
                {series.map((s) => <span key={s.label}><i style={{ background: s.color }} />{s.label}</span>)}
            </div>
        </div>
    );
}
