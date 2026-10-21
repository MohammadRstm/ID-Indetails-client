import { COMPANY_MARK, COMPANY_MARK_BOX } from "@/shared/components/Identity/companyMark";

/** While the app loads and the session is restored: the company's mark, breathing, above what is happening. */
export default function BootScreen() {
    return (
        <div className="boot" aria-busy="true">
            <svg className="boot-logo" width="30" height="56" viewBox={COMPANY_MARK_BOX} aria-hidden="true">
                <path fill="currentColor" d={COMPANY_MARK} />
            </svg>
            <p className="boot-text">Loading ID InDetails…</p>
        </div>
    );
}
