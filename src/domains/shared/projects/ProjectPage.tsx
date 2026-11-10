import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { errorMessage, isStatus } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import type { Permissions } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useDomain } from "@/app/routing/domainContext";
import { useCurrentUser, fullName } from "@/app/session/useSession";
import { MissingRecord } from "@/app/pages/NotFound";
import { useDiscussionSummary } from "@/portal/discussion/discussionApi";
import { StatusBadge } from "@/shared/components/Data/Pills";
import Tabs from "@/shared/components/Data/Tabs";
import LoadError from "@/shared/components/Feedback/LoadError";
import Skeleton, { SkeletonKpis, SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import { PersonAvatar, PersonName } from "@/shared/components/Identity/People";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import Popover from "@/shared/components/Overlays/Popover";
import { money } from "@/shared/format/money";
import { companyToday, dayKey, daysBetween, fmtDate, fmtDateY } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { ClientBadge } from "../clients/ClientBits";
import { ProjectMeetingsTab } from "../meetings/Meetings";
import { useProjectMeetings } from "../meetings/meetingsApi";
import { personName, useProjectOwners } from "../people/peopleApi";
import { ProjectRequirementsTab } from "../requirements/Requirements";
import { useRequirements } from "../requirements/requirementsApi";
import ExpenseModal from "../../design/projects/money/ExpenseModal";
import BillingModalHost from "../billing/BillingModalHost";
import { useBillingLinks } from "../billing/billingLinks";
import ClientTypeModal from "../../design/projects/money/ClientTypeModal";
import PaymentModal from "../../design/projects/money/PaymentModal";
import { DepartmentsModal } from "../../design/projects/departments/DepartmentsPanel";
import { staffDiscussion } from "../../design/projects/portal/staffDiscussion";
import ReportModal from "../../design/projects/report/ReportModal";
import PricingModal from "../../execution/projects/PricingModal";
import PaymentHistoryModal from "./PaymentHistoryModal";
import BlockedChangeModal from "./BlockedChangeModal";
import BoqHost from "../../execution/boqs/BoqHost";
import { AskPocketModal, MoveToPocketModal } from "../../execution/pocket/PocketActions";
import ProjectPhoto from "./ProjectPhoto";
import CompleteProjectModal from "./CompleteProjectModal";
import DeleteProjectModal from "./DeleteProjectModal";
import { useUrlFlag } from "@/shared/hooks/useUrlFlag";
import EditProjectModal from "./EditProjectModal";
import ProjectStatusItems from "./ProjectStatusItems";
import { useChangeProjectStatus, useProject, useUpdateProject, type Project, type StatusAction } from "./projectsApi";

type TabKey = "financials" | "payments" | "vos" | "overview" | "analytics" | "contributors" | "requirements" | "timeline" | "meetings" | "files" | "portal";

/**
 * What goes on a project's Overview tab and Timeline tab, and the domain's own bits of its head. Each domain
 * supplies its own (Design: work, money and analytics; Execution: the site's money, expenses and labour),
 * registered where the routes are built.
 */
export type ProjectPanels = {
    overview: (project: Project) => ReactNode;
    /** Whether this person gets the Overview tab at all; without it they start on the first tab they have. */
    hasOverview?: (permissions: Permissions) => boolean;
    /** Its own tab, first, for those who see money. */
    financials?: (project: Project) => ReactNode;
    /** The Financials tab is for everyone who sees the project; its own parts check each permission (Execution sites). */
    financialsForAll?: boolean;
    /** Tabs that became parts of the Financials tab: a link to one opens Financials at that part (?part=). */
    movedTabs?: Partial<Record<string, string>>;
    /** Its own tab, for those who see everyone's work. */
    analytics?: (project: Project) => ReactNode;
    /** Its own tab, for those who see everyone's work. */
    contributors?: (project: Project) => ReactNode;
    /** Design only: the project's files, for everyone who sees the project. */
    files?: (project: Project) => ReactNode;
    /** Design only: a client project's payments (what was received, its invoices, each payment), for those who see money. */
    payments?: (project: Project) => ReactNode;
    /** Design only: a client project's variation orders, for those who see money. */
    vos?: (project: Project) => ReactNode;
    /** Design only: the client portal's files (client_portal:manage, or client_access:manage to look) and who of the client's contacts can follow it (client_access:manage). */
    portal?: (project: Project) => ReactNode;
    timeline?: (project: Project) => ReactNode;
    /** Beside the project's own buttons, such as Log work. */
    actions?: (project: Project) => ReactNode;
    /** On the line of facts under the title, such as the team. */
    meta?: (project: Project) => ReactNode;
};

/**
 * A project, for everyone, its parts by permission (the prototype's P.AdminProject and P.EmpProject): someone
 * who holds every permission sees what a super admin sees.
 */
export default function ProjectPage({ panels }: { panels: ProjectPanels }) {
    const { id } = useParams();
    const domain = useDomain();
    const projectId = Number(id);
    const query = useProject(projectId);
    if (!(Number.isInteger(projectId) && projectId > 0) || isStatus(query.error, 404)) return <MissingRecord title="Project not found" to={`/${domain}/projects`} back="Back to projects" />;
    // a failed refresh keeps the project on screen; only a load with nothing to show stops here
    if (query.isError && !query.data) return <div className="page"><LoadError error={query.error} retry={() => query.refetch()} what="the project" /></div>;
    if (!query.data) return <ProjectSkeleton />;
    // a fresh view per project: filters, picked weeks and open panels belong to the project they were set on
    return <ProjectView key={query.data.id} project={query.data} panels={panels} />;
}

function ProjectSkeleton() {
    return (
        <div className="page" aria-busy="true">
            <div className="crumbs"><Skeleton width={160} height={10} /></div>
            <div className="page-head">
                <div className="row start" style={{ gap: 13 }}>
                    <Skeleton width={44} height={44} style={{ borderRadius: 12 }} />
                    <div><Skeleton width={260} height={20} /><Skeleton width={360} height={11} style={{ marginTop: 10 }} /></div>
                </div>
            </div>
            <SkeletonKpis count={5} />
        </div>
    );
}

function ProjectView({ project, panels }: { project: Project; panels: ProjectPanels }) {
    const domain = useDomain();
    const permissions = usePermissions();
    const [params, setParams] = useSearchParams();
    const change = useChangeProjectStatus(project.id);
    const requirements = useRequirements(project.id, permissions.has(P.REQUIREMENT_VIEW));
    const meetings = useProjectMeetings(project.id);
    // The Client portal tab is also for whoever takes part in the project's discussion (a staff member who logged hours has no
    // portal permission, yet writes with the client): the server answers 404 to everyone else. Asked only where nothing else opens the tab.
    const clientProject = project.domain !== "execution" && project.billingType === "client" && project.client != null && panels.portal != null;
    const portalByPermission = permissions.has(P.CLIENT_ACCESS_MANAGE) || permissions.has(P.CLIENT_PORTAL_MANAGE);
    const asksParticipation = clientProject && !portalByPermission;
    const participation = useDiscussionSummary(staffDiscussion, project.id, { enabled: asksParticipation, retry: false });
    const [showDone, setShowDone] = useState(false);
    const [deleting, setDeleting] = useState(false);
    // its own link (?details=1), so Proton or a shared link can open it
    const [editing, setEditing] = useUrlFlag("details");
    // the report opens through the link too (?report=1), as the projects list's menu does
    const showReport = params.get("report") === "1";
    const setShowReport = (show: boolean) => {
        if (show) params.set("report", "1");
        else params.delete("report");
        setParams(params, { replace: !show });
    };
    const completeFromList = params.get("complete") === "1";

    const site = project.domain === "execution";
    // a Design project's report carries its costs and everyone's work, as the API's own check does
    const canReport = !site && permissions.has(P.FINANCIAL_VIEW) && permissions.has(P.WORK_ENTRY_VIEW_ALL);
    const canChangeStatus = permissions.has(P.PROJECT_CHANGE_STATUS);
    const seesMoney = permissions.has(P.FINANCIAL_VIEW);
    const timelineTab = !site && permissions.has(P.WORK_ENTRY_VIEW_ALL) && panels.timeline != null;
    const requested = params.get("tab") as TabKey | null;
    // a link to a tab that became a part of the Financials tab (a site's old BOQs tab, say) opens that part instead
    const movedPart = requested ? panels.movedTabs?.[requested] : undefined;
    useEffect(() => {
        if (!movedPart) return;
        params.set("tab", "financials");
        params.set("part", movedPart);
        setParams(params, { replace: true });
    }, [movedPart, params, setParams]);
    const allowed: Record<TabKey, boolean> = {
        financials: (seesMoney || panels.financialsForAll === true) && panels.financials != null,
        payments: seesMoney && !site && project.billingType === "client" && panels.payments != null,
        vos: seesMoney && !site && project.billingType === "client" && panels.vos != null,
        overview: panels.hasOverview?.(permissions) ?? true,
        analytics: permissions.has(P.WORK_ENTRY_VIEW_ALL) && panels.analytics != null,
        contributors: permissions.has(P.WORK_ENTRY_VIEW_ALL) && panels.contributors != null,
        // every Design project's files, client or internal, for everyone who sees it
        files: !site && permissions.has(P.PROJECT_VIEW) && panels.files != null,
        // only a client project's contacts can be invited, and its drafts are the client's; whoever takes part in its discussion sees the tab too
        portal: clientProject && (portalByPermission || participation.isSuccess),
        requirements: permissions.has(P.REQUIREMENT_VIEW),
        timeline: timelineTab,
        meetings: true,
    };
    const tabOrder: TabKey[] = ["financials", "payments", "vos", "overview", "analytics", "contributors", "requirements", "timeline", "meetings", "files", "portal"];
    const firstTab = tabOrder.find((k) => allowed[k]) ?? "meetings";
    // A tab the person may not open falls back to their first one, even when the link asks for it.
    const tab: TabKey = requested && allowed[requested] ? requested : firstTab;
    // a link to the Client portal tab waits for the answer that says whether this person takes part, rather than showing another tab first
    // (only while this page is the one asking: the tab's own parts share the query, and a 404 they ask again for must not hide the tab)
    const waitingForPortal = requested === "portal" && asksParticipation && participation.isLoading;
    const end = project.completedAt ? dayKey(project.completedAt) : companyToday();
    const days = daysBetween(project.startDate, end) + 1;
    const m = seesMoney ? project.money : null;
    const openRequirements = requirements.data ? requirements.data.total - requirements.data.done : 0;
    // The money windows, opened from the Financials tab or the menu (?money=payment|client|history|expense|pricing):
    // Design's customer payment and its client and type, an Execution site's supervision and TVA, the payment's
    // history, and a Design project's expenses (a site's are its Expenses list)
    const moneyAction = m ? params.get("money") : null;
    const canEditBilling = !site && !!m && !m.isLocked && permissions.has(P.PROJECT_EDIT);
    const canEditPayment = canEditBilling && project.billingType === "client" && permissions.has(P.FINANCIAL_WRITE);
    const hasPaymentHistory = !!m && (site || project.billingType === "client");
    const canEditPricing = site && !!m && !m.isLocked && permissions.has(P.PROJECT_PRICING_MANAGE);
    // a site's costs are recorded in its Expenses list, so it has no project expense window
    const canAddExpense = !site && !!m && !m.isLocked && permissions.has(P.EXPENSE_MANAGE);
    // an Execution client site moves money with the pocket money: part of its profit in, or a request for some back
    const canUsePocket = site && !!m && project.billingType === "client";
    const openMoney = (action: "payment" | "client" | "expense" | "pricing" | "to-pocket" | "ask-pocket") => { params.set("money", action); setParams(params); };
    const closeMoney = () => { params.delete("money"); params.delete("round"); setParams(params, { replace: true }); };
    // a change the profit floor refused, opened from its notification, for whoever sees the money to decide
    const blocked = permissions.has(P.FINANCIAL_VIEW) ? Number(params.get("blocked")) || null : null;
    const closeBlocked = () => { params.delete("blocked"); setParams(params, { replace: true }); };
    const billing = useBillingLinks();
    const bill = m?.billing;
    const client = !!m && !!project.client && project.billingType === "client";
    const canNewInvoice = client && permissions.has(P.INVOICE_CREATE) && (bill?.notYetInvoiced ?? 0) - (bill?.drafts ?? 0) > 0.5;
    // a payment needs no invoice: it is held on account until an invoice is issued
    const canRecordPayment = client && permissions.has(P.PAYMENT_RECORD);
    const moneyItems = canAddExpense || canEditBilling || canEditPricing || canNewInvoice || canRecordPayment || canUsePocket;
    // name, description, location and target date, while the project is open
    const canEditDetails = permissions.has(P.PROJECT_EDIT) && project.status !== "completed" && project.status !== "archived";
    // a Design client project's departments, opened from the menu, the Financials tab or the alert of hours waiting (?departments=edit)
    const canEditDepartments = canEditDetails && !site && project.billingType === "client" && !project.finalizedAt;
    const closeDepartments = () => { params.delete("departments"); setParams(params, { replace: true }); };

    function switchTab(k: TabKey) {
        if (k === firstTab) params.delete("tab");
        else params.set("tab", k);
        // a tab's own part, and the file whose comments are open, belong to that tab
        if (k !== tab) {
            params.delete("part");
            params.delete("view");
            params.delete("comments");
        }
        setParams(params);
    }
    function run(action: StatusAction, text: string) {
        change.mutate(action, {
            onSuccess: () => toast({ text, icon: "checkCircle" }),
            onError: (e) => toast({ text: "The status didn't change", sub: errorMessage(e), icon: "alert" }),
        });
    }
    function closeComplete() {
        setShowDone(false);
        if (completeFromList) { params.delete("complete"); setParams(params, { replace: true }); }
    }

    const closed = project.status === "completed" || project.status === "archived";
    return (
        <div className="page">
            <div className="crumbs">
                <Link to={`/${domain}/projects`}>Projects</Link>
                <Icon name="chevronRight" />
                <span>{project.title}</span>
            </div>

            <div className="page-head">
                <div className="row start" style={{ gap: 13, minWidth: 0 }}>
                    <ProjectPhoto project={project} canEdit={permissions.has(P.PROJECT_EDIT)} />
                    <div style={{ minWidth: 0 }}>
                        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                            <h1 className="page-title">{project.title}</h1>
                            {canChangeStatus ? (
                                <MenuButton buttonClass="btn btn-sm" align="left" width={200} label="Project status"
                                    text={<span className="row" style={{ gap: 6 }}><StatusBadge status={project.status} /><Icon name="chevronDown" /></span>}>
                                    {(close) => <ProjectStatusItems project={project} close={close} onComplete={() => setShowDone(true)} />}
                                </MenuButton>
                            ) : <StatusBadge status={project.status} />}
                        </div>
                        {project.description && <div className="page-sub" style={{ maxWidth: "70ch" }}>{project.description}</div>}
                        <div className="row wrap mt-s" style={{ gap: 14, fontSize: 12, color: "var(--ink-3)" }}>
                            {project.location && <span className="row" style={{ gap: 6 }}><Icon name="pin" style={{ width: 14, height: 14 }} /><b className="sec">{project.location}</b></span>}
                            <span className="row" style={{ gap: 6 }}><Icon name="calendar" style={{ width: 14, height: 14 }} />Started <b className="sec">{fmtDateY(project.startDate)}</b></span>
                            {project.completedAt ? (
                                <span className="row" style={{ gap: 6 }}><Icon name="checkCircle" style={{ width: 14, height: 14 }} />Completed <b className="sec">{fmtDateY(project.completedAt)}</b></span>
                            ) : project.targetDate ? (
                                <span className="row" style={{ gap: 6 }}><Icon name="target" style={{ width: 14, height: 14 }} />Target <b className="sec">{fmtDateY(project.targetDate)}</b></span>
                            ) : null}
                            <span className="row" style={{ gap: 6 }}><Icon name="clock" style={{ width: 14, height: 14 }} />{days} days</span>
                            <OwnerLine project={project} />
                            {panels.meta?.(project)}
                            {project.client && (
                                <span className="row" style={{ gap: 7 }}>Client
                                    <ClientBadge client={{ id: project.client.id, displayName: project.client.displayName }} sub={false} link={permissions.has(P.CLIENT_VIEW)} />
                                </span>
                            )}
                            {!site && (project.departments?.length ?? 0) > 0 && (
                                <span className="row" style={{ gap: 6 }}>Departments
                                    <b className="sec">{project.departmentsName ?? (project.departments ?? []).map((d) => d.name).join(", ")}</b>
                                </span>
                            )}
                            {m && (project.billingType === "internal" ? (
                                <span className="badge" title="No client and no payment - tracked as company cost">Internal project - no client</span>
                            ) : site ? (
                                <span className="row" style={{ gap: 6 }}>Received <b className="sec mono">{money.fmt(m.billing.received)}</b>
                                    <span className="muted">·</span>{m.billing.paidAhead > 0 ? "Paid ahead" : "Owed"}
                                    <b className="sec mono">{money.fmt(m.billing.paidAhead > 0 ? m.billing.paidAhead : m.billing.owed)}</b>
                                    {m.isLocked && <LockedSince at={project.finalizedAt} />}
                                    <SettledOwed money={m} />
                                </span>
                            ) : (
                                <span className="row" style={{ gap: 6 }}>Payment <b className="sec mono">{money.fmt(m.revenue)}</b>
                                    {m.isLocked && <LockedSince at={project.finalizedAt} />}
                                    <SettledOwed money={m} />
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="page-actions">
                    {panels.actions?.(project)}
                    {canReport && (
                        <button className="btn" onClick={() => setShowReport(true)}><Icon name="download" />Export report</button>
                    )}
                    {project.status === "archived" && permissions.has(P.PROJECT_DELETE) && (
                        <button className="btn btn-danger" onClick={() => setDeleting(true)}><Icon name="trash" />Delete project</button>
                    )}
                    {canChangeStatus && (closed ? (
                        <button className="btn" onClick={() => run("reopen", `${project.title} is active again`)}><Icon name="refresh" />Reopen project</button>
                    ) : (
                        <button className="btn btn-primary" onClick={() => setShowDone(true)}><Icon name="check" />Mark as done</button>
                    ))}
                    {((canChangeStatus && !closed) || moneyItems || canEditDetails) && (
                        <MenuButton icon="dots" label="More actions">
                            {(close) => (
                                <div>
                                    {canEditDetails && <button className="pop-item" onClick={() => { close(); setEditing(true); }}><Icon name="edit" />Edit details</button>}
                                    {canEditDepartments && (
                                        <button className="pop-item" onClick={() => { close(); params.set("departments", "edit"); setParams(params); }}><Icon name="people" />Departments</button>
                                    )}
                                    {canEditDetails && ((canChangeStatus && !closed) || moneyItems) && <div className="pop-sep" />}
                                    {canChangeStatus && !closed && (
                                        <>
                                            {project.status !== "hold" && (
                                                <button className="pop-item" onClick={() => { close(); run("hold", `${project.title} is now on hold`); }}><Icon name="pause" />Put on hold</button>
                                            )}
                                            <button className="pop-item" onClick={() => { close(); run("archive", `${project.title} is now archived`); }}><Icon name="archive" />Archive project</button>
                                        </>
                                    )}
                                    {canChangeStatus && !closed && moneyItems && <div className="pop-sep" />}
                                    {canAddExpense && <button className="pop-item" onClick={() => { close(); openMoney("expense"); }}><Icon name="plus" />Add project expense</button>}
                                    {canEditPayment && <button className="pop-item" onClick={() => { close(); openMoney("payment"); }}><Icon name="card" />Edit customer payment</button>}
                                    {canEditBilling && <button className="pop-item" onClick={() => { close(); openMoney("client"); }}><Icon name="user" />Client & type</button>}
                                    {canEditPricing && <button className="pop-item" onClick={() => { close(); openMoney("pricing"); }}><Icon name="card" />Pricing</button>}
                                    {canNewInvoice && <button className="pop-item" onClick={() => { close(); billing.newInvoice(); }}><Icon name="file" />New invoice</button>}
                                    {canRecordPayment && <button className="pop-item" onClick={() => { close(); billing.recordPayment(); }}><Icon name="card" />Record a client payment</button>}
                                    {canUsePocket && <button className="pop-item" onClick={() => { close(); openMoney("to-pocket"); }}><Icon name="arrowRight" />Move to pocket money</button>}
                                    {canUsePocket && <button className="pop-item" onClick={() => { close(); openMoney("ask-pocket"); }}><Icon name="arrowDown" />Ask the pocket money</button>}
                                </div>
                            )}
                        </MenuButton>
                    )}
                </div>
            </div>

            {project.status === "completed" && project.completedAt && (
                <div className="banner done" style={{ marginBottom: 14 }}>
                    <Icon name="checkCircle" />
                    <div className="grow">
                        <b>Completed {fmtDateY(project.completedAt)}.</b>{" "}
                        {canChangeStatus ? "It has left every employee's active project list and no new work can be logged against it. Everything recorded stays available here and in reports."
                            : site ? "No new expenses can be added; everything recorded stays here." : "New work can't be logged against it; everything recorded stays here."}
                    </div>
                    {canChangeStatus && <button className="btn btn-sm" onClick={() => run("reopen", `${project.title} is active again`)}>Reopen</button>}
                </div>
            )}
            {project.status === "hold" && (
                <div className="banner hold" style={{ marginBottom: 14 }}>
                    <Icon name="pause" />
                    <div className="grow">
                        <b>On hold{project.heldSince ? ` since ${fmtDateY(project.heldSince)}` : ""}.</b>{" "}
                        {canChangeStatus ? "Employees can still see it, but work entries are paused."
                            : site ? "Expenses can still be recorded; nothing new is scheduled until it resumes." : "You can still see it, but new work entries are paused until it resumes."}
                    </div>
                    {canChangeStatus && <button className="btn btn-sm" onClick={() => run("resume", `${project.title} is active again`)}>Resume</button>}
                </div>
            )}
            {project.status === "archived" && (
                <div className="banner" style={{ marginBottom: 14 }}>
                    <Icon name="archive" />
                    <div className="grow"><b>Archived.</b> Hidden from the default project list - history and reports are unchanged.</div>
                </div>
            )}

            <Tabs value={tab} onChange={switchTab} items={[
                ...(allowed.financials ? [{ key: "financials" as TabKey, label: "Financials" }] : []),
                ...(allowed.payments ? [{ key: "payments" as TabKey, label: "Client payments" }] : []),
                ...(allowed.vos ? [{ key: "vos" as TabKey, label: "Variation orders" }] : []),
                ...(allowed.overview ? [{ key: "overview" as TabKey, label: "Overview" }] : []),
                ...(allowed.analytics ? [{ key: "analytics" as TabKey, label: "Analytics" }] : []),
                ...(allowed.contributors ? [{ key: "contributors" as TabKey, label: "Contributors" }] : []),
                ...(permissions.has(P.REQUIREMENT_VIEW) ? [{ key: "requirements" as TabKey, label: "Requirements", count: requirements.data?.total }] : []),
                ...(timelineTab ? [{ key: "timeline" as TabKey, label: "Timeline" }] : []),
                { key: "meetings" as TabKey, label: "Meetings", count: meetings.data?.length },
                ...(allowed.files ? [{ key: "files" as TabKey, label: "Project files" }] : []),
                ...(allowed.portal ? [{ key: "portal" as TabKey, label: "Client portal" }] : []),
            ]} />

            {waitingForPortal ? <SkeletonLines lines={6} />
                : tab === "requirements" ? <ProjectRequirementsTab project={project} />
                : tab === "timeline" && panels.timeline ? panels.timeline(project)
                    : tab === "meetings" ? <ProjectMeetingsTab project={project} />
                    : tab === "files" && panels.files ? panels.files(project)
                    : tab === "portal" && panels.portal ? panels.portal(project)
                        : tab === "financials" && panels.financials ? panels.financials(project)
                        : tab === "payments" && panels.payments ? panels.payments(project)
                        : tab === "vos" && panels.vos ? panels.vos(project)
                            : tab === "analytics" && panels.analytics ? panels.analytics(project)
                                : tab === "contributors" && panels.contributors ? panels.contributors(project)
                                    : panels.overview(project)}

            {(showDone || completeFromList) && canChangeStatus && !closed && (
                <CompleteProjectModal project={project} openRequirements={openRequirements} onClose={closeComplete} />
            )}
            {blocked != null && <BlockedChangeModal id={blocked} onClose={closeBlocked} />}
            {moneyAction === "payment" && canEditPayment && <PaymentModal project={project} onClose={closeMoney} />}
            {moneyAction === "client" && canEditBilling && <ClientTypeModal project={project} onClose={closeMoney} />}
            {moneyAction === "history" && hasPaymentHistory && <PaymentHistoryModal project={project} onClose={closeMoney} />}
            {moneyAction === "pricing" && canEditPricing && <PricingModal project={project} onClose={closeMoney} />}
            {moneyAction === "expense" && canAddExpense && <ExpenseModal project={project} onClose={closeMoney} />}
            {moneyAction === "to-pocket" && canUsePocket && <MoveToPocketModal project={project} roundOff={params.get("round") === "1"} onClose={closeMoney} />}
            {moneyAction === "ask-pocket" && canUsePocket && <AskPocketModal project={project} onClose={closeMoney} />}
            <BillingModalHost project={project} />
            {site && <BoqHost project={project} />}
            {showReport && canReport && <ReportModal project={project} onClose={() => setShowReport(false)} />}
            {deleting && <DeleteProjectModal project={project} onClose={() => setDeleting(false)} />}
            {editing && canEditDetails && <EditProjectModal project={project} onClose={() => setEditing(false)} />}
            {params.get("departments") === "edit" && canEditDepartments && (
                <DepartmentsModal project={project} current={(project.departments ?? []).map((d) => d.id)} onClose={closeDepartments} />
            )}
        </div>
    );
}

/** What the client still owed when the project was completed, and whether it was excused or written off. */
function SettledOwed({ money: m }: { money: NonNullable<Project["money"]> }) {
    if (m.settledOwedUsd == null) return null;
    const excused = m.settledOwedAs === "excused";
    return (
        <span className="muted" title={excused ? "Forgiven when the project was completed: a discount agreed with the client" : "Never paid: written off as lost revenue when the project was completed"}>
            · {excused ? "Excused" : "Written off"} <b className="sec mono">{money.fmt(m.settledOwedUsd)}</b> at completion
        </span>
    );
}

function LockedSince({ at }: { at: string | null }) {
    return (
        <span className="locked-field"><Icon name="lock" style={{ width: 12, height: 12 }} />locked{at ? ` ${fmtDate(at)}` : ""}</span>
    );
}

/** "Owner [avatar] Nadia Karam ✎": the owner, and a picker for people who may edit the project. */
function OwnerLine({ project }: { project: Project }) {
    const permissions = usePermissions();
    const me = useCurrentUser();
    const update = useUpdateProject(project.id);
    const canEdit = permissions.has(P.PROJECT_EDIT) && !(project.status === "completed" || project.status === "archived");
    const people = useProjectOwners(project.domain, canEdit && permissions.has(P.EMPLOYEE_VIEW), permissions.canSeeDomain("design") && permissions.canSeeDomain("execution"));
    const owner = { id: project.owner.id, name: project.owner.name };
    const choices = [
        // admins and super admins own projects, employees don't
        ...(permissions.isAdmin ? [{ id: me.id, name: `${fullName(me)} (you)`, photoFileId: me.photoFileId }] : []),
        ...people.filter((p) => p.id !== me.id).map((p) => ({ id: p.id, name: personName(p), photoFileId: p.photoFileId })),
    ];

    function changeOwner(id: number, name: string) {
        if (id === project.owner.id) return;
        update.mutate(
            { title: project.title, description: project.description, location: project.location, icon: project.icon, tint: project.tint, targetDate: project.targetDate, ownerId: id },
            {
                onSuccess: () => toast({ text: `${name.replace(" (you)", "")} is now the owner of ${project.title}`, sub: "Recorded in Activity", icon: "checkCircle" }),
                onError: (e) => toast({ text: "The owner didn't change", sub: errorMessage(e), icon: "alert" }),
            },
        );
    }

    return (
        <span className="row" style={{ gap: 6 }}>Owner
            <span className="row" style={{ gap: 5 }}>
                <PersonAvatar person={owner} size={18} />
                <b className="sec"><PersonName person={owner} /></b>
            </span>
            {canEdit && (
                <Popover align="left" width={250} trigger={(open, toggle) => (
                    <button className={cx("icon-btn", open && "on")} style={{ width: 22, height: 22 }} aria-label="Change owner" onClick={toggle}>
                        <Icon name="edit" style={{ width: 13, height: 13 }} />
                    </button>
                )}>
                    {(close) => (
                        <div>
                            <div className="pop-label">Project owner</div>
                            <div style={{ maxHeight: 312, overflowY: "auto" }}>
                                {choices.map((o) => (
                                    <button key={o.id} className={cx("pop-item", o.id === project.owner.id && "on")} onClick={() => { close(); changeOwner(o.id, o.name); }}>
                                        <PersonAvatar person={o} size={20} link={false} />
                                        <span>{o.name}</span>
                                        {o.id === project.owner.id && <Icon name="check" className="chk" />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </Popover>
            )}
        </span>
    );
}
