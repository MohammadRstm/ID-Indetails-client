import { z } from "zod";
import { fmtCount } from "@/shared/components/Charts/core";
import { money } from "@/shared/format/money";
import { fmtDate, fmtDateY, fmtH, MONTHS } from "@/shared/format/time";

/*
 * Charts, tables and headline figures under Proton's answers. The server builds each one from a tool's data; the app
 * still checks its shape and size before drawing it, and drops one that doesn't fit rather than drawing it wrong.
 */

const unit = z.enum(["hours", "usd", "count", "percent", "days"]);
const columnKind = z.enum(["text", "status", "date", "week", "month", "number"]);
const ref = z.object({ type: z.enum(["project", "client", "person", "team"]), id: z.number().int().positive(), name: z.string(), domain: z.string().nullish() });
const value = z.number().nullable();

const column = z.object({ key: z.string().max(40), label: z.string().max(80), kind: columnKind, unit: unit.nullish() });
const cell = z.object({ text: z.string().max(400).nullish(), number: z.number().nullish(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish() });
const row = z.object({ cells: z.array(cell).max(8), ref: ref.nullish(), partial: z.boolean().optional() });

const chart = z.object({
    kind: z.enum(["bar", "columns", "line", "composition"]),
    axisLabel: z.string().max(80),
    axis: columnKind,
    series: z.array(z.object({ key: z.string(), label: z.string().max(80), unit })).min(1).max(3),
    points: z.array(z.object({ label: z.string().max(200), values: z.array(value).max(3), ref: ref.nullish(), partial: z.boolean().optional() })).min(1).max(60),
});

const blockSchema = z.object({
    id: z.string().max(40),
    type: z.enum(["chart", "table", "kpis"]),
    title: z.string().max(120),
    period: z.string().max(80).nullish(),
    chart: chart.nullish(),
    table: z.object({ columns: z.array(column).min(1).max(8), rows: z.array(row).max(100), totalRows: z.number().int().nonnegative() }).nullish(),
    kpis: z.object({
        items: z.array(z.object({ key: z.string(), label: z.string().max(80), unit, value, previous: value.optional(), change: value.optional() })).min(1).max(6),
    }).nullish(),
    notes: z.array(z.string().max(300)).max(8),
    source: z.object({ tool: z.string(), dataset: z.string(), asOf: z.string() }),
}).refine((b) => (b.type === "chart" ? !!b.chart : b.type === "table" ? !!b.table : !!b.kpis));

export type ProtonBlock = z.infer<typeof blockSchema>;
export type ProtonChartBlock = NonNullable<ProtonBlock["chart"]>;
export type ProtonTableBlock = NonNullable<ProtonBlock["table"]>;
export type ProtonUnit = z.infer<typeof unit>;
export type ProtonColumnKind = z.infer<typeof columnKind>;

/** The blocks of a reply or a saved message that can be drawn as they are; anything else is left out. */
export function parseBlocks(raw: unknown): ProtonBlock[] {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 10).flatMap((b) => {
        const parsed = blockSchema.safeParse(b);
        return parsed.success ? [parsed.data] : [];
    });
}

/** A figure in its unit: 6h 30m, $9.6k, 12, 40%, 3 days. A missing one is a dash, never 0. */
export function formatValue(of: ProtonUnit, v: number | null | undefined, short = false): string {
    if (v == null) return "–";
    switch (of) {
        case "hours": return fmtH(Math.round(v * 60));
        case "usd": return short ? money.short(v) : money.fmt(v);
        case "percent": return `${Math.round(v)}%`;
        case "days": return Math.abs(v) === 1 ? `${v} day` : `${fmtCount(v)} days`;
        default: return Number.isInteger(v) ? fmtCount(v) : v.toLocaleString("en-US", { maximumFractionDigits: 1 });
    }
}

/** A change, signed: +2h, -$1.2k. */
export function formatChange(of: ProtonUnit, v: number | null | undefined): string {
    if (v == null) return "–";
    const sign = v > 0 ? "+" : v < 0 ? "-" : "";
    // a change of a percentage is in points, not a percentage of it
    return of === "percent" ? `${sign}${Math.round(Math.abs(v))} pts` : `${sign}${formatValue(of, Math.abs(v), true)}`;
}

/** A point's name on a time axis, short: Mar 2 for a day or a week, Mar 2026 for a month. */
export function pointLabel(axis: ProtonColumnKind, label: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) return label;
    if (axis === "month") return `${MONTHS[Number(label.slice(5, 7)) - 1]} ${label.slice(0, 4)}`;
    return axis === "week" || axis === "date" ? fmtDate(label) : label;
}

/** The same, in full for a tooltip or a table: "Week of Mar 2, 2026". */
export function pointTitle(axis: ProtonColumnKind, label: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) return label;
    if (axis === "week") return `Week of ${fmtDateY(label)}`;
    return axis === "month" ? pointLabel(axis, label) : fmtDateY(label);
}
