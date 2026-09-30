import { tip } from "@/shared/components/Overlays/tip";
import { fmtRange, formatSettings, partsOf, type DateValue } from "@/shared/format/time";
import { cx } from "@/shared/utils/cx";
import { clamp } from "./core";

type Block = { start: DateValue; end: DateValue; color?: string; label?: string };

type DayRulerProps = {
    /** The blocks being shown (this entry). */
    blocks?: Block[];
    /** Other entries the same day, greyed. */
    others?: Block[];
    now?: DateValue;
    from?: number;
    to?: number;
    large?: boolean;
    scale?: boolean;
};

/** Where blocks of work sat in the day, 6 AM to 10 PM (the prototype's V.DayRuler). */
export default function DayRuler({ blocks = [], others = [], now, from = 6, to = 22, large, scale = true }: DayRulerProps) {
    const span = (to - from) * 60;
    const pos = (value: DateValue) => {
        const p = partsOf(value);
        return clamp(((p.hour * 60 + p.minute - from * 60) / span) * 100, 0, 100);
    };
    const h24 = formatSettings().use24HourTime;
    return (
        <div>
            <div className={cx("ruler", large && "lg")}>
                {others.map((e, i) => {
                    const a = pos(e.start), b = pos(e.end);
                    return (
                        <i key={`o${i}`} className="other" style={{ left: `${a}%`, width: `${Math.max(0.8, b - a)}%` }}
                            onMouseMove={(ev) => tip.show(ev, [{ big: e.label || "Existing entry" }, { k: "Time", v: fmtRange(e.start, e.end) }])}
                            onMouseLeave={tip.hide} />
                    );
                })}
                {blocks.map((b, i) => {
                    const a = pos(b.start), c = pos(b.end);
                    return <i key={i} style={{ left: `${a}%`, width: `${Math.max(0.8, c - a)}%`, background: b.color || "var(--accent)" }} />;
                })}
                {now != null && <i className="nowline" style={{ left: `${pos(now)}%` }} />}
            </div>
            {scale && (
                <div className="ruler-scale">
                    <span className="mono">{h24 ? "06:00" : "6 AM"}</span>
                    <span className="mono">{h24 ? "12:00" : "12 PM"}</span>
                    <span className="mono">{h24 ? "18:00" : "6 PM"}</span>
                    <span className="mono">{h24 ? "22:00" : "10 PM"}</span>
                </div>
            )}
        </div>
    );
}
