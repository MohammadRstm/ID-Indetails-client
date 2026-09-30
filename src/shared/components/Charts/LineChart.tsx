import { useId, useRef, useState } from "react";
import { tip, type TipLine } from "@/shared/components/Overlays/tip";
import { cx } from "@/shared/utils/cx";
import { clamp, fmtCount, niceMax, useWidth } from "./core";

export type LinePoint = { y: number; label?: string; tip?: string };
export type LineSeries = { label: string; points: LinePoint[]; area?: boolean; ghost?: boolean; dash?: boolean; color?: string };

type LineChartProps = {
    series: LineSeries[];
    height?: number;
    format?: (v: number) => string;
    /** Label every nth point along the bottom. */
    tickEvery?: number;
};

/** Lines over time, with an optional filled area; the axis reaches below 0 for losses (the prototype's V.LineChart). */
export default function LineChart({ series, height = 190, format = fmtCount, tickEvery }: LineChartProps) {
    const ref = useRef<HTMLDivElement>(null);
    const w = useWidth(ref, 640);
    const [hover, setHover] = useState(-1);
    const clip = useId().replace(/:/g, "");
    const pts = series[0]?.points ?? [];
    const mL = 46, mR = 12, mT = 14, mB = 24;
    const iw = Math.max(60, w - mL - mR), ih = height - mT - mB;
    const all = series.flatMap((s) => s.points.map((p) => p.y));
    const hiV = Math.max(0, ...all), loV = Math.min(0, ...all);
    const max = hiV > 0 || loV >= 0 ? niceMax(Math.max(1, hiV)) : 0;
    const min = loV < 0 ? -niceMax(-loV) : 0;
    const n = Math.max(1, pts.length - 1);
    const X = (i: number) => mL + (iw * i) / n;
    const Y = (v: number) => mT + ih - ((v - min) / (max - min)) * ih;
    const ticks = min < 0 && max > 0 ? [min, 0, max] : min < 0 ? [min, min / 2, 0] : [0, max / 2, max];
    const path = (s: LineSeries) => s.points.map((p, i) => `${i ? "L" : "M"}${X(i)} ${Y(p.y)}`).join(" ");
    const area = (s: LineSeries) => (s.points.length ? `${path(s)} L${X(s.points.length - 1)} ${Y(0)} L${X(0)} ${Y(0)} Z` : "");

    return (
        <div className="chart-wrap" ref={ref}>
            <svg className="chart" width={w} height={height}>
                {min < 0 && (
                    <defs>
                        <clipPath id={`${clip}-up`}><rect x="0" y="0" width={w} height={Y(0)} /></clipPath>
                        <clipPath id={`${clip}-dn`}><rect x="0" y={Y(0)} width={w} height={height} /></clipPath>
                    </defs>
                )}
                {ticks.map((t, i) => (
                    <g key={i}>
                        <line className={cx("gl", t === 0 && min < 0 && "zero")} x1={mL} y1={Y(t)} x2={mL + iw} y2={Y(t)} />
                        <text x={mL - 8} y={Y(t) + 3.5} textAnchor="end">{format(t)}</text>
                    </g>
                ))}
                {series.map((s, si) => (
                    <g key={si}>
                        {s.area && min < 0 ? (
                            <>
                                <path className="area" d={area(s)} clipPath={`url(#${clip}-up)`} />
                                <path className="area neg" d={area(s)} clipPath={`url(#${clip}-dn)`} />
                            </>
                        ) : s.area ? <path className="area" d={area(s)} /> : null}
                        <path className={cx("ln", s.ghost && "ghost", s.dash && "dash")} d={path(s)} style={s.color ? { stroke: s.color } : undefined} />
                    </g>
                ))}
                {hover >= 0 && <line className="axl" x1={X(hover)} y1={mT} x2={X(hover)} y2={mT + ih} />}
                {hover >= 0 && series.map((s, si) => {
                    const q = s.points[hover];
                    if (!q) return null;
                    return <circle key={si} className="dot-mark" cx={X(hover)} cy={Y(q.y)} r="4"
                        style={s.ghost ? { fill: "var(--ghost)" } : s.color ? { fill: s.color } : undefined} />;
                })}
                {pts.map((q, i) => (tickEvery && i % tickEvery === 0
                    ? <text key={`t${i}`} x={X(i)} y={height - 6} textAnchor="middle">{q.label}</text>
                    : null))}
                <rect className="hit" x={mL} y={mT} width={iw} height={ih}
                    onMouseMove={(e) => {
                        const box = e.currentTarget.getBoundingClientRect();
                        const i = clamp(Math.round(((e.clientX - box.left) / box.width) * n), 0, pts.length - 1);
                        setHover(i);
                        const lines: TipLine[] = [{ big: pts[i]?.tip ?? "" }];
                        series.forEach((s) => { if (s.points[i]) lines.push({ k: s.label, v: format(s.points[i].y) }); });
                        tip.show(e, lines);
                    }}
                    onMouseLeave={() => { setHover(-1); tip.hide(); }} />
            </svg>
            {series.length > 1 && (
                <div className="legend">
                    {series.map((s, i) => (
                        <span key={i}><i className="k" style={{ background: s.ghost ? "var(--ghost)" : s.color || "var(--chart)" }} />{s.label}</span>
                    ))}
                </div>
            )}
        </div>
    );
}
