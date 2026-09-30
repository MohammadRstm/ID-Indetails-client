import { useDomain } from "@/app/routing/domainContext";
import MyWorkPage from "../../design/work/MyWorkPage";
import MyRequirementsPage from "./MyRequirementsPage";

/** An employee's My work: Design's is built on logged hours; Execution's is the requirements assigned to them. */
export default function MyWorkRoute() {
    return useDomain() === "design" ? <MyWorkPage /> : <MyRequirementsPage />;
}
