import { useDomain } from "@/app/routing/domainContext";
import EmployeeProjectPage from "../../design/work/EmployeeProjectPage";
import SiteProjectPage from "../../execution/staff/SiteProjectPage";

/* An employee's project: Design's is built on logged work, Execution's on what is recorded on site. */

export function EmployeeProjectRoute() {
    return useDomain() === "design" ? <EmployeeProjectPage /> : <SiteProjectPage />;
}
