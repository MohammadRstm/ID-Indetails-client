import { useState } from "react";
import { downloadFile } from "@/api/download";
import { errorMessage } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import type { Domain } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { SwitchRow } from "@/shared/components/Forms/Filters";
import { companyToday } from "@/shared/format/time";
import { toast } from "@/shared/components/Feedback/toast";
import { Always } from "./SettingBits";

/** The prototype's Settings → Data & export, without its "reset the prototype": there is no demo data to reset. */
export default function DataSettings({ domain }: { domain: Domain }) {
    const permissions = usePermissions();
    const [exporting, setExporting] = useState(false);
    // work entries are Design's: nobody logs hours on a site
    const canExport = domain === "design" && permissions.has(P.WORK_ENTRY_VIEW_ALL);

    async function exportAll() {
        const today = companyToday();
        setExporting(true);
        try {
            await downloadFile("/work-entries/export", `work-entries-${today}.csv`, { from: "2000-01-01", to: today });
            toast({ text: "Work entries exported", sub: `work-entries-${today}.csv`, icon: "download" });
        } catch (e) {
            toast({ text: "The work entries weren't exported", sub: errorMessage(e), icon: "alert" });
        } finally {
            setExporting(false);
        }
    }

    return (
        <div className="panel">
            <div className="panel-head"><div><div className="panel-title">Data & export</div></div></div>
            <div className="panel-body">
                {canExport && (
                    <SwitchRow title="Export all work entries" description="Every entry logged, with its project, person, hours and cost, as a CSV." control={
                        <button className="btn btn-sm" disabled={exporting} onClick={exportAll}>{exporting ? "Exporting…" : "Export CSV"}</button>
                    } />
                )}
                <SwitchRow title="Data retention" description="Completed and archived projects keep their full history - nothing is deleted." control={<Always>Kept forever</Always>} />
            </div>
        </div>
    );
}
