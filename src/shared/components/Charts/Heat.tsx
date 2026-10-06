import { tip } from "@/shared/components/Overlays/tip";
import { addDays, companyToday, DAYS, DAYS_LONG, fmtDayDate, fmtDur, fmtH, formatSettings, MONTHS, partsOf, startOfWeek } from "@/shared/format/time";
import { cx } from "@/shared/utils/cx";
import { clamp, heatLevel } from "./core";

type CalendarHeatProps = {
    /** Minutes on a day ("yyyy-MM-dd"). */
    value: (day: string) => number;
    /** The last week shown contains this day; today by default. */
    end?: string;
    weeks?: number;
    scale?: [number, number, number, number];
    cell?: number;
    onClick?: (day: string) => void;
    note?: string;
};

const showLatest = (el: HTMLDivElement | null) => {
    if (el) el.scrollLeft = el.scrollWidth;
};

/** A contribution grid of days (the prototype's V.CalendarHeat). */
export function CalendarHeat({ value, end, weeks = 27, scale, cell = 11, onClick, note }: CalendarHeatProps) {
    const today = companyToday();
    const lastWeek = startOfWeek(end ?? today);
    const first = addDays(lastWeek, -7 * (weeks - 1));
    const gap = 3;
    const weekStarts = Array.from({ length: weeks }, (_, wi) => addDays(first, wi * 7));
    // A month's name goes over the first week that starts in it.
    const months = weekStarts
        .map((ws, i) => ({ i, p: partsOf(ws) }))
        .filter(({ i, p }) => p.day <= 7 && (i === 0 || partsOf(weekStarts[i - 1]).month !== p.month))
        .map(({ i, p }) => ({ i, label: MONTHS[p.month] }));
    const cols = weekStarts.map((ws) =>
        Array.from({ length: 7 }, (_, di) => {
            const day = addDays(ws, di);
            return { day, minutes: day > today ? -1 : value(day) };
        }),
    );
    // Every other day is labelled (Mon, Wed, Fri with a Monday week), following the company's week start.
    const labels = Array.from({ length: 7 }, (_, i) => (i % 2 === 0 && i < 6 ? DAYS[(formatSettings().weekStart + i) % 7] : ""));

    return (
        <div>
            {/* on a narrow screen the grid scrolls sideways: it opens on the latest weeks */}
            <div className="hm-wrap" ref={showLatest}>
                <div style={{ minWidth: cols.length * (cell + gap) + 30 }}>
                    <div className="hm-months" style={{ marginLeft: 26 }}>
                        {months.map((m, i) => <span key={i} style={{ left: m.i * (cell + gap) }}>{m.label}</span>)}
                    </div>
                    <div style={{ display: "flex" }}>
                        <div className="hm-days" style={{ width: 22 }}>{labels.map((l, i) => <span key={i}>{l}</span>)}</div>
                        <div className="hm">
                            {cols.map((col, ci) => (
                                <div className="hm-col" key={ci}>
                                    {col.map((d) => d.minutes < 0
                                        ? <div key={d.day} className="hm-cell" style={{ opacity: 0.25, width: cell, height: cell }} />
                                        : (
                                            <div key={d.day} className={cx("hm-cell", `lv${heatLevel(d.minutes, scale)}`, onClick && "click")}
                                                style={{ width: cell, height: cell }}
                                                onClick={onClick ? () => onClick(d.day) : undefined}
                                                onMouseMove={(e) => tip.show(e, [{ big: fmtDayDate(d.day) }, { k: "Logged", v: d.minutes ? fmtDur(d.minutes) : "no work" }])}
                                                onMouseLeave={tip.hide} />
                                        ))}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <div className="spread mt-s">
                <div className="hm-legend">Less {[0, 1, 2, 3, 4].map((l) => <i key={l} className={`lv${l}`} />)} More</div>
                {note && <div className="muted" style={{ fontSize: "11.5px" }}>{note}</div>}
            </div>
        </div>
    );
}

type HourHeatProps = {
    /** Minutes per weekday (0 = Monday … 6 = Sunday) and hour (0–23). */
    grid: number[][];
    from?: number;
    to?: number;
};

/** When work happens: weekday × hour (the prototype's V.HourHeat). */
export function HourHeat({ grid, from = 6, to = 22 }: HourHeatProps) {
    const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    let max = 1;
    grid.forEach((row) => row.forEach((v, h) => { if (h >= from && h <= to) max = Math.max(max, v); }));
    const label = (h: number) => (formatSettings().use24HourTime ? String(h).padStart(2, "0") : `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`);
    const dayNames = [...DAYS.slice(1), DAYS[0]];

    return (
        <div style={{ display: "flex", gap: 6 }}>
            <div style={{ width: 28, flex: "none" }}>
                {dayNames.map((d, i) => <div key={i} style={{ height: 16, marginBottom: 3, fontSize: 10, color: "var(--ink-3)", lineHeight: "16px" }}>{d}</div>)}
            </div>
            <div className="grow" style={{ overflowX: "auto" }}>
                <div style={{ minWidth: hours.length * 20 }}>
                    {grid.map((row, ri) => (
                        <div key={ri} style={{ display: "flex", gap: 3, marginBottom: 3 }}>
                            {hours.map((h) => {
                                const v = row[h] ?? 0;
                                const lvl = v <= 0 ? 0 : clamp(Math.ceil((v / max) * 4), 1, 4);
                                return (
                                    <div key={h} className={cx("hm-cell", `lv${lvl}`)} style={{ flex: "1 1 0", height: 16, borderRadius: 3 }}
                                        onMouseMove={(e) => tip.show(e, [{ big: `${DAYS_LONG[(ri + 1) % 7]} · ${label(h)}` }, { k: "Logged", v: v ? fmtH(v) : "-" }])}
                                        onMouseLeave={tip.hide} />
                                );
                            })}
                        </div>
                    ))}
                    <div style={{ display: "flex", gap: 3, marginTop: 2 }}>
                        {hours.map((h, i) => <div key={i} style={{ flex: "1 1 0", fontSize: 9.5, color: "var(--ink-3)", textAlign: "center" }}>{i % 3 === 0 ? label(h) : ""}</div>)}
                    </div>
                </div>
            </div>
        </div>
    );
}
