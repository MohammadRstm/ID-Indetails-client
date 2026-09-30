import { useDomain } from "@/app/routing/domainContext";
import EmployeeHome from "../../design/work/EmployeeHome";
import EmployeeProjectPage from "../../design/work/EmployeeProjectPage";
import SiteHome from "../../execution/staff/SiteHome";
import SiteProjectPage from "../../execution/staff/SiteProjectPage";

/* An employee's projects: Design's are built on logged work, Execution's on what is recorded on site. */

export function EmployeeProjectsRoute() {
    return useDomain() === "design" ? <EmployeeHome /> : <SiteHome />;
}

export function EmployeeProjectRoute() {
    return useDomain() === "design" ? <EmployeeProjectPage /> : <SiteProjectPage />;
}
