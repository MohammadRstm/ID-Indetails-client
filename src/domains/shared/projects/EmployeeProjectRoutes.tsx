import { useSearchParams } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useDomain } from "@/app/routing/domainContext";
import EmployeeHome from "../../design/work/EmployeeHome";
import EmployeeProjectPage from "../../design/work/EmployeeProjectPage";
import SiteHome from "../../execution/staff/SiteHome";
import SiteProjectPage from "../../execution/staff/SiteProjectPage";
import CreateProjectModal from "./CreateProjectModal";

/* An employee's projects: Design's are built on logged work, Execution's on what is recorded on site. */

export function EmployeeProjectsRoute() {
    const domain = useDomain();
    const permissions = usePermissions();
    // ?new=1 (the top bar's New project) opens the form here too, for an employee who may create projects
    const [params, setParams] = useSearchParams();
    const closeNew = () => { params.delete("new"); params.delete("client"); setParams(params, { replace: true }); };
    return (
        <>
            {domain === "design" ? <EmployeeHome /> : <SiteHome />}
            {params.get("new") === "1" && permissions.has(P.PROJECT_CREATE) && <CreateProjectModal domain={domain} initialClient={params.get("client")} onClose={closeNew} />}
        </>
    );
}

export function EmployeeProjectRoute() {
    return useDomain() === "design" ? <EmployeeProjectPage /> : <SiteProjectPage />;
}
