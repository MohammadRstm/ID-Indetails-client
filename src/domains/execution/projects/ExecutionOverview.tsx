import { useSearchParams } from "react-router";
import { P } from "@/app/permissions/codes";
import type { Permissions } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { Avatars } from "@/shared/components/Identity/People";
import { cx } from "@/shared/utils/cx";
import BillingBand from "../../shared/billing/BillingBand";
import { useBillingLinks } from "../../shared/billing/billingLinks";
import type { Project } from "../../shared/projects/projectsApi";
import LabourPanel from "../labour/LabourPanel";
import ExpensesPanel from "../expenses/ExpensesPanel";
import AccountSection from "../account/AccountSection";
import SitePayments from "../account/SitePayments";
import SupervisionTab from "../account/SupervisionTab";
import BoqPanel from "../boqs/BoqPanel";
import LabourHealth from "./LabourHealth";
import SiteMoneyPanel from "./SiteMoneyPanel";
import { SiteStaffPanels } from "../staff/StaffPages";
import WorkPriceSection from "./WorkPriceSection";

export type SitePart = "overview" | "payments" | "accounts" | "boqs" | "supervision" | "expenses" | "staff";

const PART_LABELS: Record<SitePart, string> = {
    overview: "Overview", payments: "Client payments", accounts: "Accounts", boqs: "BOQs", supervision: "Supervision", expenses: "Overall expenses", staff: "Site staff",
};

/**
 * The parts of a site's Financials tab this person may open, in order. Everyone who sees the site has its expenses
 * (site staff report labour there) and its site staff (with their daily logs); the overview needs financial:view, the other money parts
 * financial:view on a client site, and the BOQs whoever writes drafts, sees money or manages the pricing.
 */
function siteParts(project: Project, permissions: Permissions): SitePart[] {
    const client = project.billingType === "client" && project.client != null;
    const money = client && permissions.has(P.FINANCIAL_VIEW);
    return [
        ...(permissions.has(P.FINANCIAL_VIEW) ? ["overview"] as const : []),
        ...(money ? ["payments", "accounts"] as const : []),
        ...(client && permissions.hasAny(P.BOQ_CREATE, P.FINANCIAL_VIEW, P.PROJECT_PRICING_MANAGE) ? ["boqs"] as const : []),
        ...(money ? ["supervision"] as const : []),
        "expenses",
        "staff",
    ];
}

/** An Execution site's Financials tab: its parts as sub-tabs, the one open in the link (?part=). */
export function ExecutionFinancials({ project }: { project: Project }) {
    const permissions = usePermissions();
    const [params, setParams] = useSearchParams();
    const parts = siteParts(project, permissions);
    const requested = params.get("part") as SitePart | null;
    const part = requested && parts.includes(requested) ? requested : parts[0];
    const pick = (next: SitePart) => {
        if (next === parts[0]) params.delete("part");
        else params.set("part", next);
        // a part's own view (Overall expenses' expenses or ground labour) belongs to that part
        params.delete("view");
        setParams(params);
    };

    return (
        <>
            <div className="subtabs">
                <div className="seg" role="tablist" aria-label="Financials">
                    {parts.map((p) => (
                        <button key={p} role="tab" aria-selected={p === part} className={cx("seg-btn", p === part && "on")} onClick={() => pick(p)}>{PART_LABELS[p]}</button>
                    ))}
                </div>
            </div>
            {part === "overview" ? <SiteOverview project={project} />
                : part === "payments" ? <><BillingBand project={project} /><SitePayments project={project} /></>
                    : part === "accounts" ? <AccountSection project={project} onSupervision={() => pick("supervision")} />
                        : part === "boqs" ? <BoqPanel project={project} />
                            : part === "supervision" ? <SupervisionTab project={project} />
                                : part === "staff" ? <SiteStaffPanels project={project} />
                                    : <SiteExpenses project={project} />}
        </>
    );
}

/** The site's work price, and what the client has paid against what it has cost (financial:view). */
function SiteOverview({ project }: { project: Project }) {
    const permissions = usePermissions();
    const links = useBillingLinks();
    const [params, setParams] = useSearchParams();
    const m = permissions.has(P.FINANCIAL_VIEW) ? project.money : null;
    const client = project.billingType === "client" && !!project.client;
    const open = (value: string) => () => { params.set("money", value); setParams(params); };
    const canPrice = m != null && permissions.has(P.PROJECT_PRICING_MANAGE) && !m.isLocked;

    return (
        <>
            {m && (
                <>
                    {/* the account carries the supervision, TVA and client total, so the price section doesn't repeat them */}
                    <WorkPriceSection project={project} breakdown={!client} onEdit={canPrice ? open("pricing") : undefined} onHistory={open("history")} />
                    <SiteMoneyPanel project={project}
                        onRecordPayment={client && permissions.has(P.PAYMENT_RECORD) ? () => links.recordPayment() : undefined}
                        onEditPricing={canPrice ? open("pricing") : undefined} />
                </>
            )}
        </>
    );
}

type ExpenseView = "expenses" | "labour";

/**
 * Everything the site has spent, in two views (?view=): its expenses list, for whoever records or sees them, and its
 * ground labour, how long it lasts against the profit first (for those who see money), then the weeks reported.
 */
function SiteExpenses({ project }: { project: Project }) {
    const permissions = usePermissions();
    const [params, setParams] = useSearchParams();
    // site staff report labour and write logs; expenses are recorded by whoever is given them
    const seesExpenses = permissions.hasAny(P.MATERIAL_CREATE, P.MATERIAL_MANAGE, P.FINANCIAL_VIEW);
    const client = project.billingType === "client" && !!project.client;
    const views: ExpenseView[] = seesExpenses ? ["expenses", "labour"] : ["labour"];
    const requested = params.get("view") as ExpenseView | null;
    const view = requested && views.includes(requested) ? requested : views[0];
    const pick = (next: ExpenseView) => {
        if (next === views[0]) params.delete("view");
        else params.set("view", next);
        setParams(params);
    };
    return (
        <>
            {views.length > 1 && (
                <div className="subtabs">
                    <div className="seg" role="tablist" aria-label="Overall expenses">
                        {views.map((v) => (
                            <button key={v} role="tab" aria-selected={v === view} className={cx("seg-btn", v === view && "on")} onClick={() => pick(v)}>
                                {v === "expenses" ? "Expenses" : "Ground labour"}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            {view === "expenses" ? <ExpensesPanel project={project} /> : (
                <>
                    {client && permissions.has(P.FINANCIAL_VIEW) && <LabourHealth project={project} />}
                    <LabourPanel project={project} />
                </>
            )}
        </>
    );
}

/** "Team [avatars]" in the site's head: who records on it, latest first. */
export function SiteTeamLine({ project }: { project: Project }) {
    if (!project.team?.count) return null;
    return <span className="row" style={{ gap: 6 }}>Team <Avatars people={project.team.people} max={5} /></span>;
}
