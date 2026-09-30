import { useRef, type MouseEvent } from "react";
import { useWidth } from "@/shared/components/Charts/core";
import { tip } from "@/shared/components/Overlays/tip";
import { addMonths, dayKey, MONTHS, monthKey, partsOf, startOfWeek } from "@/shared/format/time";
import { cx } from "@/shared/utils/cx";
import { clamp, dayStart, progressAt, progressCurve, roundMin, statusAt, type History } from "./history";
import { fmtMoment, STATUS_WORD } from "./words";

type RailProps = {
    history: History;
    from: number;
    to: number;
    /** The chosen moment. */
    at: number | null;
    /** The history list's window, shaded. */
    window: { from: number; to: number } | null;
    onPick: (t: number) => void;
};

/** Progress and status across the project's life, with the hours logged each week (the prototype's V.ProgressRail). */
export default function ProgressRail({ history: h, from, to, at, window: win, onPick }: RailProps) {
    const ref = useRef<HTMLDivElement>(null);
    const w = useWidth(ref, 760);
    const span = Math.max(60_000, to - from);
    const mL = 34, mR = 12, top = 10, plotH = 92, ribY = top + plotH + 12, ribH = 9, H = ribY + ribH + 22;
    const iw = Math.max(80, w - mL - mR);
    const X = (d: number) => mL + clamp((d - from) / span, 0, 1) * iw;
    const Y = (v: number) => top + plotH - (v / 100) * plotH;

    const weeks = new Map<string, number>();
    for (const d of h.days) {
        const k = startOfWeek(d.key);
        weeks.set(k, (weeks.get(k) ?? 0) + d.minutes);
    }
    const maxW = Math.max(1, ...weeks.values());
    const bw = Math.max(1.5, ((7 * 86_400_000) / span) * iw - 1);

    const curve = progressCurve(h);
    let path = curve.map((c, i) => `${i ? "L" : "M"}${X(c.at).toFixed(1)} ${Y(c.value).toFixed(1)}`).join("");
    if (curve.length) path += `L${X(to).toFixed(1)} ${Y(curve[curve.length - 1].value).toFixed(1)}`;

    const months: number[] = [];
    for (let m = monthKey(from); dayStart(`${m}-01`) <= to; m = addMonths(m, 1)) months.push(dayStart(`${m}-01`));
    const every = Math.max(1, Math.ceil(months.length / Math.max(2, Math.floor(iw / 70))));
    const ticks = months.filter((d, i) => d >= from && i % every === 0);

    function tAt(ev: MouseEvent<SVGSVGElement>) {
        const r = ev.currentTarget.getBoundingClientRect();
        const frac = clamp((ev.clientX - r.left - mL * (r.width / w)) / (iw * (r.width / w)), 0, 1);
        return roundMin(from + frac * span);
    }
    function hover(ev: MouseEvent<SVGSVGElement>) {
        const T = tAt(ev), st = statusAt(h, T), pr = progressAt(h, T);
        tip.show(ev, [
            { big: fmtMoment(T) },
            { k: "Status", v: st.status in STATUS_WORD ? STATUS_WORD[st.status as keyof typeof STATUS_WORD] : st.status === "not-created" ? "Not created yet" : "Unknown" },
            { k: "Progress", v: pr.value == null ? (pr.basis === "none" ? "not recorded" : "unknown yet") : `${pr.basis === "checkpoint" ? "" : "~"}${Math.round(pr.value)}%` },
            "Click to see the project at this moment",
        ]);
    }

    return (
        <div className="prail" ref={ref}>
            <svg width={w} height={H} role="img" aria-label="Progress and status over the project's life" style={{ cursor: "crosshair" }}
                onClick={(ev) => onPick(tAt(ev))} onMouseMove={hover} onMouseLeave={tip.hide}>
                {[0, 50, 100].map((v) => (
                    <g key={v}>
                        <line className="pr-grid" x1={mL} x2={mL + iw} y1={Y(v)} y2={Y(v)} />
                        <text x={mL - 6} y={Y(v) + 3} textAnchor="end">{v}%</text>
                    </g>
                ))}
                {win && <rect className="pr-win" x={X(win.from)} y={top} width={Math.max(2, X(win.to) - X(win.from))} height={ribY + ribH - top} />}
                {[...weeks.entries()].map(([k, m]) => {
                    const hh = (m / maxW) * (plotH * 0.42);
                    return <rect key={k} className="pr-act" x={X(dayStart(k))} y={top + plotH - hh} width={bw} height={hh} />;
                })}
                {path && <path className="pr-line" d={path} />}
                {h.progressTrack.map((c) => <circle key={c.at} className="pr-dot" cx={X(c.at)} cy={Y(c.value)} r="4.2" />)}
                {h.statusTrack.map((s, i) => {
                    const a = X(s.from), b = X(s.to ?? to);
                    return <rect key={i} className={cx("pr-st", s.status, s.source === "inferred" && "inferred")} x={a} y={ribY} width={Math.max(1.5, b - a)} height={ribH} rx="2" />;
                })}
                {ticks.map((d, i) => {
                    const p = partsOf(dayKey(d));
                    return (
                        <text key={d} x={X(d)} y={ribY + ribH + 14} textAnchor={i === 0 ? "start" : "middle"}>
                            {MONTHS[p.month]}{p.month === 0 || i === 0 ? ` ${p.year}` : ""}
                        </text>
                    );
                })}
                {at != null && <line className="pr-at" x1={X(at)} x2={X(at)} y1={top - 4} y2={ribY + ribH + 2} />}
            </svg>
        </div>
    );
}
