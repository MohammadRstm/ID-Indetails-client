import { useRef, useState } from "react";
import Pager from "@/shared/components/Data-Tables/Pager";
import { plural } from "@/shared/format/labels";
import { money } from "@/shared/format/money";
import { fmtDateY } from "@/shared/format/time";
import type { Project } from "../../shared/projects/projectsApi";
import { useStatementLinks } from "./statementLinks";
import { useStatements } from "./statementsApi";

const SENT = { whatsapp: "WhatsApp", email: "emailed", download: "saved as PDF" };

/** The statements a site's client has been sent, ten a page, newest first (the prototype's EX.StatementList). */
export default function StatementList({ project }: { project: Project }) {
    const [page, setPage] = useState(1);
    const topRef = useRef<HTMLDivElement>(null);
    const links = useStatementLinks();
    const list = useStatements(project.id, page, true).data;
    if (!list?.totalCount) return null;

    return (
        <div className="panel mt pg-anchor" ref={topRef}>
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Client statements</div>
                    <div className="panel-sub">Materials statements sent to the client - for their information, never an invoice.</div>
                </div>
            </div>
            <div className="panel-body">
                {list.items.map((s) => (
                    <div key={s.id} className="cost-row click" role="button" tabIndex={0} onClick={() => links.open(s.id)}
                        onKeyDown={(e) => { if (e.key === "Enter") links.open(s.id); }}>
                        <span className="mono nowrap" style={{ fontWeight: 600, fontSize: 12 }}>{s.number}</span>
                        <span className="grow muted trunc" style={{ fontSize: "11.5px" }}>
                            {fmtDateY(s.createdAt)} · {s.mode === "total" ? "total only" : plural(s.count, "material")}
                            {s.lastDelivery ? ` · ${SENT[s.lastDelivery.channel]}` : ""}
                        </span>
                        <span className="mono" style={{ minWidth: 90, textAlign: "right" }}>{money.exact(s.total)}</span>
                    </div>
                ))}
                <Pager page={page} pageSize={10} total={list.totalCount} onPage={setPage} anchor={topRef} />
            </div>
        </div>
    );
}
