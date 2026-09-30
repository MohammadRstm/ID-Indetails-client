import { useSearchParams } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { Bar } from "@/shared/components/Data/Bits";
import { KpiStrip, type KpiProps } from "@/shared/components/Data/Kpi";
import { money } from "@/shared/format/money";
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
import SiteMoneyPanel from "./SiteMoneyPanel";

/**
 * An Execution site's Overview tab, for admins (the Execution side of the prototype's AdminProject): progress,
 * requirements, materials and ground labour, and for those who see money, what the client has paid against
 * what the site has cost.
 */
export default function ExecutionOverview({ project }: { project: Project }) {
    const permissions = usePermissions();
    const links = useBillingLinks();
    const statements = useStatementLinks();
    const [params, setParams] = useSearchParams();
    const m = permissions.has(P.FINANCIAL_VIEW) ? project.money : null;
    const client = project.billingType === "client" && !!project.client;
    const openPricing = () => { params.set("money", "pricing"); setParams(params); };

    return (
        <>
            <SiteKpis project={project} />
            {m && (
                <SiteMoneyPanel project={project}
                    onRecordPayment={client && permissions.has(P.PAYMENT_RECORD) ? () => links.recordPayment() : undefined}
                    onStatement={client && permissions.has(P.STATEMENT_CREATE) ? statements.newStatement : undefined}
                    onEditPricing={permissions.has(P.PROJECT_PRICING_MANAGE) ? openPricing : undefined} />
            )}
            {m && client && <BillingBand project={project} />}
            {m && client && <StatementList project={project} />}
            <MaterialsPanel project={project} />
            <LabourPanel project={project} />
            {m && client && <LabourHealth project={project} />}
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
    items.push(
        { key: "materials", label: "Materials", value: money.short(materials?.cost ?? 0), sub: <span>{materials?.count ?? 0} records</span> },
        { key: "labour", label: "Ground labour", value: money.short(labour?.total ?? 0), sub: <span>{labour?.reportedWeeks ?? 0} weeks reported</span> },
    );
    if (m && b) {
        const ahead = b.paidAhead > 0.5;
        items.push({
            key: "owed", label: ahead ? "Paid ahead" : "Client owes", value: money.short(ahead ? b.paidAhead : b.owed),
            sub: <span>{money.short(b.received)} received of {money.short(m.revenue)} agreed</span>,
        });
    }
    return <KpiStrip loading={materialList.isPending || weeks.isPending} items={items} />;
}
