import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { downloadFile, fetchBlob, saveBlob } from "@/api/download";
import { parseCsv } from "@/shared/format/csv";
import { errorMessage } from "@/api/errors";
import { http } from "@/api/http";
import { keys } from "@/api/keys";
import type { Paged, Schemas } from "@/api/types";
import { useCompanySettings } from "@/app/shell/shellQueries";
import { CompositionBar, RankBars } from "@/shared/components/Charts/Bars";
import Waterfall from "@/shared/components/Charts/Waterfall";
import { toast } from "@/shared/components/Feedback/toast";
import { Segmented } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import Logo from "@/shared/components/Identity/Logo";
import Modal from "@/shared/components/Overlays/Modal";
import { PROJECT_STATUS } from "@/shared/components/Data/status";
import { PAYMENT_METHODS } from "@/shared/format/labels";
import { money } from "@/shared/format/money";
import { companyToday, dayKey, daysBetween, fmtDate, fmtDateY, fmtDur, fmtNumber, fmtRange, fmtTime } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { useInvoices, usePayments } from "../../../shared/billing/billingApi";
import { useClient } from "../../../shared/clients/clientsApi";
import type { Project } from "../../../shared/projects/projectsApi";
import { useProjectExpenses } from "../money/moneyApi";
import { useProjectTimeline, useProjectWork } from "../projectWorkApi";
import FilledNote from "@/domains/shared/proton/FilledNote";
import { useProtonForm } from "@/domains/shared/proton/formFill";
import { rangeOptions, type RangeKey } from "../ranges";

type Section = Schemas["ProjectReportSection"];
type Kind = "internal" | "client";

/** The report's sections, in the PDF's order; the client summary leaves out the internal ones. */
const SECTIONS: { key: Section; label: string; client: boolean }[] = [
    { key: "summary", label: "Executive summary", client: true },
    { key: "info", label: "Project information", client: true },
    { key: "timeline", label: "Timeline", client: true },
    { key: "work", label: "Work and labour", client: false },
    { key: "expenses", label: "Project expenses", client: false },
    { key: "financials", label: "Financial summary", client: false },
    { key: "billing", label: "Billing and collections", client: true },
    { key: "client", label: "Client", client: true },
    { key: "log", label: "Work-log appendix", client: true },
];

const EVENTS: Record<string, string> = {
    project_created: "Project created", project_hold: "Put on hold", project_resumed: "Resumed",
    project_completed: "Marked as completed", project_archived: "Archived", project_reopened: "Reopened",
};

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part * 100) / whole)}%` : "-");
/** How many of the CSV's rows the preview shows; the file has them all. */
const CSV_PREVIEW_ROWS = 100;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function Fact({ label, children }: { label: string; children: ReactNode }) {
    return <div><span>{label}</span><b>{children}</b></div>;
}

/** The most recent entries in the range, and how many there are. */
function useRecentEntries(projectId: number, from: string, to: string, enabled: boolean) {
    return useQuery({
        queryKey: [...keys.projects.detail(projectId), "report-log", from, to],
        queryFn: async () => (await http.get<Paged<Schemas["WorkEntryResponse"]>>("/work-entries", { params: { projectId, from, to, page: 1, pageSize: 12 } })).data,
        enabled,
    });
}

/**
 * The project report (the prototype's P.ReportModal): the internal report with everything, or the client
 * summary without costs, rates, profit or margin. The preview is laid out as the server's PDF is; the PDF
 * itself comes from the server.
 */
export default function ReportModal({ project, onClose }: { project: Project; onClose: () => void }) {
    const company = useCompanySettings().data;
    const today = companyToday();
    const [kind, setKind] = useState<Kind>("internal");
    const [rangeKey, setRangeKey] = useState<RangeKey>("all");
    const [on, setOn] = useState<Record<Section, boolean>>({ summary: true, info: true, timeline: true, work: true, expenses: true, financials: true, billing: true, client: true, log: false });
    const [working, setWorking] = useState(false);
    // the PDF report, or the work entries as a spreadsheet: a format is previewed, and only downloaded when asked
    const [format, setFormat] = useState<"pdf" | "csv">("pdf");
    const ranges = rangeOptions(project, today);
    // Proton sets the report's kind, format and period (one of the periods offered here; another is left to the person)
    const proton = useProtonForm("report_options", project.id, (fill) => {
        const v = fill.reportOptions;
        const done: string[] = [];
        if (!v) return done;
        if (v.kind && v.kind !== kind) { setKind(v.kind); done.push("report"); }
        if (v.csv != null && (v.csv ? "csv" : "pdf") !== format) { setFormat(v.csv ? "csv" : "pdf"); done.push("format"); }
        const period = (Object.keys(ranges) as RangeKey[]).find((k) => (!v.from || ranges[k].from === v.from) && (!v.to || ranges[k].to === v.to) && (v.from || v.to));
        if (period && period !== rangeKey) { setRangeKey(period); done.push("period"); }
        return done;
    });
    const picked = ranges[rangeKey];
    const range = { label: picked.label, from: picked.from ?? project.startDate, to: picked.to ?? today };
    const client = kind === "client";
    const internalProject = project.billingType === "internal";
    const m = project.money;
    const show = (k: Section) => on[k] && !(client && !SECTIONS.find((s) => s.key === k)!.client) && !(k === "billing" && internalProject);

    const work = useProjectWork(project.id, { from: range.from, to: range.to }).data;
    const timeline = useProjectTimeline(project.id).data;
    const expenses = useProjectExpenses(project.id, true).data;
    const invoices = useInvoices({ projectId: project.id, pageSize: 100 }).data?.items ?? [];
    const payments = usePayments({ projectId: project.id, pageSize: 100 }).data?.items ?? [];
    const who = useClient(project.client?.id).data;
    const log = useRecentEntries(project.id, range.from, range.to, show("log")).data;

    const contributors = work?.contributors ?? [];
    const minutes = contributors.reduce((t, c) => t + c.minutes, 0);
    const overtime = contributors.reduce((t, c) => t + c.overtimeMinutes, 0);
    const entries = contributors.reduce((t, c) => t + c.entries, 0);
    const labour = contributors.reduce((t, c) => t + (c.labourCost?.usd ?? 0), 0);
    const end = project.completedAt ? dayKey(project.completedAt) : today;
    const done = project.completedAt != null;
    const worked = (timeline?.days ?? []).filter((d) => d.minutes > 0).map((d) => d.day).sort();
    const weekly = work?.weekly ?? [];
    const issued = invoices.filter((i) => i.status !== "void" && i.status !== "draft");
    const received = payments.filter((p) => !p.voidedAt);
    const sections = SECTIONS.filter((s) => show(s.key)).map((s) => s.key);
    const title = client ? "Project summary" : "Project report";
    // the name the server gives the PDF
    const fileName = `project-${project.id}-${client ? "client-summary" : "report"}-${today}.pdf`;
    const categories = new Map<string, number>();
    for (const x of expenses?.items ?? []) if (x.currency === "USD") categories.set(x.category, (categories.get(x.category) ?? 0) + x.amount);

    async function pdf() {
        setWorking(true);
        try {
            await downloadFile(`/projects/${project.id}/report`, fileName, { kind, from: range.from, to: range.to, sections });
            toast({ text: `Report ready - ${fileName}`, icon: "file" });
        } catch (e) {
            toast({ text: "The report wasn't generated", sub: errorMessage(e), icon: "alert" });
        } finally {
            setWorking(false);
        }
    }
    // the very file the download saves, fetched once for the preview
    const csvName = `project-${slug(project.title)}-${range.from}-to-${range.to}.csv`;
    const csvFile = useQuery({
        queryKey: [...keys.projects.detail(project.id), "report-csv", range.from, range.to],
        queryFn: async () => {
            const file = await fetchBlob("/work-entries/export", { projectId: project.id, from: range.from, to: range.to });
            return { ...file, rows: parseCsv(await file.blob.text()) };
        },
        enabled: format === "csv",
    });
    function csv() {
        if (!csvFile.data) return;
        const name = csvFile.data.fileName ?? csvName;
        saveBlob(csvFile.data.blob, name);
        toast({ text: `Exported ${name}`, sub: `${Math.max(0, csvFile.data.rows.length - 1)} work entries`, icon: "download" });
    }

    return (
        <Modal surfaceId="project_report" size="xl" flush onClose={onClose} title={format === "csv" ? "Work entries (CSV)" : client ? "Client summary" : "Project report"} sub={`${project.title} · ${range.label}`}
            foot={format === "csv" ? (
                <>
                    <div className="grow"><span className="muted">Every work entry in the range, one per row, for a spreadsheet</span></div>
                    <button className="btn" onClick={onClose}>Close</button>
                    <button className="btn btn-primary" disabled={!csvFile.data} onClick={csv}><Icon name="download" />Download CSV</button>
                </>
            ) : (
                <>
                    <div className="grow"><span className="muted">{client ? "Safe to share - no costs, rates, profit or margin" : "Internal - contains cost and profit information"}</span></div>
                    <button className="btn" onClick={onClose}>Close</button>
                    <button className="btn btn-primary" disabled={working} onClick={pdf}><Icon name="download" />{working ? "Generating…" : "Download PDF"}</button>
                </>
            )}>
            <FilledNote fields={proton.filled} />
            <div className="rep-split" style={{ display: "flex", minHeight: 460, maxHeight: "68vh" }}>
                {format === "csv" ? <CsvPreview file={csvFile} name={csvName} retry={() => void csvFile.refetch()} /> : (
                <div className="rep-shell">
                    <div className="rep-page">
                        <div className="rep-head">
                            <Logo size={34} />
                            <div className="grow">
                                <div className="rep-title">{project.title}</div>
                                <div style={{ fontSize: 12, color: "#46514F" }}>{title} · {range.label} · {company?.name ?? ""}</div>
                            </div>
                            <div style={{ textAlign: "right", fontSize: 11, color: "#6B7674" }}>
                                <div>Generated {fmtDateY(today)}</div>
                                <div className="mono">{fmtTime(new Date())}</div>
                                <div className="mono">Reference {project.id}</div>
                            </div>
                        </div>

                        {show("summary") && (
                            <div className="rep-sec">
                                <h3>Executive summary</h3>
                                <div className="rep-sum">
                                    <Fact label="Client">{project.client?.displayName ?? "Internal project"}</Fact>
                                    <Fact label="Status">{PROJECT_STATUS[project.status]?.label ?? project.status}</Fact>
                                    <Fact label="Duration">{fmtNumber(daysBetween(project.startDate, end) + 1)} days</Fact>
                                    <Fact label="Team">{contributors.length} {contributors.length === 1 ? "person" : "people"}</Fact>
                                    <Fact label="Hours logged">{fmtDur(minutes)}</Fact>
                                    {m && !internalProject && <Fact label="Project value">{money.exact(m.revenue)}</Fact>}
                                    {m && !client && <Fact label="Total cost">{money.exact(m.cost.total)}</Fact>}
                                    {m && !client && <Fact label={internalProject ? "Company cost" : done ? "Final profit" : "Profit so far"}>{money.exact(internalProject ? m.cost.total : m.profit)}</Fact>}
                                    {m && !client && !internalProject && <Fact label="Margin">{money.pct(m.margin)}</Fact>}
                                    {m && !internalProject && <Fact label="Invoiced">{money.exact(m.billing.invoiced)}</Fact>}
                                    {m && !internalProject && <Fact label="Paid">{money.exact(m.billing.received)}</Fact>}
                                    {m && !internalProject && <Fact label="Outstanding">{money.exact(m.billing.outstanding)}</Fact>}
                                </div>
                                {!client && (
                                    <p style={{ marginTop: 12, fontSize: 11, color: "#6B7674" }}>
                                        Profitability and collections are two separate measures. Profit is what the work earned; outstanding is money still to arrive. Neither one moves the other.
                                    </p>
                                )}
                            </div>
                        )}

                        {show("info") && (
                            <div className="rep-sec">
                                <h3>Project information</h3>
                                <div className="rep-sum">
                                    <Fact label="Reference">{project.id}</Fact>
                                    <Fact label="Owner">{project.owner.name}</Fact>
                                    <Fact label="Start date">{fmtDateY(project.startDate)}</Fact>
                                    <Fact label={done ? "Completion date" : "Target date"}>{done ? fmtDateY(end) : project.targetDate ? fmtDateY(project.targetDate) : "-"}</Fact>
                                    <Fact label="Progress">{project.progressPct}%</Fact>
                                    <Fact label="Work entries">{fmtNumber(entries)}</Fact>
                                </div>
                                {project.description && <p style={{ marginTop: 12, fontSize: 12, color: "#46514F" }}>{project.description}</p>}
                            </div>
                        )}

                        {show("timeline") && timeline && (
                            <div className="rep-sec">
                                <h3>Timeline</h3>
                                <div className="rep-sum">
                                    <Fact label="First work entry">{worked.length ? fmtDateY(worked[0]) : "-"}</Fact>
                                    <Fact label="Last work entry">{worked.length ? fmtDateY(worked[worked.length - 1]) : "-"}</Fact>
                                    <Fact label="Active weeks">{weekly.filter((w) => w.minutes > 0).length} of {weekly.length}</Fact>
                                    <Fact label="Quiet periods">{timeline.gaps.length ? `${timeline.gaps.length} recorded` : "none"}</Fact>
                                </div>
                                {timeline.events.length > 0 && (
                                    <div style={{ marginTop: 10 }}>
                                        <table className="tbl">
                                            <thead><tr><th>Date</th><th>Event</th></tr></thead>
                                            <tbody>
                                                {timeline.events.map((e, i) => (
                                                    <tr key={i}>
                                                        <td className="nowrap">{fmtDateY(e.occurredAt)}</td>
                                                        <td>{e.kind === "progress_set" ? `Progress set to ${Math.round(e.amount ?? 0)}%` : EVENTS[e.kind] ?? e.kind.replace(/_/g, " ")}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {show("work") && (
                            <div className="rep-sec">
                                <h3>Work and labour</h3>
                                <table className="tbl">
                                    <thead><tr><th>Employee</th><th className="r">Entries</th><th className="r">Overtime</th><th className="r">Hours</th><th className="r">Share</th><th className="r">Labour cost</th><th className="r">Of cost</th></tr></thead>
                                    <tbody>
                                        {contributors.map((c) => (
                                            <tr key={c.userId}>
                                                <td><b>{c.name}</b></td>
                                                <td className="r num">{c.entries}</td>
                                                <td className="r mono">{c.overtimeMinutes ? fmtDur(c.overtimeMinutes) : "-"}</td>
                                                <td className="r mono">{fmtDur(c.minutes)}</td>
                                                <td className="r mono">{pct(c.minutes, minutes)}</td>
                                                <td className="r mono">
                                                    {money.exact(c.labourCost?.usd ?? 0)}
                                                    {c.labourCost?.unconverted.length ? <div style={{ fontSize: 10 }}>+ {c.labourCost.unconverted.map((a) => money.short(a.amount, a.currency)).join(" + ")}</div> : null}
                                                </td>
                                                <td className="r mono">{pct(c.labourCost?.usd ?? 0, labour)}</td>
                                            </tr>
                                        ))}
                                        <tr>
                                            <td><b>Total</b></td><td className="r num"><b>{entries}</b></td><td className="r mono"><b>{fmtDur(overtime)}</b></td>
                                            <td className="r mono"><b>{fmtDur(minutes)}</b></td><td className="r mono">100%</td>
                                            <td className="r mono"><b>{money.exact(labour)}</b></td><td className="r mono">100%</td>
                                        </tr>
                                    </tbody>
                                </table>
                                <p style={{ marginTop: 8, fontSize: "10.5px", color: "#6B7674" }}>
                                    Labour is each of the {fmtNumber(entries)} work entries at the hourly rate in force on its day, with the paid break of each day worked.
                                    {m ? ` Effective cost ${money.exact(m.costPerHour)} per hour over the whole project.` : ""}
                                </p>
                            </div>
                        )}

                        {show("expenses") && expenses && (
                            <div className="rep-sec">
                                <h3>Project expenses</h3>
                                {expenses.items.length ? (
                                    <table className="tbl">
                                        <thead><tr><th>Date</th><th>Expense</th><th>Category</th><th className="r">Amount</th></tr></thead>
                                        <tbody>
                                            {[...expenses.items].sort((a, b) => a.spentOn.localeCompare(b.spentOn)).map((x) => (
                                                <tr key={x.id}><td className="nowrap">{fmtDateY(x.spentOn)}</td><td>{x.label}</td><td className="muted">{x.category}</td><td className="r mono">{money.exact(x.amount, x.currency)}</td></tr>
                                            ))}
                                            {expenses.totals.map((t) => <tr key={t.currency}><td colSpan={3}><b>Total</b></td><td className="r mono"><b>{money.exact(t.total, t.currency)}</b></td></tr>)}
                                        </tbody>
                                    </table>
                                ) : <p style={{ fontSize: 12, color: "#46514F" }}>No project expenses were recorded.</p>}
                                {categories.size > 0 && (
                                    <div style={{ marginTop: 10 }}>
                                        <RankBars format={(v) => money.short(v)} unit="Expenses" showPct
                                            items={[...categories].map(([k, v]) => ({ label: k.charAt(0).toUpperCase() + k.slice(1), value: v })).sort((a, b) => b.value - a.value)} />
                                    </div>
                                )}
                            </div>
                        )}

                        {show("financials") && m && (
                            <div className="rep-sec">
                                <h3>{internalProject ? "Cost summary" : "Financial summary"}</h3>
                                <div className="rep-sum">
                                    {!internalProject && <Fact label="Project value">{money.exact(m.revenue)}</Fact>}
                                    <Fact label="Employee labour">{money.exact(m.cost.labour)}</Fact>
                                    <Fact label="Project expenses">{money.exact(m.cost.expenses)}</Fact>
                                    <Fact label="Total cost">{money.exact(m.cost.total)}</Fact>
                                    {!internalProject && <Fact label={done ? "Final profit" : "Profit so far"}>{money.exact(m.profit)}</Fact>}
                                    {!internalProject && <Fact label="Margin">{money.pct(m.margin)}</Fact>}
                                    <Fact label="Cost per hour">{money.exact(m.costPerHour)}</Fact>
                                </div>
                                <div style={{ marginTop: 12 }}>
                                    {internalProject ? (
                                        <CompositionBar height={16} parts={[{ label: "Employee labour", value: m.cost.labour, color: "var(--heat-3)" }, { label: "Project expenses", value: m.cost.expenses, color: "var(--heat-1)" }]} />
                                    ) : (
                                        <Waterfall height={180} steps={[
                                            { label: "Value", value: m.revenue, kind: "start" },
                                            { label: "Labour", value: m.cost.labour, kind: "cost", sub: `${Math.round(m.labourHours)}h` },
                                            { label: "Expenses", value: m.cost.expenses, kind: "cost" },
                                            { label: done ? "Final profit" : "Profit", value: 0, kind: "result" },
                                        ]} />
                                    )}
                                </div>
                                <p style={{ marginTop: 8, fontSize: 11, color: "#6B7674" }}>
                                    Company expenses are excluded: subscriptions, rent and other running costs are charged to the company's monthly result, never to a single project.
                                    Client payments do not appear here either: cash has no effect on profit or margin.
                                </p>
                            </div>
                        )}

                        {show("billing") && m && (
                            <div className="rep-sec">
                                <h3>Billing and collections</h3>
                                <div className="rep-sum">
                                    <Fact label="Project value">{money.exact(m.revenue)}</Fact>
                                    <Fact label="Invoiced">{money.exact(m.billing.invoiced)}</Fact>
                                    <Fact label="Paid">{money.exact(m.billing.received)}</Fact>
                                    <Fact label="Outstanding">{money.exact(m.billing.outstanding)}</Fact>
                                </div>
                                {issued.length ? (
                                    <table className="tbl" style={{ marginTop: 10 }}>
                                        <thead><tr><th>Invoice</th><th>Issued</th><th>Due</th><th className="r">Amount</th><th className="r">Paid</th><th className="r">Balance</th><th>Status</th></tr></thead>
                                        <tbody>
                                            {issued.map((i) => (
                                                <tr key={i.id}>
                                                    <td className="mono">{i.number}</td>
                                                    <td className="nowrap">{i.issuedAt ? fmtDate(i.issuedAt) : "-"}</td>
                                                    <td className="nowrap">{i.dueOn ? fmtDate(i.dueOn) : "-"}</td>
                                                    <td className="r mono">{money.exact(i.total, i.currency)}</td>
                                                    <td className="r mono">{money.exact(i.paid ?? 0, i.currency)}</td>
                                                    <td className="r mono">{money.exact(i.balance ?? i.total, i.currency)}</td>
                                                    <td>{i.isOverdue ? "Overdue" : i.status === "partial" ? "Part paid" : i.status.charAt(0).toUpperCase() + i.status.slice(1)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : <p style={{ fontSize: 12, color: "#46514F", marginTop: 8 }}>No invoice has been issued yet.</p>}
                                {received.length > 0 && (
                                    <table className="tbl" style={{ marginTop: 10 }}>
                                        <thead><tr><th>Received</th><th>Against</th><th>Method</th><th>Reference</th><th className="r">Amount</th></tr></thead>
                                        <tbody>
                                            {[...received].sort((a, b) => b.receivedOn.localeCompare(a.receivedOn)).map((p) => (
                                                <tr key={p.id}>
                                                    <td className="nowrap">{fmtDateY(p.receivedOn)}</td>
                                                    <td className="mono">{p.invoiceNumber ?? "On account"}</td>
                                                    <td>{PAYMENT_METHODS[p.method] ?? p.method}</td>
                                                    <td className="muted">{p.reference || "-"}</td>
                                                    <td className="r mono">{money.exact(p.amountUsd)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                                {m.billing.outstanding > 0 && (
                                    <p style={{ marginTop: 8, fontSize: 11, color: "#6B7674" }}>{money.exact(m.billing.outstanding)} remains outstanding. A completed project can still be owed money.</p>
                                )}
                            </div>
                        )}

                        {show("client") && who && (
                            <div className="rep-sec">
                                <h3>Client</h3>
                                <div className="rep-sum">
                                    <Fact label="Client">{who.displayName}</Fact>
                                    <Fact label="Contact">{who.name}</Fact>
                                    <Fact label="Client since">{fmtDateY(who.createdAt)}</Fact>
                                    <Fact label="Projects to date">{who.projectCount}</Fact>
                                </div>
                                {who.contacts.length > 0 && <div style={{ marginTop: 8, fontSize: 12, color: "#46514F" }}>{who.contacts.map((c) => c.value).join(" · ")}</div>}
                            </div>
                        )}

                        {show("log") && log && (
                            <div className="rep-sec">
                                <h3>Work log (most recent {log.items.length} of {fmtNumber(log.totalCount)})</h3>
                                <table className="tbl">
                                    <thead><tr><th>Date</th><th>Time</th><th className="r">Duration</th><th>Employee</th><th>Work</th></tr></thead>
                                    <tbody>
                                        {log.items.map((e) => (
                                            <tr key={e.id}>
                                                <td className="nowrap">{fmtDate(e.startedAt)}</td>
                                                <td className="mono nowrap">{fmtRange(e.startedAt, e.endedAt)}</td>
                                                <td className="r mono nowrap">{fmtDur(e.minutes)}</td>
                                                <td className="nowrap">{e.person.name}</td>
                                                <td>{e.description}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="rep-foot">
                            <span>{company?.name ?? ""} · {client ? `Prepared for ${project.client?.displayName ?? "the client"}` : "Internal - contains cost and profit information"}</span>
                            <span className="mono">{fileName} · page 1</span>
                        </div>
                    </div>
                </div>

                )}
                <div className="rep-opts">
                    {format === "pdf" && <>
                    <div className="u">Report type</div>
                    <Segmented stretch className="mt-s" value={kind} onChange={setKind} aria-label="Report type"
                        options={[{ value: "internal", label: "Internal" }, { value: "client", label: "Client" }]} />
                    <p className="hint">{client ? "Hours, timeline and billing only. No rates, labour cost, expenses, profit or margin." : "The full picture, including everything the client never sees."}</p>

                    <div className="field mt">
                        <label className="label required" htmlFor="rep-range">Date range</label>
                        <Select id="rep-range" className="select sm" value={rangeKey} onChange={(v) => setRangeKey(v as RangeKey)}
                            options={(Object.keys(ranges) as RangeKey[]).map((k) => ({ value: k, label: ranges[k].label }))} />
                    </div>

                    </>}
                    {format === "pdf" && <>
                    <div className="u mt">Sections</div>
                    {SECTIONS.filter((s) => !(s.key === "billing" && internalProject)).map((s) => {
                        const blocked = client && !s.client;
                        return (
                            <div key={s.key} className={cx("switch-row", blocked && "off")}>
                                <button className="switch" role="switch" aria-checked={!blocked && on[s.key]} aria-label={s.label} disabled={blocked}
                                    onClick={() => setOn({ ...on, [s.key]: !on[s.key] })} />
                                <div className="grow">
                                    <div style={{ fontWeight: 600, fontSize: "12.5px" }}>{s.label}</div>
                                    {blocked && <p style={{ fontSize: 11 }}>Internal only</p>}
                                </div>
                            </div>
                        );
                    })}

                    </>}
                    <div className="u mt">Format</div>
                    <Segmented stretch className="mt-s" value={format} onChange={setFormat} aria-label="Format"
                        options={[{ value: "pdf", label: "PDF" }, { value: "csv", label: "CSV" }]} />
                    {format === "csv" && <p className="hint">The work entries in the date range, as a spreadsheet. Report type and sections are for the PDF.</p>}
                    <p className="hint mt">This is the internal record of the work. The client-facing request for money is the invoice - a separate document with no hours, rates or costs on it.</p>
                </div>
            </div>
        </Modal>
    );
}

/** The CSV as it will be saved: its columns and first rows, with how many there are. */
function CsvPreview({ file, name, retry }: {
    file: { data?: { rows: string[][] }; error: unknown; isError: boolean };
    name: string;
    retry: () => void;
}) {
    const [head = [], ...body] = file.data?.rows ?? [];
    return (
        <div className="rep-shell csv-preview">
            <div className="csv-title"><Icon name="file" /><b>CSV</b><span className="muted mono">{name}</span></div>
            {file.isError ? (
                <div className="load-err">
                    <span className="err">{errorMessage(file.error)}</span> <button className="link" onClick={retry}>Try again</button>
                </div>
            ) : !file.data ? <p className="muted">Preparing the preview…</p>
                : body.length === 0 ? <p className="muted">No work was logged in this range: the file would hold only its column names.</p> : (
                <>
                    <div className="tbl-wrap">
                        <table className="tbl">
                            <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                            <tbody>
                                {body.slice(0, CSV_PREVIEW_ROWS).map((r, i) => <tr key={i}>{head.map((_, j) => <td key={j}>{r[j] ?? ""}</td>)}</tr>)}
                            </tbody>
                        </table>
                    </div>
                    <p className="hint mt-s">
                        {body.length > CSV_PREVIEW_ROWS ? `The first ${CSV_PREVIEW_ROWS} of ${body.length} rows - the file has them all.` : `${body.length} row${body.length === 1 ? "" : "s"}.`}
                    </p>
                </>
            )}
        </div>
    );
}
