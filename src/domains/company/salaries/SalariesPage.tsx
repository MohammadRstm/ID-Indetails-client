import { useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { fetchBlob, saveBlob } from "@/api/download";
import { errorMessage } from "@/api/errors";
import type { Domain } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { AREAS } from "@/app/routing/areas";
import Pager from "@/shared/components/Data-Tables/Pager";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import { SearchInput, Segmented } from "@/shared/components/Forms/Filters";
import Avatar from "@/shared/components/Identity/Avatar";
import { money } from "@/shared/format/money";
import { addMonths, companyToday, fmtDate, fmtDateY, fmtH, fmtMonthY } from "@/shared/format/time";
import useDebounce from "@/shared/hooks/useDebounce";
import Icon from "@/shared/icons/Icon";
import { HOURS_PER_MONTH } from "@/domains/design/pay/payRules";
import SalaryDrawer from "./SalaryDrawer";
import { useSalaries, type SalaryRow } from "./salariesApi";
import { clickable } from "@/shared/utils/clickable";

const PAGE = 10;
const cash = (v: number, cur: string, cents = false) => money.exact(v, cur, cents ? { cents: true } : undefined);
const hrs = (m: number) => (m ? fmtH(m) : "-");

function payLabel(r: SalaryRow) {
    return r.basis === "monthly" ? `${cash(r.amount, r.currency)} / mo` : `${cash(r.hourlyRate, r.currency, true)} / h`;
}

/** Flagged (a closed month still short), behind (this month so far), excused, or nothing. */
function ShortCell({ row: r }: { row: SalaryRow }) {
    const short = r.shortMinutes ?? 0;
    if (r.expectedMinutes == null) return <span className="muted">-</span>;
    if (r.excusedMinutes > 0 && r.excusedMinutes >= r.expectedMinutes) return <span className="badge">Excused</span>;
    if (r.flagged) return <span className="hl-flag" title="Finished the month short of their scheduled hours">Short {fmtH(short)}</span>;
    if (r.behind) return <span className="hl-behind" title="Behind on their hours so far this month">{fmtH(short)} behind</span>;
    return r.excusedMinutes ? <span className="muted" style={{ fontSize: "11.5px" }}>{fmtH(r.excusedMinutes)} excused</span> : <span className="muted">-</span>;
}

/** A month asked for in the address (a month-end notice links here), never a future one. */
function monthOf(asked: string | null, thisMonth: string) {
    return asked && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) && asked <= thisMonth ? asked : thisMonth;
}

/**
 * What each person is owed for a month (the prototype's P.CompanySalaries): hours from their work entries,
 * pay from their pay records, the hours rule's shortfalls and excuses. Separate from project labour cost.
 */
export default function SalariesPage() {
    const permissions = usePermissions();
    const [params, setParams] = useSearchParams();
    const today = companyToday();
    const thisMonth = today.slice(0, 7);
    const month = monthOf(params.get("month"), thisMonth);
    const [domain, setDomain] = useState<Domain | "all">("all");
    const [q, setQ] = useState("");
    const [page, setPage] = useState(1);
    const [open, setOpen] = useState<SalaryRow | null>(null);
    const [exporting, setExporting] = useState(false);
    const anchor = useRef<HTMLDivElement>(null);
    const search = useDebounce({ value: q.trim(), debounceTimeMs: 250 });
    const domains = (["design", "execution"] as Domain[]).filter((d) => permissions.canSeeDomain(d));
    const filters = { month, domain: domain === "all" ? null : domain, search };
    const salaries = useSalaries({ ...filters, page, pageSize: PAGE });
    const filtered = domain !== "all" || !!search;
    // "4 of 13": everyone's count, only asked for while a filter narrows the list
    const everyone = useSalaries({ month, domain: null, search: "", page: 1, pageSize: 1 }, filtered);
    const r = salaries.data;
    const isThisMonth = month === thisMonth;
    const rows = r?.rows.items ?? [];
    const total = r?.rows.totalCount ?? 0;
    const pages = Math.max(1, Math.ceil(total / PAGE));
    const sum = r?.summary;
    const totals = [...(r?.totals ?? [])].sort((a, b) => (a.currency === "USD" ? -1 : b.currency === "USD" ? 1 : a.currency.localeCompare(b.currency)));
    const ruled = sum?.expectedMinutes != null;
    const otPaid = sum ? sum.overtimeMinutes - sum.madeUpMinutes : 0;
    const multiplier = r?.overtimeMultiplier ?? 1;

    const goMonth = (m: string) => { setPage(1); setParams(m === thisMonth ? {} : { month: m }, { replace: true }); };
    const filter = (next: () => void) => { next(); setPage(1); };

    async function exportCsv() {
        setExporting(true);
        try {
            const { blob, fileName } = await fetchBlob("/company/salaries/export", { month, domain: filters.domain, search: search || null });
            const name = fileName ?? `salaries-${month}.csv`;
            saveBlob(blob, name);
            toast({ text: `Exported ${total} employee${total === 1 ? "" : "s"}`, sub: `${name} · every page, as filtered`, icon: "download" });
        } catch (e) {
            toast({ text: "The salaries weren't exported", sub: errorMessage(e), icon: "alert" });
        } finally {
            setExporting(false);
        }
    }

    return (
        <div className="page">
            <div className="page-head">
                <div>
                    <h1 className="page-title">Salaries</h1>
                    <div className="page-sub">What each employee is owed for the month - hours from their work entries, pay from their pay records. Separate from project labour cost.</div>
                </div>
                <div className="page-actions">
                    <div className="row" style={{ gap: 4 }}>
                        <button className="icon-btn" aria-label="Previous month" onClick={() => goMonth(addMonths(month, -1))}><Icon name="chevronLeft" /></button>
                        <b style={{ minWidth: 130, textAlign: "center" }}>{fmtMonthY(month)}</b>
                        <button className="icon-btn" aria-label="Next month" disabled={isThisMonth} onClick={() => goMonth(addMonths(month, 1))}><Icon name="chevronRight" /></button>
                    </div>
                    {isThisMonth && <span className="badge badge-hold">In progress · to {fmtDate(today)}</span>}
                    <button className="btn" disabled={!total || exporting} onClick={exportCsv}><Icon name="download" />Export CSV</button>
                </div>
            </div>

            {salaries.isError ? <div className="panel"><div className="panel-body"><LoadError error={salaries.error} retry={() => salaries.refetch()} what="the salaries" /></div></div> : (
                <>
                    <KpiStrip loading={!r} items={[
                        ...(totals.length ? totals : [{ currency: "USD", total: 0, basePay: 0, overtimePay: 0 }]).map((t) => ({
                            key: `pay-${t.currency}`, label: `To pay${totals.length > 1 ? ` · ${t.currency}` : ""}`, value: cash(t.total, t.currency),
                            sub: <span>{cash(t.basePay, t.currency)} base · {cash(t.overtimePay, t.currency)} overtime</span>,
                        })),
                        { key: "people", label: "Employees", value: String(sum?.people ?? 0), sub: <span>{sum?.onMonthlySalary ?? 0} on a monthly salary</span> },
                        {
                            key: "hours", label: "Hours worked", value: fmtH((sum?.normalMinutes ?? 0) + (sum?.overtimeMinutes ?? 0)),
                            sub: <span>{fmtH(sum?.normalMinutes ?? 0)} in schedule · <span className="ot-text">{fmtH(sum?.overtimeMinutes ?? 0)} overtime</span>{sum?.madeUpMinutes ? ` · ${fmtH(sum.madeUpMinutes)} made up` : ""}</span>,
                        },
                        ...(ruled && sum ? [{
                            key: "short", label: isThisMonth ? "Behind so far" : "Short on hours", value: String(sum.shortPeople),
                            sub: <span className={sum.shortPeople ? "down" : ""}>{sum.shortPeople ? `${fmtH(sum.shortMinutes)}${isThisMonth ? " behind in total" : " short, flagged"}` : "everyone worked their hours"}</span>,
                        }] : []),
                        { key: "rate", label: "Overtime rate", value: `×${multiplier}`, sub: <span>{multiplier === 1 ? "paid like a normal hour" : "of the hourly rate"}</span> },
                    ]} />

                    <div className="panel mt" ref={anchor}>
                        <div className="panel-head">
                            <div className="grow">
                                <div className="panel-title">Employees</div>
                                <div className="panel-sub">
                                    Everyone owes their scheduled hours each month. Overtime first makes up any hours short (paid as normal), the rest is paid as overtime;
                                    a salary loses the hours still short at the end of the month. Hourly: hours × rate. Monthly: salary, hours priced at salary ÷ {HOURS_PER_MONTH.toFixed(1)} h.
                                </div>
                            </div>
                        </div>
                        <div className="panel-body">
                            <div className="filters">
                                {domains.length > 1 && (
                                    <Segmented aria-label="Business" value={domain} onChange={(v) => filter(() => setDomain(v))}
                                        options={[{ value: "all" as const, label: "All" }, ...domains.map((d) => ({ value: d, label: AREAS[d].label }))]} />
                                )}
                                <SearchInput value={q} onChange={(v) => filter(() => setQ(v))} placeholder="Search by name or email" width={240} />
                                {r && <span className="muted" style={{ fontSize: 12 }}>{total} of {filtered ? (everyone.data?.rows.totalCount ?? total) : total}</span>}
                            </div>
                            {!r ? <SkeletonLines lines={8} /> : (
                                <>
                                    <div className="tbl-wrap">
                                        <table className="tbl">
                                            <thead>
                                                <tr>
                                                    <th>Employee</th><th>Pay</th>
                                                    <th className="r" title="Hours their schedule asks for this month (so far, for the current month)">Expected</th>
                                                    <th className="r" title="Logged inside their scheduled hours">In hours</th>
                                                    <th className="r" title="Overtime that made up missing hours - paid as normal hours">Made up</th>
                                                    <th className="r" title="Overtime left after making up - paid at the overtime rate">Overtime</th>
                                                    <th>Short</th>
                                                    <th className="r">Base pay</th><th className="r">Overtime pay</th><th className="r">To pay</th><th />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {rows.map((row) => <SalaryLine key={row.userId} row={row} onOpen={() => setOpen(row)} />)}
                                            </tbody>
                                            {total > 0 && sum && (
                                                <tfoot>
                                                    <tr className="tfoot-head">
                                                        <th colSpan={2}>Totals</th>
                                                        <th className="r">Expected</th><th className="r">In hours</th><th className="r">Made up</th><th className="r">Overtime</th><th>Short</th>
                                                        <th className="r">Base pay</th><th className="r">Overtime pay</th><th className="r">To pay</th><th />
                                                    </tr>
                                                    {totals.map((t, i) => (
                                                        <tr key={t.currency} className="tfoot-row">
                                                            <td colSpan={2}>
                                                                <b>Total{totals.length > 1 ? ` · ${t.currency}` : ""}</b>
                                                                <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>
                                                                    all {sum.people} {domain === "all" ? "" : `${AREAS[domain].label} `}employee{sum.people === 1 ? "" : "s"}
                                                                    {search ? ` matching “${search}”` : ""}{pages > 1 ? `, across ${pages} pages` : ""} · {fmtMonthY(month)}
                                                                </div>
                                                            </td>
                                                            {i === 0 ? (
                                                                <>
                                                                    <td className="r mono">{fmtH(sum.expectedMinutes ?? 0)}</td>
                                                                    <td className="r mono">{fmtH(sum.normalMinutes)}</td>
                                                                    <td className="r mono">{fmtH(sum.madeUpMinutes)}</td>
                                                                    <td className="r mono ot-text">{fmtH(otPaid)}</td>
                                                                    <td className={sum.shortMinutes ? "down mono" : "mono"}>{sum.shortMinutes ? fmtH(sum.shortMinutes) : "-"}</td>
                                                                </>
                                                            ) : <td colSpan={5} />}
                                                            <td className="r mono">{cash(t.basePay, t.currency)}</td>
                                                            <td className="r mono">{cash(t.overtimePay, t.currency)}</td>
                                                            <td className="r mono" style={{ fontWeight: 700 }}>{cash(t.total, t.currency)}</td>
                                                            <td />
                                                        </tr>
                                                    ))}
                                                </tfoot>
                                            )}
                                        </table>
                                    </div>
                                    {total === 0 && (filtered
                                        ? <Empty art="search" title="No employees match" text="Try another business or search." />
                                        : <Empty art="search" title={`Nobody was paid in ${fmtMonthY(month)}`} text="People appear here once their pay is set." />)}
                                    <Pager page={Math.min(page, pages)} pageSize={PAGE} total={total} onPage={setPage} anchor={anchor} />
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}
            {open && <SalaryDrawer row={open} month={month} multiplier={multiplier} onClose={() => setOpen(null)} />}
        </div>
    );
}

function SalaryLine({ row: r, onOpen }: { row: SalaryRow; onOpen: () => void }) {
    const ruled = r.expectedMinutes != null;
    const otLogged = r.overtimeMinutes + r.madeUpMinutes;
    return (
        <tr className="click" {...clickable(onOpen)}>
            <td>
                <div className="row" style={{ gap: 9, minWidth: 0 }}>
                    <Avatar person={{ name: r.name, photoFileId: r.photoFileId }} size={28} />
                    <div style={{ minWidth: 0 }}>
                        <div className="trunc" style={{ fontWeight: 600 }}>{r.name}</div>
                        <div className="muted trunc" style={{ fontSize: "11.5px" }}>{r.domain ? AREAS[r.domain as Domain]?.label ?? r.domain : "Company"} · {r.email}</div>
                    </div>
                </div>
            </td>
            <td className="nowrap">
                <span className="mono">{payLabel(r)}</span>
                <div className="muted" style={{ fontSize: 11 }}>{r.basis === "monthly" ? `monthly · ${cash(r.hourlyRate, r.currency, true)}/h` : "hourly"}</div>
            </td>
            {r.tracksHours ? (
                <>
                    <td className="r mono">{ruled ? hrs(r.expectedMinutes ?? 0) : "-"}</td>
                    <td className="r mono">{hrs(r.normalMinutes)}</td>
                    <td className="r mono">{r.madeUpMinutes ? fmtH(r.madeUpMinutes) : "-"}</td>
                    <td className={r.overtimeMinutes ? "r mono ot-text" : "r mono"}>
                        {hrs(r.overtimeMinutes)}
                        {r.madeUpMinutes > 0 && <div className="muted" style={{ fontSize: "10.5px", fontFamily: "inherit" }}>of {fmtH(otLogged)} logged</div>}
                    </td>
                    <td><ShortCell row={r} /></td>
                </>
            ) : <td className="r muted" colSpan={5}>hours not tracked</td>}
            <td className="r mono">
                {cash(r.basePay, r.currency)}
                {r.proRated && (
                    <div className="muted" style={{ fontSize: "10.5px", fontFamily: "inherit" }} title={r.leftOn ? `Left ${fmtDateY(r.leftOn)}` : "Employed for part of the month"}>
                        pro-rated · {r.workingDaysPaid}/{r.workingDays} days
                    </div>
                )}
                {r.deduction > 0 && <div className="down" style={{ fontSize: "10.5px" }}>−{cash(r.deduction, r.currency)} {r.flagged ? "short" : "unpaid"}</div>}
            </td>
            <td className="r mono">{r.overtimePay ? cash(r.overtimePay, r.currency) : "-"}</td>
            <td className="r mono" style={{ fontWeight: 700 }}>{cash(r.total, r.currency)}</td>
            <td className="r"><button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); onOpen(); }}>View details</button></td>
        </tr>
    );
}
