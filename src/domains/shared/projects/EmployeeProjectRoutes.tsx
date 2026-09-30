import ComingSoon from "@/app/pages/ComingSoon";
import { useDomain } from "@/app/routing/domainContext";
import EmployeeHome from "../../design/work/EmployeeHome";
import EmployeeProjectPage from "../../design/work/EmployeeProjectPage";

/* An employee's projects: Design's are built on logged work; Execution's views arrive with phase 6. */

export function EmployeeProjectsRoute() {
    return useDomain() === "design" ? <EmployeeHome /> : <ComingSoon title="Projects" />;
}

export function EmployeeProjectRoute() {
    return useDomain() === "design" ? <EmployeeProjectPage /> : <ComingSoon title="Project" />;
}
