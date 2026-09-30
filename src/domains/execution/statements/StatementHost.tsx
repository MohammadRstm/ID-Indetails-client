import { useSearchParams } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import type { Project } from "../../shared/projects/projectsApi";
import { useStatementLinks } from "./statementLinks";
import StatementModal from "./StatementModal";

/**
 * The statement the link asks for (?statement=new or ?statement=12), for the viewer who may open it: a new
 * one needs statement:create, a saved one statement:create, statement:send or financial:view.
 */
export default function StatementHost({ project }: { project: Project }) {
    const permissions = usePermissions();
    const [params] = useSearchParams();
    const links = useStatementLinks();
    const value = params.get("statement");
    if (!value || project.billingType !== "client" || !project.client) return null;
    if (value === "new") {
        return permissions.has(P.STATEMENT_CREATE)
            ? <StatementModal project={project} statementId={null} onMade={links.made} onClose={links.close} /> : null;
    }
    const id = Number(value);
    const canSee = permissions.has(P.STATEMENT_CREATE) || permissions.has(P.STATEMENT_SEND) || permissions.has(P.FINANCIAL_VIEW);
    return Number.isInteger(id) && id > 0 && canSee
        ? <StatementModal key={id} project={project} statementId={id} onMade={links.made} onClose={links.close} /> : null;
}
