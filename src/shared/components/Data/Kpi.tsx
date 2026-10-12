import { useEffect, useRef, useState, type ReactNode } from "react";
import HelpTip from "@/shared/components/Feedback/HelpTip";
import Skeleton from "@/shared/components/Feedback/Skeleton";
import { Segmented } from "@/shared/components/Forms/Filters";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";

export type KpiProps = {
    label: ReactNode;
    value: ReactNode;
    unit?: ReactNode;
    /** A short explanation, behind a "?" beside the label. */
    hint?: string;
    /** A change against a previous period (see Delta). */
    delta?: ReactNode;
    sub?: ReactNode;
};

/** One figure with its label (the prototype's UI.KPI). */
export function Kpi({ label, value, unit, hint, delta, sub }: KpiProps) {
    return (
        <div className="kpi">
            <div className="kpi-label">
                {label}
                {hint && <HelpTip label={typeof label === "string" ? label.toLowerCase() : "this figure"}>{hint}</HelpTip>}
            </div>
            <div className="kpi-val">
                {value}
                {unit && <small> {unit}</small>}
            </div>
            {delta}
            {sub && <div className="kpi-delta">{sub}</div>}
        </div>
    );
}

type KpiStripProps = {
    items: (KpiProps & { key: string })[];
    /** Placeholder tiles while the figures load. */
    loading?: boolean;
};

/** From this many figures the strip wraps onto rows; fewer stay on one row that scrolls sideways. */
const WRAP_FROM = 8;

/**
 * A row of figures (the prototype's .kpis). Keeps its shape while loading, so the page doesn't jump. Fewer than
 * eight stay on one line: when they don't fit, it scrolls sideways with arrows at either end, never a scroll bar.
 */
export function KpiStrip({ items, loading }: KpiStripProps) {
    const row = items.length < WRAP_FROM;
    const ref = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState({ l: false, r: false });

    function measure() {
        const el = ref.current;
        if (!el || !row) return;
        const l = el.scrollLeft > 2, r = el.scrollLeft < el.scrollWidth - el.clientWidth - 2;
        setEdges((o) => (o.l === l && o.r === r ? o : { l, r }));
    }
    useEffect(() => {
        const el = ref.current;
        if (!el || !row) return;
        const ro = new ResizeObserver(() => measure());
        ro.observe(el);
        return () => ro.disconnect();
    });
    const by = (dir: number) => ref.current?.scrollBy({ left: dir * Math.max(200, ref.current.clientWidth * 0.7), behavior: "smooth" });

    const strip = (
        <div className={cx("kpis", row && "kpis-row")} ref={ref} onScroll={row ? measure : undefined} aria-busy={loading || undefined}>
            {items.map(({ key, ...kpi }) =>
                loading ? (
                    <div className="kpi" key={key}>
                        <div className="kpi-label">{kpi.label}</div>
                        <Skeleton width="45%" height={19} style={{ marginTop: 6 }} />
                    </div>
                ) : (
                    <Kpi key={key} {...kpi} />
                ),
            )}
        </div>
    );
    if (!row) return strip;
    return (
        <div className={cx("kpis-scroll", edges.l && "fade-l", edges.r && "fade-r")}>
            {edges.l && <button type="button" className="kpis-arrow l" aria-label="Earlier figures" onClick={() => by(-1)}><Icon name="chevronLeft" /></button>}
            {strip}
            {edges.r && <button type="button" className="kpis-arrow r" aria-label="More figures" onClick={() => by(1)}><Icon name="chevronRight" /></button>}
        </div>
    );
}

export type KpiTab = {
    key: string;
    label: string;
    items: KpiStripProps["items"];
    loading?: boolean;
    /** Shown instead of the strip, such as the figures failing to load. */
    instead?: ReactNode;
};

/**
 * Figures grouped by tab, such as Financial and Activity, so one strip shows at a time; the first tab is the default.
 * With one tab it is just that strip.
 */
export function KpiTabs({ tabs, label = "Figures" }: { tabs: KpiTab[]; label?: string }) {
    const [current, setCurrent] = useState(tabs[0]?.key);
    const tab = tabs.find((t) => t.key === current) ?? tabs[0];
    if (!tab) return null;
    const strip = tab.instead ?? <KpiStrip items={tab.items} loading={tab.loading} />;
    if (tabs.length === 1) return strip;
    return (
        <div>
            <div className="kpi-tabs">
                <Segmented value={tab.key} onChange={setCurrent} aria-label={label} options={tabs.map((t) => ({ value: t.key, label: t.label }))} />
            </div>
            {strip}
        </div>
    );
}
