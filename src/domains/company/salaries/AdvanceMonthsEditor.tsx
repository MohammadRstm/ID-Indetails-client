import AmountField from "@/shared/components/Forms/AmountField";
import { FieldError } from "@/shared/components/Forms/Field";
import Select from "@/shared/components/Forms/Select";
import { addMonths, fmtMonthY } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { addRow, amountOf, collapse, covers, plannedSum, spreadOut, type MonthsPlan } from "./advanceMonths";
import { ADVANCE_MAX_MONTHS } from "./salaryAdvancesApi";

type Props = {
    plan: MonthsPlan;
    onPlan: (plan: MonthsPlan) => void;
    /** What the months must add up to. */
    mustPlan: number;
    currency: string;
    /** The first month it can come off (this month). */
    first: string;
    /** What the API said is wrong with the months. */
    error?: string;
    /** The error to show about what is typed here, once the person has tried to save. */
    liveError?: string;
};

/**
 * Where an advance comes off: all of it in one month (this month, unless chosen otherwise), or spread over that
 * month and the ones after it in chosen amounts. It shows the running total against what must be planned; the API
 * decides whether the months are valid.
 */
export default function AdvanceMonthsEditor({ plan, onPlan, mustPlan, currency, first, error, liveError }: Props) {
    const rows = plan.rows;
    const sum = plannedSum(plan);
    const matches = covers(plan, mustPlan);
    const monthOptions = Array.from({ length: ADVANCE_MAX_MONTHS }, (_, i) => addMonths(first, i)).map((m) => ({ value: m, label: fmtMonthY(m) }));
    const setAmount = (index: number, amount: number) =>
        onPlan({ ...plan, rows: rows.map((r, i) => (i === index ? { ...r, amount: amount > 0 ? amount : null } : r)) });

    return (
        <div className="field" role="group" aria-label="Months it comes off">
            <div className="label">Comes off</div>
            {!plan.spread ? (
                <div className="row wrap" style={{ gap: 8 }}>
                    <Select aria-label="Month it comes off" className="select sm" value={rows[0].month} options={monthOptions}
                        onChange={(month) => onPlan({ ...plan, rows: [{ ...rows[0], month }] })} />
                    <span className="muted">all of it</span>
                    <span className="grow" />
                    <button type="button" className="btn btn-sm btn-quiet" onClick={() => onPlan(spreadOut(plan, mustPlan))}>Spread over months</button>
                </div>
            ) : (
                <>
                    <div className="pay-lines">
                        {rows.map((r, i) => (
                            <div key={r.month} style={{ alignItems: "center" }}>
                                <span>{fmtMonthY(r.month)}</span>
                                <span className="row" style={{ gap: 6 }}>
                                    <AmountField aria-label={`Amount in ${fmtMonthY(r.month)}`} value={r.amount} currency={currency} currencies={false}
                                        onChange={(amount) => setAmount(i, amount)} />
                                    {i > 0 && i === rows.length - 1 && rows.length > 2 && (
                                        <button type="button" className="icon-btn" aria-label={`Remove ${fmtMonthY(r.month)}`}
                                            onClick={() => onPlan({ ...plan, rows: rows.slice(0, -1) })}><Icon name="x" /></button>
                                    )}
                                </span>
                            </div>
                        ))}
                        <div className="pay-total">
                            <span>Planned</span>
                            <span className={matches ? "mono" : "mono down"}>{amountOf(sum, currency)} of {amountOf(mustPlan, currency)}</span>
                        </div>
                    </div>
                    <div className="row wrap mt-s" style={{ gap: 8 }}>
                        <button type="button" className="btn btn-sm" disabled={rows.length >= ADVANCE_MAX_MONTHS} onClick={() => onPlan(addRow(plan))}>
                            <Icon name="plus" />Add a month
                        </button>
                        <button type="button" className="btn btn-sm btn-quiet" onClick={() => onPlan(collapse(plan))}>All in one month</button>
                        {rows.length >= ADVANCE_MAX_MONTHS && <span className="hint">At most {ADVANCE_MAX_MONTHS} months.</span>}
                    </div>
                </>
            )}
            <FieldError message={liveError ?? error} />
        </div>
    );
}
