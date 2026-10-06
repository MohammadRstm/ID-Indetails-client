import { useState } from "react";
import { useNavigate } from "react-router";
import { fetchBlob, saveBlob } from "@/api/download";
import { errorMessage } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { canOpen } from "@/app/routing/routeTable";
import { ProjectTile } from "@/shared/components/Data/Bits";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import { Segmented } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import Avatar from "@/shared/components/Identity/Avatar";
import { PersonName } from "@/shared/components/Identity/People";
import { money } from "@/shared/format/money";
import { companyToday, fmtDate, fmtH, fmtNumber } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { HOURS_PER_MONTH } from "@/domains/design/pay/payRules";
import { policyOn, useWorkingTime } from "@/domains/shared/settings/settingsApi";
import { useProjects } from "@/domains/shared/projects/projectsApi";
import { periodDates, periodLabel, periodOf, stepPeriod, type PayPeriod, type PayUnit } from "./payPeriod";
import { useProjectPay, type ProjectPayPerson, type ProjectPayProject } from "./projectPayApi";
import { loadFailed } from "@/api/queryState";
import HelpHint from "@/domains/shared/help/HelpHint";

type Totals = { currency: string; total: number }[];
type Tile = { icon: string | null; tint: string | null };

const UNITS: { value: PayUnit; label: string }[] = [{ value: "week", label: "Week" }, { value: "month", label: "Month" }, { value: "quarter", label: "Quarter" }];
const hrs = (m: number) => (m ? fmtH(m) : "-");
const byCurrency = (totals: Totals) => [...totals].sort((a, b) => (a.currency === "USD" ? -1 : b.currency === "USD" ? 1 : a.currency.localeCompare(b.currency)));
const entriesOf = (p: ProjectPayProject) => p.people.reduce((t, x) => t + x.entries, 0);

/**
 * Time spent on each Design project and the pay it represents, by department and employee (the prototype's
 * P.CompanyProjectPay). The API prices every entry at the person's rate that day, overtime at the multiplier
 * unless it made up hours they were short; amounts in different currencies are never added together.
 */
export default function ProjectPayPage() {
    const permissions = usePermissions();
    const today = companyToday();
    const [unit, setUnit] = useState<PayUnit>("week");
    const [period, setPeriod] = useState<PayPeriod>(() => periodOf("week", today));
    const [projectId, setProjectId] = useState("all");
    const pay = useProjectPay({ unit, date: period.from, projectId: projectId === "all" ? null : +projectId });
    const projects = useProjects({ domain: "design", pageSize: 100 }, permissions.has(P.PROJECT_VIEW)).data?.items ?? [];
    // the company's overtime rate for the period shown
    const multiplier = policyOn(useWorkingTime().data, period.from)?.overtimeMultiplier;
    const r = pay.data;
    const current = today >= period.from && today < period.to;
    const word = unit;
    const picked = projects.find((p) => String(p.id) === projectId);
    const groups = r?.projects ?? [];
    const totals = byCurrency(r?.totals ?? []);
    const entries = groups.reduce((t, g) => t + entriesOf(g), 0);
    const hidden = r ? r.designProjects - groups.length : 0;
    const tiles = new Map<number, Tile>(projects.map((p) => [p.id, { icon: p.icon, tint: p.tint }]));

    function changeUnit(next: PayUnit) {
        if (next === unit) return;
        // the period that holds today stays on today; an earlier one keeps its start date
        setUnit(next);
        setPeriod(periodOf(next, current ? today : period.from));
    }
    function move(n: number) {
        const next = stepPeriod(unit, period, n);
        if (next.from <= today) setPeriod(next);
    }

    async function exportCsv() {
        try {
            const { blob, fileName } = await fetchBlob("/company/project-pay/export", { unit, date: period.from, projectId: picked?.id ?? null });
            const name = fileName ?? `project-pay-${unit}-${period.from}.csv`;
            saveBlob(blob, name);
            toast({ text: "Exported project pay", sub: name, icon: "download" });
        } catch (e) {
            toast({ text: "Project pay wasn't exported", sub: errorMessage(e), icon: "alert" });
        }
    }

    return (
        <div className="page">
            <div className="page-head">
                <div>
                    <h1 className="page-title">Project pay<HelpHint article="project-pay-vs-salaries" label="project pay">What each project paid for the hours on it. It leaves out paid breaks and deductions, so it won't match Salaries.</HelpHint></h1>
                    <div className="page-sub">Time spent on each Design project and the pay it represents, by department and employee</div>
                </div>
                <div className="page-actions">
                    <button className="btn" disabled={!groups.length} onClick={exportCsv}><Icon name="download" />Export CSV</button>
                </div>
            </div>

            <div className="filters pp-period">
                <Segmented aria-label="Period" value={unit} onChange={changeUnit} options={UNITS} />
                <div className="row" style={{ gap: 4 }}>
                    <button className="icon-btn" aria-label={`Previous ${word}`} onClick={() => move(-1)}><Icon name="chevronLeft" /></button>
                    <div className="pp-label">
                        <b>{periodLabel(unit, period)}</b>
                        {unit !== "week" && <span className="muted">{periodDates(period)}</span>}
                    </div>
                    <button className="icon-btn" aria-label={`Next ${word}`} disabled={current} onClick={() => move(1)}><Icon name="chevronRight" /></button>
                </div>
                <button className="btn btn-sm" disabled={current} onClick={() => setPeriod(periodOf(unit, today))}>This {word}</button>
                {current && <span className="badge badge-hold">In progress · to {fmtDate(today)}</span>}
                <span className="grow" />
                <div style={{ width: 280 }}>
                    <Select className="select sm" aria-label="Project" value={projectId} onChange={setProjectId}
                        options={[{ value: "all", label: "All Design projects" },
                            ...projects.map((p) => ({ value: String(p.id), label: `${p.title}${p.status !== "active" ? ` (${p.status})` : ""}` }))]} />
                </div>
            </div>

            {loadFailed(pay) ? <div className="panel mt"><div className="panel-body"><LoadError error={pay.error} retry={() => pay.refetch()} what="project pay" /></div></div> : (
                <>
                    <div className="mt">
                        <KpiStrip loading={!r} items={[
                            { key: "projects", label: "Projects with work", value: String(groups.length), sub: <span>of {r?.designProjects ?? 0} Design project{r?.designProjects === 1 ? "" : "s"}</span> },
                            { key: "people", label: "People", value: String(r?.people ?? 0), sub: <span>{fmtNumber(entries)} entr{entries === 1 ? "y" : "ies"}</span> },
                            {
                                key: "hours", label: "Hours", value: fmtH((r?.normalMinutes ?? 0) + (r?.overtimeMinutes ?? 0)),
                                sub: <span>{fmtH(r?.normalMinutes ?? 0)} normal · <span className="ot-text">{fmtH(r?.overtimeMinutes ?? 0)} overtime</span></span>,
                            },
                            ...(totals.length ? totals.map((t) => ({
                                key: `pay-${t.currency}`, label: `Pay${totals.length > 1 ? ` · ${t.currency}` : ""}`, value: money.exact(t.total, t.currency),
                                sub: <span>{word === "week" ? "this week's" : `the ${word}'s`} time, at each person's rate</span>,
                            })) : [{ key: "pay", label: "Pay", value: "-", sub: <span>no time logged</span> }]),
                        ]} />
                    </div>

                    <div className="hint mt-s pp-rule">
                        <Icon name="info" />
                        <span>
                            Pay is the hours at each person's hourly rate on the day they were worked - salaried staff at their salary ÷ {HOURS_PER_MONTH.toFixed(1)} h;
                            overtime (outside each person's working hours, or on their days off) × {multiplier ?? "the overtime rate"} - except overtime that made up hours
                            someone was short that month, which counts and is paid as normal time. Amounts in different currencies are totalled separately.
                        </span>
                    </div>

                    {!r ? <div className="panel mt"><div className="panel-body"><SkeletonLines lines={6} /></div></div>
                        : groups.map((g) => <ProjectPanel key={g.projectId} project={g} tile={tiles.get(g.projectId)} canOpenProject={canOpen(permissions, "design", `projects/${g.projectId}`)} />)}

                    {r && !groups.length && (
                        <div className="panel mt">
                            {picked
                                ? <Empty art="search" title={`No time on ${picked.title} in this ${word}`} text="Pick another period, or all Design projects." />
                                : <Empty art="search" title={`No time on Design projects ${current ? `this ${word} yet` : `in this ${word}`}`} text="Pick an earlier period, or a month or quarter to see more." />}
                        </div>
                    )}

                    {groups.length > 0 && hidden > 0 && !picked && (
                        <div className="muted pp-hidden">
                            {hidden} Design project{hidden === 1 ? "" : "s"} with no time logged in this {word} {hidden === 1 ? "is" : "are"} not shown.
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

/** The project's people by department (their team), busiest first. */
function departments(people: ProjectPayPerson[]) {
    const byTeam = new Map<string, ProjectPayPerson[]>();
    for (const p of people) {
        const name = p.team?.name ?? "No department";
        byTeam.set(name, [...(byTeam.get(name) ?? []), p]);
    }
    return [...byTeam.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, rows]) => ({
        name,
        rows: rows.sort((a, b) => b.normalMinutes + b.overtimeMinutes - (a.normalMinutes + a.overtimeMinutes) || a.name.localeCompare(b.name)),
    }));
}

function ProjectPanel({ project: g, tile, canOpenProject }: { project: ProjectPayProject; tile?: Tile; canOpenProject: boolean }) {
    const navigate = useNavigate();
    const people = new Set(g.people.map((p) => p.userId)).size;
    const entries = entriesOf(g);
    const pay = byCurrency(g.pay);
    return (
        <div className="panel mt pp-project">
            <div className="panel-head pp-head">
                <ProjectTile icon={tile?.icon} tint={tile?.tint} size="sm" />
                <div className="grow" style={{ minWidth: 0 }}>
                    {canOpenProject
                        ? <button className="pp-title trunc" title={`Open ${g.title} in Design`} onClick={() => navigate(`/design/projects/${g.projectId}`)}>{g.title}</button>
                        : <div className="pp-title trunc" style={{ cursor: "default" }}>{g.title}</div>}
                    <div className="panel-sub">{g.client ?? "Internal"} · {people} {people === 1 ? "person" : "people"} · {fmtNumber(entries)} entr{entries === 1 ? "y" : "ies"}</div>
                </div>
                <div className="pp-chips">
                    <span className="pp-chip"><span>Hours</span><b className="mono">{fmtH(g.normalMinutes + g.overtimeMinutes)}</b></span>
                    {g.overtimeMinutes > 0 && <span className="pp-chip"><span>Overtime</span><b className="mono ot-text">{fmtH(g.overtimeMinutes)}</b></span>}
                    {pay.map((t) => (
                        <span key={t.currency} className="pp-chip strong"><span>Pay{pay.length > 1 ? ` · ${t.currency}` : ""}</span><b className="mono">{money.exact(t.total, t.currency)}</b></span>
                    ))}
                </div>
            </div>
            <div className="tbl-wrap">
                <table className="tbl pp-tbl">
                    <thead>
                        <tr>
                            <th>Employee</th><th className="r">Entries</th><th className="r">Normal</th><th className="r">Overtime</th><th className="r">Total</th>
                            <th className="r">Hourly rate</th><th className="r">Pay</th>
                        </tr>
                    </thead>
                    <tbody>
                        {departments(g.people).flatMap((d) => [
                            <tr key={`d-${d.name}`} className="pp-dept"><td colSpan={7}>{d.name}</td></tr>,
                            ...d.rows.map((row) => <PersonRow key={`${row.userId}-${row.currency}`} row={row} />),
                        ])}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function PersonRow({ row }: { row: ProjectPayPerson }) {
    const cur = row.currency;
    const note = !row.priced ? "no pay record"
        : `${row.basis === "monthly" && row.monthlySalary != null ? `salary ${money.exact(row.monthlySalary, cur)}/mo` : "hourly"}${row.rateChanged ? " · rate changed" : ""}`;
    return (
        <tr className="pp-emp">
            <td>
                <div className="row" style={{ gap: 9, minWidth: 0 }}>
                    <Avatar person={{ name: row.name, photoFileId: row.photoFileId }} size={26} />
                    <div style={{ minWidth: 0 }}>
                        <div className="trunc" style={{ fontWeight: 600 }}><PersonName person={{ id: row.userId, name: row.name, domain: "design" }} /></div>
                        <div className="muted trunc" style={{ fontSize: 11 }}>{row.position ?? ""}</div>
                    </div>
                </div>
            </td>
            <td className="r mono">{fmtNumber(row.entries)}</td>
            <td className="r mono">{hrs(row.normalMinutes)}</td>
            <td className={cx("r mono", row.overtimeMinutes > 0 && "ot-text")}>{hrs(row.overtimeMinutes)}</td>
            <td className="r mono">{hrs(row.normalMinutes + row.overtimeMinutes)}</td>
            <td className="r nowrap">
                <span className="mono">{money.exact(row.hourlyRate, cur, { cents: true })}/h</span>
                <div className="muted pp-note" title={row.basis === "monthly" && row.monthlySalary != null ? `${money.exact(row.monthlySalary, cur)} a month ÷ ${HOURS_PER_MONTH.toFixed(1)} h` : undefined}>{note}</div>
            </td>
            <td className="r mono pp-pay">{money.exact(row.pay, cur)}</td>
        </tr>
    );
}
