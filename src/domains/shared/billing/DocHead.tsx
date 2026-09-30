import type { ReactNode } from "react";
import { useCompanySettings } from "@/app/shell/shellQueries";
import Logo from "@/shared/components/Identity/Logo";

/** The top of a client document's first page: the company, and what the document is (the server's letterhead). */
export function DocLetterhead({ kind, number, children }: { kind: string; number: string; children?: ReactNode }) {
    const company = useCompanySettings().data;
    const contact = [company?.website, company?.address].filter(Boolean).join(" · ");
    return (
        <div className="rep-head">
            <Logo size={34} />
            <div className="grow">
                <div className="rep-title">{company?.name ?? ""}</div>
                {contact && <div style={{ fontSize: "11.5px", color: "#46514F" }}>{contact}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
                <div className="doc-kind">{kind}</div>
                <div className="mono" style={{ fontSize: 13, fontWeight: 650 }}>{number}</div>
                {children}
            </div>
        </div>
    );
}

/** The strip at the top of a later page: whose document it is, and that it carries on. */
export function DocContinued({ kind, number, projectTitle }: { kind: string; number: string; projectTitle: string }) {
    const company = useCompanySettings().data;
    return (
        <div className="stmt-cont">
            <span><b>{company?.name ?? ""}</b> · {kind} {number}</span>
            <span>{projectTitle} · continued</span>
        </div>
    );
}
