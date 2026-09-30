import { useRef, useState } from "react";
import { tip } from "@/shared/components/Overlays/tip";
import { money } from "@/shared/format/money";
import { cx } from "@/shared/utils/cx";
import { useWidth } from "./core";

export type WaterfallStep = { label: string; value: number; kind: "start" | "cost" | "result"; sub?: string };

type WaterfallBar = { a: number; b: number; s: WaterfallStep; cost: boolean; result: boolean };

/** Each step as a bar from a to b: a start, costs stepping down from it, and the result. */
function barsOf(steps: WaterfallStep[]): WaterfallBar[] {
    const bars: WaterfallBar[] = [];
    let running = 0;
    for (const s of steps) {
        if (s.kind === "start") {
            running = s.value;
            bars.push({ a: 0, b: s.value, s, cost: false, result: false });
        } else if (s.kind === "result") {
            bars.push({ a: 0, b: running, s, cost: false, result: true });
        } else {
            bars.push({ a: running - s.value, b: running, s, cost: true, result: false });
            running -= s.value;
        }
    }
    return bars;
}

/** Revenue, then each cost taken away, then what's left (the prototype's V.Waterfall). */
export default function Waterfall({ steps, height = 210, format = (v: number) => money.short(v) }: { steps: WaterfallStep[]; height?: number; format?: (v: number) => string }) {
    const ref = useRef<HTMLDivElement>(null);
    const w = useWidth(ref, 540);
    const [hover, setHover] = useState(-1);
    const mL = 6, mR = 6, mT = 24, mB = 36;
    const iw = Math.max(80, w - mL - mR), ih = height - mT - mB;

    const bars = barsOf(steps);
    const values = [0, ...bars.flatMap((b) => [b.a, b.b])];
    const hi = Math.max(...values), lo = Math.min(...values);
    const span = hi - lo || 1;
    const Y = (v: number) => mT + ih - ((v - lo) / span) * ih;
    const slot = iw / Math.max(1, bars.length);
    const bw = Math.min(56, slot * 0.56);

    return (
        <div className="chart-wrap" ref={ref}>
            <svg className="chart wf" width={w} height={height} role="img" aria-label="profit waterfall">
                <line className="axl" x1={mL} y1={Y(0)} x2={mL + iw} y2={Y(0)} />
                {bars.map((b, i) => {
                    const x = mL + slot * i + (slot - bw) / 2;
                    const top = Math.min(Y(b.a), Y(b.b)), h = Math.max(2, Math.abs(Y(b.a) - Y(b.b)));
                    const cls = b.result ? (b.b >= 0 ? "wf-pos" : "wf-neg") : b.cost ? "wf-cost" : "wf-rev";
                    const link = b.result ? null : Y(b.cost ? b.a : b.b);
                    const shown = Math.abs(b.result ? b.b : b.s.value);
                    return (
                        <g key={i}>
                            {link != null && bars[i + 1] && <line className="wf-link" x1={x + bw} y1={link} x2={mL + slot * (i + 1) + (slot - bw) / 2} y2={link} />}
                            <rect className={cx(cls, hover === i && "hl")} x={x} y={top} width={bw} height={h} rx="3" />
                            <text className={cx("lbl", b.result && (b.b < 0 ? "down" : "up"))} x={x + bw / 2} y={top - 6} textAnchor="middle">
                                {(b.cost || (b.result && b.b < 0) ? "−" : "") + format(shown)}
                            </text>
                            <text x={x + bw / 2} y={height - 20} textAnchor="middle">{b.s.label}</text>
                            {b.s.sub && <text x={x + bw / 2} y={height - 8} textAnchor="middle" style={{ fontSize: 9.5 }}>{b.s.sub}</text>}
                            <rect className="hit" x={mL + slot * i} y={mT} width={slot} height={ih}
                                onMouseMove={(e) => {
                                    setHover(i);
                                    tip.show(e, [{ big: b.s.label }, { k: b.cost ? "Cost" : b.result ? "Result" : "Amount", v: money.fmt(b.result ? b.b : b.cost ? -b.s.value : b.s.value) }]);
                                }}
                                onMouseLeave={() => { setHover(-1); tip.hide(); }} />
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}
