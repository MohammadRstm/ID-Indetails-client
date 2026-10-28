import { useSearchParams } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { Bar } from "@/shared/components/Data/Bits";
import { KpiStrip, type KpiProps } from "@/shared/components/Data/Kpi";
import { Avatars } from "@/shared/components/Identity/People";
import { Money } from "@/shared/components/Data/Money";
import BillingBand from "../../shared/billing/BillingBand";
import { useBillingLinks } from "../../shared/billing/billingLinks";
import type { Project } from "../../shared/projects/projectsApi";
import { useRequirements } from "../../shared/requirements/requirementsApi";
import { useLabourWeeks } from "../labour/labourApi";
import LabourPanel from "../labour/LabourPanel";
import { useMaterials } from "../materials/materialsApi";
import MaterialsPanel from "../materials/MaterialsPanel";
import { useStatementLinks } from "../statements/statementLinks";
import StatementList from "../statements/StatementList";
import LabourHealth from "./LabourHealth";
import MaterialMargins from "../materials/MaterialMargins";
import SiteMoneyPanel from "./SiteMoneyPanel";
import { SiteStaffPanels } from "../staff/StaffPages";
import PaymentSection from "../../shared/projects/PaymentSection";
import { pctOf } from "./siteMoney";

/**
 * An Execution site's Overview tab (the Execution side of the prototype's AdminProject and P.EmpProject):
 * progress, requirements, materials and ground labour. Its money is on the Financials tab.
 */
export default function ExecutionOverview({ project }: { project: Project }) {
    const permissions = usePermissions();
    // site staff report labour and write logs; materials are recorded by whoever is given them
    const seesMaterials = permissions.hasAny(P.MATERIAL_CREATE, P.MATERIAL_MANAGE, P.FINANCIAL_VIEW);
    return (
        <>
            <SiteKpis project={project} />
            {seesMaterials && <MaterialsPanel project={project} />}
            <LabourPanel project={project} />
            <SiteStaffPanels project={project} />
        </>
    );
}

/**
 * An Execution site's Financials tab, for those who see money: its project fee first, then what the client has paid
 * against what the site has cost, its invoices and statements, what each material earns and how long labour lasts.
 */
export function ExecutionFinancials({ project }: { project: Project }) {
    const permissions = usePermissions();
    const links = useBillingLinks();
    const statements = useStatementLinks();
    const [params, setParams] = useSearchParams();
    const m = permissions.has(P.FINANCIAL_VIEW) ? project.money : null;
    if (!m) return null;
    const client = project.billingType === "client" && !!project.client;
    const open = (value: string) => () => { params.set("money", value); setParams(params); };
    const canPrice = permissions.has(P.PROJECT_PRICING_MANAGE) && !m.isLocked;

    return (
        <>
            <PaymentSection label="Customer payment" amount={m.projectFee ?? 0} locked={m.isLocked}
                tva={{ rate: m.tvaRate, withTva: m.paymentWithTva }}
                sub={<>The agreed amount, before TVA. Materials come on top at their client prices, with a default material profit of <b>{pctOf(m.materialMarkup ?? 0)}</b>. Each change is kept with why it changed.</>}
                onEdit={canPrice ? open("pricing") : undefined} onHistory={open("history")} />
            <SiteMoneyPanel project={project}
                onRecordPayment={client && permissions.has(P.PAYMENT_RECORD) ? () => links.recordPayment() : undefined}
                onStatement={client && permissions.has(P.STATEMENT_CREATE) ? statements.newStatement : undefined}
                onEditPricing={canPrice ? open("pricing") : undefined} />
            {client && <BillingBand project={project} />}
            {client && <StatementList project={project} />}
            {client && <MaterialMargins project={project} />}
            {client && <LabourHealth project={project} />}
        </>
    );
}

/** Progress, requirements, materials, ground labour and, for those who see money, what the client owes. */
function SiteKpis({ project }: { project: Project }) {
    const permissions = usePermissions();
    const requirements = useRequirements(project.id, permissions.has(P.REQUIREMENT_VIEW)).data;
    const materialList = useMaterials(project.id);
    const weeks = useLabourWeeks(project.id);
    const materials = materialList.data?.all;
    const labour = weeks.data;
    const m = permissions.has(P.FINANCIAL_VIEW) && project.billingType === "client" && project.client ? project.money : null;
    const b = m?.billing;
    const items: (KpiProps & { key: string })[] = [
        { key: "progress", label: "Progress", value: `${project.progressPct}%`, sub: <div style={{ width: 88 }}><Bar value={project.progressPct} hideValue /></div> },
    ];
    if (permissions.has(P.REQUIREMENT_VIEW)) {
        const r = requirements;
        items.push({
            key: "requirements", label: "Requirements", value: r?.total ? `${r.done} / ${r.total}` : "-",
            sub: <span className={r?.overdue ? "down" : undefined}>{!r ? "" : r.total ? (r.overdue ? `${r.overdue} overdue` : `${r.total - r.done} open`) : "none yet"}</span>,
        });
    }
    if (permissions.hasAny(P.MATERIAL_CREATE, P.MATERIAL_MANAGE, P.FINANCIAL_VIEW)) {
        items.push({ key: "materials", label: "Materials", value: <Money short value={materials?.cost ?? 0} />, sub: <span>{materials?.count ?? 0} records</span> });
    }
    items.push({ key: "labour", label: "Ground labour", value: <Money short value={labour?.total ?? 0} />, sub: <span>{labour?.reportedWeeks ?? 0} weeks reported</span> });
    if (m && b) {
        const ahead = b.paidAhead > 0.5;
        items.push({
            key: "owed", label: ahead ? "Paid ahead" : "Client owes", value: <Money short value={ahead ? b.paidAhead : b.owed} />,
            sub: <span><Money short value={b.received} /> received of <Money short value={m.revenue} /> agreed</span>,
        });
    }
    return <KpiStrip loading={materialList.isPending || weeks.isPending} items={items} />;
}

/** "Team [avatars]" in the site's head: who records on it, latest first. */
export function SiteTeamLine({ project }: { project: Project }) {
    if (!project.team?.count) return null;
    return <span className="row" style={{ gap: 6 }}>Team <Avatars people={project.team.people} max={5} /></span>;
}
