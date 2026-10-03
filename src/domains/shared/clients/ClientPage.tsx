import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { errorMessage, isStatus } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useDomain } from "@/app/routing/domainContext";
import { MissingRecord } from "@/app/pages/NotFound";
import { CompositionBar, RankBars } from "@/shared/components/Charts/Bars";
import Columns from "@/shared/components/Charts/Columns";
import Figure from "@/shared/components/Charts/Figure";
import Waterfall from "@/shared/components/Charts/Waterfall";
import { ProjectTile } from "@/shared/components/Data/Bits";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import { CostRow, Money } from "@/shared/components/Data/Money";
import Panel from "@/shared/components/Data/Panel";
import { MarginPill, StatusBadge } from "@/shared/components/Data/Pills";
import DataTable, { type Column } from "@/shared/components/Data-Tables/DataTable";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import Skeleton, { SkeletonKpis, SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import { PersonAvatar } from "@/shared/components/Identity/People";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { PAYMENT_METHODS, plural } from "@/shared/format/labels";
import { fmtDate, fmtDateY, fmtH, fmtMonthY, MONTHS, partsOf } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import RecentActivity from "../activity/RecentActivity";
import { BillingMeter, InvoiceLine } from "../billing/BillingBits";
import BillingModalHost from "../billing/BillingModalHost";
import { useBillingLinks } from "../billing/billingLinks";
import { useInvoices, usePayments } from "../billing/billingApi";
import { useProjects, type ProjectSummary } from "../projects/projectsApi";
import { ClientMark, ContactRow } from "./ClientBits";
import ClientModal from "./ClientModal";
import { useArchiveClient, useClient, useDeleteClient, type Client } from "./clientsApi";
import { loadFailed } from "@/api/queryState";

const COLOURS = { labour: "var(--heat-3)", expense: "var(--heat-1)" };

/** A client (the prototype's P.AdminClient). */
export default function ClientPage() {
    const { id } = useParams();
    const domain = useDomain();
    const clientId = Number(id);
    const query = useClient(Number.isInteger(clientId) && clientId > 0 ? clientId : null);
    if (!(Number.isInteger(clientId) && clientId > 0) || isStatus(query.error, 404)) return <MissingRecord title="Client not found" to={`/${domain}/clients`} back="Back to clients" />;
    if (loadFailed(query)) return <div className="page"><LoadError error={query.error} retry={() => query.refetch()} what="the client" /></div>;
    if (!query.data) {
        return (
            <div className="page" aria-busy="true">
                <div className="crumbs"><Skeleton width={140} height={10} /></div>
                <div className="page-head"><div className="row start" style={{ gap: 14 }}><Skeleton width={46} height={46} style={{ borderRadius: 12 }} /><div><Skeleton width={220} height={20} /><Skeleton width={300} height={11} style={{ marginTop: 10 }} /></div></div></div>
                <SkeletonKpis count={6} />
            </div>
        );
    }
    return <ClientView client={query.data} />;
}

function ClientView({ client }: { client: Client }) {
    const domain = useDomain();
    const navigate = useNavigate();
    const permissions = usePermissions();
    const seesMoney = permissions.has(P.FINANCIAL_VIEW);
    const canManage = permissions.has(P.CLIENT_MANAGE);
    const archive = useArchiveClient(client.id);
    const remove = useDeleteClient(client.id);
    const [showEdit, setShowEdit] = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    // The list gives each project its tile; money viewers get the figures from the client itself.
    const projects = useProjects({ domain, clientId: client.id, sort: "start", pageSize: 100 }, permissions.has(P.PROJECT_VIEW));
    // A client rarely has more than a page of invoices; the oldest overdue one is found among them.
    const invoices = useInvoices({ clientId: client.id, pageSize: 50 }, seesMoney);
    const payments = usePayments({ clientId: client.id, pageSize: 4 }, seesMoney);

    const m = seesMoney ? client.money : null;
    const w = client.work;
    const firstProject = client.projectMoney?.map((p) => p.startDate).sort()[0];
    const canDelete = client.projectCount === 0;
    const liveInvoices = invoices.data?.items.filter((i) => i.status !== "void") ?? [];
    const billingLinks = useBillingLinks();
    const oldest = liveInvoices
        .filter((i) => i.isOverdue && (i.balance ?? 0) > 0.5 && i.dueOn)
        .sort((a, b) => a.dueOn!.localeCompare(b.dueOn!))[0];
    const newProject = () => navigate(`/${domain}/projects?new=1&client=${client.id}`);

    function toggleArchive() {
        archive.mutate(!client.isArchived, {
            onSuccess: () => toast({
                text: `${client.displayName} ${client.isArchived ? "restored" : "archived"}`,
                sub: client.isArchived ? undefined : "Hidden from pickers - projects and history are unchanged.",
                icon: "archive",
            }),
            onError: (e) => toast({ text: "That didn't save", sub: errorMessage(e), icon: "alert" }),
        });
    }

    return (
        <div className="page">
            <div className="crumbs">
                <Link to={`/${domain}/clients`}>Clients</Link>
                <Icon name="chevronRight" /><span>{client.displayName}</span>
            </div>

            <div className="page-head">
                <div className="row start" style={{ gap: 14, minWidth: 0 }}>
                    <ClientMark name={client.displayName} large />
                    <div style={{ minWidth: 0 }}>
                        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                            <h1 className="page-title">{client.displayName}</h1>
                            {client.label && <span className="badge">{client.label}</span>}
                            {client.isArchived && <span className="badge badge-archived">Archived</span>}
                        </div>
                        <div className="page-sub">{client.organisation ? client.name : "No organisation on file"}{client.note ? ` · ${client.note}` : ""}</div>
                        <div className="row wrap mt-s" style={{ gap: 14, fontSize: 12, color: "var(--ink-3)" }}>
                            <span className="row" style={{ gap: 6 }}><Icon name="calendar" style={{ width: 14, height: 14 }} />Added <b className="sec">{fmtDateY(client.createdAt)}</b></span>
                            {firstProject && (
                                <span className="row" style={{ gap: 6 }}><Icon name="projects" style={{ width: 14, height: 14 }} />First project <b className="sec">{fmtDateY(firstProject)}</b></span>
                            )}
                            <span className="row" style={{ gap: 6 }}><Icon name="lock" style={{ width: 14, height: 14 }} />No platform access</span>
                        </div>
                    </div>
                </div>
                <div className="page-actions">
                    {canManage && <button className="btn" onClick={() => setShowEdit(true)}><Icon name="edit" />Edit</button>}
                    {permissions.has(P.PROJECT_CREATE) && !client.isArchived && (
                        <button className="btn btn-primary" onClick={newProject}><Icon name="plus" />New project</button>
                    )}
                    {canManage && (
                        <MenuButton icon="dots" label="Client actions" width={230}>
                            {(close) => (
                                <div>
                                    <button className="pop-item" onClick={() => { close(); toggleArchive(); }}>
                                        <Icon name="archive" />{client.isArchived ? "Restore client" : "Archive client"}
                                    </button>
                                    <button className={cx("pop-item", !canDelete && "muted")} onClick={() => { close(); setShowDelete(true); }}>
                                        <Icon name="trash" />Delete client
                                    </button>
                                </div>
                            )}
                        </MenuButton>
                    )}
                </div>
            </div>

            {client.isArchived && (
                <div className="banner mt-s" style={{ marginBottom: 14 }}>
                    <Icon name="archive" />
                    <div className="grow"><b>Archived.</b> Hidden from client pickers - their {plural(client.projectCount, "project")} and all history stay exactly as they are.</div>
                </div>
            )}

            <KpiStrip items={[
                { key: "projects", label: "Projects", value: client.projectCount, sub: m ? <span>{m.activeProjects} active · {m.completedProjects} completed</span> : undefined },
                ...(w ? [{ key: "hours", label: "Hours worked", value: w.totalMinutes ? fmtH(w.totalMinutes) : "-", sub: <span>{plural(w.contributorCount, "person", "people")} · {w.entryCount.toLocaleString("en-US")} entries</span> }] : []),
                ...(m ? [
                    { key: "revenue", label: "Revenue", value: money.short(m.revenue), sub: <span>{money.short(m.billing.received)} received so far</span> },
                    { key: "cost", label: "Cost", value: money.short(m.cost.total), sub: <span>labour {money.short(m.cost.labour)} · expenses {money.short(m.cost.expenses)}</span> },
                    { key: "profit", label: "Profit", value: money.short(m.profit), sub: <span>payment less labour and expenses</span> },
                    {
                        key: "margin", label: "Margin", value: m.revenue && m.marginKnown ? money.pct(m.margin) : "-",
                        sub: <span>{m.completedRevenue ? `${money.pct(m.completedMargin)} on completed work` : "no completed projects yet"}</span>,
                    },
                ] : []),
            ]} />

            {client.projectCount === 0 ? (
                <div className="panel mt">
                    <Empty art="projects" title="No projects for this client yet"
                        text="Create one and every hour logged against it will flow into this page - revenue, cost, profit and margin."
                        action={permissions.has(P.PROJECT_CREATE) && !client.isArchived && (
                            <button className="btn btn-primary" onClick={newProject}><Icon name="plus" />New project for {client.displayName}</button>
                        )} />
                    {client.contacts.length > 0 && (
                        <div className="panel-body">
                            <div className="u" style={{ marginBottom: 8 }}>Contact</div>
                            {client.contacts.map((c) => <ContactRow key={c.id} contact={c} />)}
                        </div>
                    )}
                </div>
            ) : (
                <>
                    {m ? (
                        <div className="panel mt">
                            <div className="money-band">
                                <div>
                                    <div className="money-head">
                                        <span className="u">Profit from this client</span>
                                        <span className="muted" style={{ fontSize: "11.5px" }}>across {plural(m.projects, "project")}</span>
                                    </div>
                                    <div className="row wrap" style={{ gap: 12, alignItems: "baseline", margin: "2px 0 6px" }}>
                                        <Money value={m.profit} size="xl" tone="auto" />
                                        <MarginPill value={m.marginKnown ? m.margin : null} />
                                        {m.activeProjects > 0 && (
                                            <span className="muted" style={{ fontSize: "11.5px" }}>
                                                {plural(m.activeProjects, "project")} still running - {money.short(Math.max(0, m.revenue - m.billing.received))} of the agreed payments still to collect
                                            </span>
                                        )}
                                    </div>
                                    <Waterfall height={200} steps={[
                                        { label: "Revenue", value: m.revenue, kind: "start" },
                                        { label: "Labour", value: m.cost.labour, kind: "cost", sub: `${Math.round(m.hours)}h` },
                                        { label: "Expenses", value: m.cost.expenses, kind: "cost" },
                                        { label: "Profit", value: 0, kind: "result" },
                                    ]} />
                                </div>
                                <div>
                                    <div className="u" style={{ marginBottom: 8 }}>Contact</div>
                                    {client.contacts.map((c) => <ContactRow key={c.id} contact={c} />)}
                                    <div className="u" style={{ margin: "14px 0 6px" }}>Cost composition</div>
                                    <CompositionBar parts={[
                                        { label: "Employee labour", value: m.cost.labour, color: COLOURS.labour },
                                        { label: "Project expenses", value: m.cost.expenses, color: COLOURS.expense },
                                    ]} />
                                </div>
                            </div>
                        </div>
                    ) : client.contacts.length > 0 && (
                        <Panel className="mt" title="Contact">{client.contacts.map((c) => <ContactRow key={c.id} contact={c} />)}</Panel>
                    )}

                    {m && (
                        <div className="panel mt bill-panel">
                            <div className="money-band">
                                <div>
                                    <div className="money-head">
                                        <span className="u">Client payments</span>
                                        <span className="muted" style={{ fontSize: "11.5px" }}>cash received - separate from revenue and profit</span>
                                    </div>
                                    <div className="row wrap" style={{ gap: 12, alignItems: "baseline", margin: "2px 0 10px" }}>
                                        <Money value={m.billing.received} size="xl" />
                                        <span className="muted" style={{ fontSize: 12 }}>of {money.fmt(m.revenue)} contracted</span>
                                        {m.billing.overdue > 0.5 ? <span className="badge inv-overdue"><Icon name="alert" />{money.fmt(m.billing.overdue)} overdue</span>
                                            : m.billing.outstanding > 0.5 ? <span className="badge">{money.fmt(m.billing.outstanding)} outstanding</span>
                                                : m.billing.invoiced > 0.5 ? <span className="badge inv-paid"><Icon name="checkCircle" />All settled</span> : null}
                                    </div>
                                    <BillingMeter height={18} value={m.revenue} invoiced={m.billing.invoiced} paid={m.billing.received}
                                        outstanding={m.billing.outstanding} notYetInvoiced={m.billing.notYetInvoiced} />
                                    <div className="mt">
                                        <CostRow label="Invoiced" value={money.fmt(m.billing.invoiced)} meta={invoices.data ? plural(liveInvoices.filter((i) => i.status !== "draft").length, "invoice") : undefined} />
                                        <CostRow label="Paid" value={money.fmt(m.billing.received)} meta={payments.data?.items[0] ? `last ${fmtDate(payments.data.items[0].receivedOn)}` : undefined} />
                                        <CostRow label="Outstanding" value={money.fmt(m.billing.outstanding)} tone={m.billing.overdue > 0.5 ? "down" : ""}
                                            meta={oldest ? `oldest ${oldest.number} · due ${fmtDate(oldest.dueOn!)}` : undefined} />
                                        <CostRow label="Not yet invoiced" value={money.fmt(m.billing.notYetInvoiced)} meta={m.billing.drafts > 0.5 ? `${money.fmt(m.billing.drafts)} in draft` : undefined} />
                                    </div>
                                </div>
                                <div>
                                    <div className="u" style={{ marginBottom: 6 }}>Invoices</div>
                                    {invoices.isPending ? <SkeletonLines lines={3} />
                                        : loadFailed(invoices) ? <LoadError error={invoices.error} retry={() => invoices.refetch()} what="the invoices" />
                                            : liveInvoices.length
                                                ? liveInvoices.slice(0, 6).map((inv) => <InvoiceLine key={inv.id} invoice={inv} onOpen={() => billingLinks.openInvoice(inv.id)} />)
                                                : <p className="muted" style={{ padding: "6px 0" }}>Nothing has been invoiced to this client yet.</p>}
                                    <div className="row wrap mt" style={{ gap: 8 }}>
                                        <button className="btn btn-sm" onClick={() => navigate(`/${domain}/financials?tab=billing`)}><Icon name="external" />Billing overview</button>
                                    </div>
                                    <div className="u" style={{ margin: "14px 0 6px" }}>Recent payments</div>
                                    {payments.data?.items.filter((p) => !p.voidedAt).map((pay) => (
                                        <CostRow key={pay.id} label={PAYMENT_METHODS[pay.method] ?? pay.method}
                                            meta={`${fmtDate(pay.receivedOn)}${pay.invoiceNumber ? ` · ${pay.invoiceNumber}` : ""}`} value={money.fmt(pay.amountUsd)} />
                                    ))}
                                    {payments.data && payments.data.items.filter((p) => !p.voidedAt).length === 0 && (
                                        <p className="muted" style={{ fontSize: "11.5px" }}>No payments recorded.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid g-8-4 mt">
                        <ClientProjects client={client} projects={projects.data?.items} loading={projects.isPending} error={projects.error} onRetry={() => projects.refetch()} />
                        <div className="stack">
                            {w && (
                                <Figure title="Work per month" sub="Hours logged for this client.">
                                    <Columns height={160} labelEvery={2} format={(v) => `${Math.round(v)}h`}
                                        data={w.monthly.map((x) => ({ label: MONTHS[partsOf(`${x.month.slice(0, 7)}-01`).month], tip: fmtMonthY(x.month), value: x.minutes / 60 }))} />
                                </Figure>
                            )}
                            {w && (
                                <Panel title="Who worked for them" sub="Hours across this client's projects." bodyStyle={{ paddingTop: 4 }}>
                                    <RankBars format={fmtH} unit="Hours"
                                        onClick={permissions.has(P.EMPLOYEE_VIEW) ? (it) => navigate(`/${domain}/people/${it.id}`) : undefined}
                                        items={w.people.slice(0, 8).map((p) => ({
                                            id: p.id, label: p.name, value: p.minutes,
                                            node: <><PersonAvatar person={p} size={20} link={false} /><span className="trunc">{p.name}</span></>,
                                        }))} />
                                </Panel>
                            )}
                        </div>
                    </div>

                    {permissions.has(P.ACTIVITY_VIEW) && (
                        <RecentActivity filters={{ domain, clientId: client.id }} sub="Work and changes across this client's projects." empty="Nothing logged yet." />
                    )}
                </>
            )}

            <BillingModalHost />
            {showEdit && <ClientModal domain={domain} client={client} onClose={() => setShowEdit(false)} />}
            {showDelete && (
                <Modal title={canDelete ? `Delete ${client.displayName}?` : "This client can't be deleted"} onClose={() => setShowDelete(false)}
                    foot={
                        <>
                            <div className="grow">{remove.error ? <span className="err"><Icon name="alert" />{errorMessage(remove.error)}</span> : null}</div>
                            <button className="btn" onClick={() => setShowDelete(false)}>Cancel</button>
                            {canDelete ? (
                                <button className="btn btn-danger" disabled={remove.isPending} onClick={() => remove.mutate(undefined, {
                                    onSuccess: () => {
                                        setShowDelete(false);
                                        toast({ text: `${client.displayName} deleted`, icon: "trash" });
                                        navigate(`/${domain}/clients`);
                                    },
                                })}>Delete client</button>
                            ) : (
                                <button className="btn btn-primary" onClick={() => { setShowDelete(false); if (!client.isArchived) toggleArchive(); }}>Archive instead</button>
                            )}
                        </>
                    }>
                    {canDelete ? (
                        <p className="sec">This client has no projects, so nothing depends on the record. It will be removed permanently.</p>
                    ) : (
                        <div>
                            <p className="sec">{client.displayName} has <b>{plural(client.projectCount, "project")}</b>
                                {m ? <> carrying {money.fmt(m.revenue)} of revenue</> : null}. Deleting the client would leave that history without an owner, so it is blocked.</p>
                            <p className="sec mt-s"><b>Archive instead:</b> the client disappears from pickers and the default list, while every project, figure and report stays exactly as it is. You can restore it at any time.</p>
                        </div>
                    )}
                </Modal>
            )}
        </div>
    );
}

/** The client's projects: with money for money viewers, otherwise from the project list. */
type ClientProjectsProps = { client: Client; projects?: ProjectSummary[]; loading: boolean; error: unknown; onRetry: () => void };

function ClientProjects({ client, projects, loading, error, onRetry }: ClientProjectsProps) {
    const domain = useDomain();
    const navigate = useNavigate();
    const open = (id: number) => navigate(`/${domain}/projects/${id}`);

    if (client.projectMoney) {
        type Row = NonNullable<Client["projectMoney"]>[number];
        const rows = [...client.projectMoney].sort((a, b) => b.startDate.localeCompare(a.startDate));
        const tiles = new Map(projects?.map((p) => [p.id, p]));
        const columns: Column<Row>[] = [
            {
                key: "project", header: "Project",
                cell: (p) => (
                    <div className="pname">
                        <ProjectTile icon={tiles.get(p.projectId)?.icon} tint={tiles.get(p.projectId)?.tint} size="sm" />
                        <span className="trunc" style={{ fontWeight: 600 }}>{p.title}</span>
                    </div>
                ),
            },
            { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
            { key: "hours", header: "Hours", right: true, mono: true, cell: (p) => fmtH(Math.round(p.hours * 60)) },
            { key: "revenue", header: "Revenue", right: true, mono: true, cell: (p) => money.short(p.revenue) },
            { key: "cost", header: "Cost", right: true, mono: true, cell: (p) => money.short(p.cost) },
            { key: "profit", header: "Profit", right: true, cell: (p) => <span className={cx("mono", p.profit >= 0 ? "up" : "down")}>{money.short(p.profit)}</span> },
            { key: "margin", header: "Margin", cell: (p) => <MarginPill value={p.marginKnown ? p.margin : null} label={false} /> },
            { key: "invoiced", header: "Invoiced", right: true, mono: true, cell: (p) => (p.billing.invoiced > 0.5 ? money.short(p.billing.invoiced) : <span className="muted">-</span>) },
            { key: "paid", header: "Paid", right: true, mono: true, cell: (p) => (p.billing.received > 0.5 ? money.short(p.billing.received) : <span className="muted">-</span>) },
            {
                key: "outstanding", header: "Outstanding", right: true,
                cell: (p) => (p.billing.outstanding > 0.5 ? <span className={cx("mono", p.billing.overdue > 0.5 && "down")}>{money.short(p.billing.outstanding)}</span> : <span className="muted">-</span>),
            },
            { key: "started", header: "Started", nowrap: true, cell: (p) => <span className="muted">{fmtDate(p.startDate)}</span> },
        ];
        return (
            <Panel title="Projects" sub="Everything we have done for this client." flush>
                <DataTable columns={columns} rows={rows} rowKey={(p) => p.projectId} minWidth="tbl-min-sm" onRowClick={(p) => open(p.projectId)} />
            </Panel>
        );
    }

    const columns: Column<ProjectSummary>[] = [
        { key: "project", header: "Project", cell: (p) => <div className="pname"><ProjectTile icon={p.icon} tint={p.tint} size="sm" /><span className="trunc" style={{ fontWeight: 600 }}>{p.title}</span></div> },
        { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
        { key: "started", header: "Started", nowrap: true, cell: (p) => <span className="muted">{fmtDate(p.startDate)}</span> },
    ];
    return (
        <Panel title="Projects" sub="Everything we have done for this client." flush>
            <DataTable columns={columns} rows={projects} loading={loading} error={error} onRetry={onRetry} what="the projects" rowKey={(p) => p.id} minWidth="tbl-min-sm" onRowClick={(p) => open(p.id)} />
        </Panel>
    );
}
