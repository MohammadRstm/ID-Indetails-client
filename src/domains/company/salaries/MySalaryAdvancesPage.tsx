import { PageHead } from "@/shared/components/Data/Panel";
import MySalaryAdvances from "./MySalaryAdvances";

/** The signed-in person's own salary advances, a page of their own (from the menu under their name). */
export default function MySalaryAdvancesPage() {
    return (
        <div className="page page-reading">
            <PageHead title="Salary advances" sub="Ask for part of your pay early, follow each request and see what is left to pay back." />
            <MySalaryAdvances />
        </div>
    );
}
