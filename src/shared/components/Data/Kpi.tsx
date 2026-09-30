import type { ReactNode } from "react";
import Skeleton from "@/shared/components/Feedback/Skeleton";

export type KpiProps = {
    label: ReactNode;
    value: ReactNode;
    unit?: ReactNode;
    /** Shown as an ⓘ with a tooltip. */
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
                {hint && <span className="muted" title={hint}>ⓘ</span>}
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

/** A row of figures (the prototype's .kpis). Keeps its shape while loading, so the page doesn't jump. */
export function KpiStrip({ items, loading }: KpiStripProps) {
    return (
        <div className="kpis" aria-busy={loading || undefined}>
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
}
