import type { Schemas } from "@/api/types";
import { cx } from "@/shared/utils/cx";
import { STANDINGS, type ProfitStanding } from "./insightsApi";

/** Where the profit stands against the profit floor, as a pill: green, amber, or red at zero or below. */
export function StandingBadge({ standing }: { standing: ProfitStanding | null }) {
    if (standing == null) return <span className="muted">-</span>;
    const s = STANDINGS[standing];
    return <span className={cx("badge pill", s.cls)} title={s.note}>{s.label}</span>;
}

/** How the API worked a result out: its method, what it assumed and what it left out, as a short muted note. */
export function BasisNote({ basis, label }: { basis: Schemas["InsightBasisResponse"]; label: string }) {
    return (
        <div className="hint" role="note" aria-label={label}>
            <div>{basis.method}</div>
            {basis.assumptions.map((a) => <div key={a}>{a}</div>)}
            {basis.leftOut.length > 0 && <div>Left out: {basis.leftOut.join(" ")}</div>}
        </div>
    );
}
