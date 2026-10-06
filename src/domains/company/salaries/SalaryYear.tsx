import type { Domain } from "@/app/permissions/permissions";
import { AREAS } from "@/app/routing/areas";
import { Money } from "@/shared/components/Data/Money";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Avatar from "@/shared/components/Identity/Avatar";
import { money } from "@/shared/format/money";
import { MONTHS } from "@/shared/format/time";
import { clickable } from "@/shared/utils/clickable";
import { loadFailed } from "@/api/queryState";
import { useSalaryYear, type SalaryYearRow } from "./salariesApi";

const byCurrency = (amounts: { currency: string; total: number }[]) =>
    [...amounts.reduce((m, a) => m.set(a.currency, (m.get(a.currency) ?? 0) + a.total), new Map<string, number>())]
        .sort(([a], [b]) => (a === "USD" ? -1 : b === "USD" ? 1 : a.localeCompare(b)));

/**
 * A year of salaries: what each person was owed month by month, as the month view works it out, with totals per
 * month and per person (per currency: they are never added together). A month opens that month's list.
 */
export default function SalaryYear({ year, domain, search, onMonth }: {
    year: number;
    domain: Domain | null;
    search: string;
    onMonth: (month: string) => void;
}) {
    const query = useSalaryYear({ year, domain, search });
    const y = query.data;

    if (loadFailed(query)) return <LoadError error={query.error} retry={() => query.refetch()} what="the year's salaries" />;
    if (!y) return <SkeletonLines lines={8} />;
    if (y.rows.length === 0) return <Empty art="search" title={`Nobody was paid in ${year}`} text={domain || search ? "Try another business or search." : "People appear here once their pay is set."} />;

    const months = y.months.map((m) => m.slice(0, 7));
    const currencies = byCurrency(y.totals).map(([c]) => c);
    return (
        <div className="tbl-wrap">
            <table className="tbl">
                <thead>
                    <tr>
                        <th>Person</th>
                        {months.map((m) => <th key={m} className="r">{MONTHS[Number(m.slice(5)) - 1]}</th>)}
                        <th className="r">{year}</th>
                    </tr>
                </thead>
                <tbody>
                    {y.rows.map((row) => <YearLine key={row.userId} row={row} months={months} onMonth={onMonth} />)}
                </tbody>
                <tfoot>
                    {currencies.map((currency) => {
                        const totals = y.totals.filter((t) => t.currency === currency);
                        return (
                            <tr key={currency} className="tfoot-row">
                                <td><b>Total{currencies.length > 1 ? ` · ${currency}` : ""}</b></td>
                                {months.map((m) => {
                                    const t = totals.find((x) => x.month.startsWith(m));
                                    return <td key={m} className="r mono">{t ? <Money short value={t.total} currency={currency} /> : <span className="muted">-</span>}</td>;
                                })}
                                <td className="r mono" style={{ fontWeight: 700 }}>{money.exact(totals.reduce((s, t) => s + t.total, 0), currency)}</td>
                            </tr>
                        );
                    })}
                </tfoot>
            </table>
        </div>
    );
}

function YearLine({ row: r, months, onMonth }: { row: SalaryYearRow; months: string[]; onMonth: (month: string) => void }) {
    const latest = r.months[r.months.length - 1];
    return (
        <tr>
            <td>
                <div className="row" style={{ gap: 9, minWidth: 0 }}>
                    <Avatar person={{ name: r.name, photoFileId: r.photoFileId }} size={28} />
                    <div style={{ minWidth: 0 }}>
                        <div className="trunc" style={{ fontWeight: 600 }}>{r.name}</div>
                        <div className="muted trunc" style={{ fontSize: "11.5px" }}>
                            {r.domain ? AREAS[r.domain as Domain]?.label ?? r.domain : "Company"}
                            {latest && ` · ${latest.basis === "monthly" ? `${money.exact(latest.amount, latest.currency)} / mo` : `${money.exact(latest.amount, latest.currency, { cents: true })} / h`}`}
                        </div>
                    </div>
                </div>
            </td>
            {months.map((m) => {
                const cell = r.months.find((x) => x.month.startsWith(m));
                return (
                    <td key={m} className={cell ? "r mono click" : "r"} {...(cell ? clickable(() => onMonth(m), "button") : {})}
                        aria-label={cell ? `${r.name}, ${m}` : undefined}>
                        {cell ? <Money short value={cell.total} currency={cell.currency} /> : <span className="muted">-</span>}
                    </td>
                );
            })}
            <td className="r mono" style={{ fontWeight: 700 }}>
                {byCurrency(r.months).map(([currency, total]) => <div key={currency}><Money short value={total} currency={currency} /></div>)}
            </td>
        </tr>
    );
}
