import { useState } from "react";
import { Delta } from "@/shared/components/Charts/Bars";
import Figure from "@/shared/components/Charts/Figure";
import LineChart, { type LineSeries } from "@/shared/components/Charts/LineChart";
import { KpiStrip, type KpiProps } from "@/shared/components/Data/Kpi";
import Skeleton from "@/shared/components/Feedback/Skeleton";
import { Segmented } from "@/shared/components/Forms/Filters";
import { fmtDate, fmtDayDate, fmtNumber } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import type { AnalyticsTotals, WebsiteAnalytics } from "./analyticsApi";
import { fmtRate, fmtSeconds, pointsChange } from "./analyticsFormat";

type Figures = { data: WebsiteAnalytics | undefined; loading: boolean; compareLabel: string };

/** A rate's change in percentage points: a percentage change of a percentage would exaggerate it. */
function PointsDelta({ value, previous, label }: { value: number; previous: number; label: string }) {
    const change = pointsChange(value, previous);
    const up = change >= 0;
    return (
        <span className={cx("kpi-delta", up ? "up" : "down")}>
            <Icon name={up ? "trendUp" : "trendDown"} />
            {(up ? "+" : "") + change.toFixed(1)} pts <span className="muted">{label}</span>
        </span>
    );
}

/**
 * The period at a glance: four headline figures (visitors, sessions, page views and contact requests), then the
 * finer ones below them, smaller. Each beside the previous period when compared.
 */
export function AnalyticsKpis({ data, loading, compareLabel }: Figures) {
    const now = data?.totals;
    const before = data?.previousTotals ?? undefined;
    const delta = (pick: (t: AnalyticsTotals) => number) =>
        now && before ? <Delta value={pick(now)} prev={pick(before)} label={compareLabel} /> : undefined;

    const headline: (KpiProps & { key: string })[] = [
        { key: "visitors", label: "Visitors", value: fmtNumber(now?.visitors ?? 0), delta: delta((t) => t.visitors),
            hint: "People who used the website in the period, each counted once however often they came." },
        { key: "sessions", label: "Sessions", value: fmtNumber(now?.sessions ?? 0), delta: delta((t) => t.sessions),
            hint: "Visits to the website. A visit ends after 30 minutes without anything happening." },
        { key: "views", label: "Page views", value: fmtNumber(now?.views ?? 0), delta: delta((t) => t.views),
            hint: "Pages opened, each time one was opened." },
        { key: "contact", label: "Contact requests", value: fmtNumber(now?.contactRequests ?? 0), delta: delta((t) => t.contactRequests),
            hint: "Messages sent from the website's contact form." },
    ];
    const finer: (KpiProps & { key: string })[] = [
        { key: "engagement", label: "Engagement rate", value: fmtRate(now?.engagementRate ?? 0),
            delta: now && before ? <PointsDelta value={now.engagementRate} previous={before.engagementRate} label={compareLabel} /> : undefined,
            hint: "The share of sessions that lasted more than 10 seconds, opened two pages or more, or led to a contact." },
        { key: "time", label: "Average engagement time", value: fmtSeconds(now?.averageEngagementSeconds ?? 0),
            delta: delta((t) => t.averageEngagementSeconds),
            hint: "How long the website was on screen and in front of each visitor, on average." },
        { key: "depth", label: "Views per session", value: (now?.viewsPerSession ?? 0).toFixed(1), delta: delta((t) => t.viewsPerSession) },
        { key: "new", label: "New visitors", value: fmtNumber(now?.newVisitors ?? 0), delta: delta((t) => t.newVisitors),
            hint: "Visitors who came to the website for the first time." },
    ];

    return (
        <section aria-label="The period at a glance">
            <div className="analytics-headline"><KpiStrip items={headline} loading={loading} /></div>
            <div className="mt-s"><KpiStrip items={finer} loading={loading} /></div>
        </section>
    );
}

type Metric = "visitors" | "sessions" | "views";

const METRICS: { value: Metric; label: string; previous: "previousVisitors" | "previousSessions" | "previousViews" }[] = [
    { value: "visitors", label: "Visitors", previous: "previousVisitors" },
    { value: "sessions", label: "Sessions", previous: "previousSessions" },
    { value: "views", label: "Page views", previous: "previousViews" },
];

/** Each day of the period, with the previous period's day in the same position dashed behind it. */
export function TrafficPanel({ data, compared }: { data: WebsiteAnalytics | undefined; compared: boolean }) {
    const [metric, setMetric] = useState<Metric>("visitors");
    const shown = METRICS.find((m) => m.value === metric)!;
    const days = data?.days ?? [];

    const series: LineSeries[] = [{
        label: shown.label,
        area: true,
        points: days.map((d) => ({
            y: d[metric],
            label: fmtDate(d.date),
            tip: d.previousDate ? `${fmtDayDate(d.date)} · against ${fmtDayDate(d.previousDate)}` : fmtDayDate(d.date),
        })),
    }];
    if (compared) series.push({ label: "Previous period", ghost: true, dash: true, points: days.map((d) => ({ y: d[shown.previous] ?? 0 })) });

    return (
        <Figure
            title="Traffic over time"
            sub={`${shown.label} per day`}
            tools={<Segmented value={metric} onChange={setMetric} aria-label="Figure" options={METRICS.map(({ value, label }) => ({ value, label }))} />}
            table={{
                cols: [{ label: "Day" }, { label: shown.label, right: true }, ...(compared ? [{ label: "Previous period", right: true }] : [])],
                rows: days.map((d) => [fmtDayDate(d.date), fmtNumber(d[metric]), ...(compared ? [fmtNumber(d[shown.previous] ?? 0)] : [])]),
            }}
        >
            {data ? (
                <LineChart series={series} tickEvery={Math.max(1, Math.ceil(days.length / 8))} title={`${shown.label} per day`} />
            ) : (
                <Skeleton height={190} />
            )}
        </Figure>
    );
}
