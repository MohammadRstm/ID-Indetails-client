import type { ReactNode } from "react";

/** The prototype's empty-state illustrations (UI.Illus), unchanged. */
const ILLUS = {
    projects: (
        <svg viewBox="0 0 170 110" fill="none" aria-hidden="true">
            <rect x="24" y="26" width="86" height="60" rx="7" fill="var(--surface-3)" stroke="var(--line-2)" />
            <rect x="34" y="18" width="86" height="60" rx="7" fill="var(--surface)" stroke="var(--line-2)" />
            <path d="M46 36h48M46 48h34M46 60h26" stroke="var(--line-2)" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="122" cy="72" r="18" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.6" />
            <path d="M122 62v10l6.5 4" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
    ),
    search: (
        <svg viewBox="0 0 170 110" fill="none" aria-hidden="true">
            <rect x="26" y="24" width="80" height="12" rx="4" fill="var(--surface-3)" />
            <rect x="26" y="46" width="62" height="12" rx="4" fill="var(--surface-3)" />
            <rect x="26" y="68" width="44" height="12" rx="4" fill="var(--surface-3)" />
            <circle cx="116" cy="54" r="22" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2.4" />
            <path d="M132 70l14 14" stroke="var(--accent)" strokeWidth="3.2" strokeLinecap="round" />
        </svg>
    ),
    done: (
        <svg viewBox="0 0 170 110" fill="none" aria-hidden="true">
            <circle cx="85" cy="55" r="30" fill="var(--accent-soft)" />
            <path d="M72 56l10 10 22-24" stroke="var(--accent)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M33 30h14M27 44h20M124 66h18M130 80h14" stroke="var(--line-2)" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
    ),
    time: (
        <svg viewBox="0 0 170 110" fill="none" aria-hidden="true">
            <rect x="30" y="34" width="110" height="44" rx="8" fill="var(--surface-3)" stroke="var(--line-2)" />
            <rect x="40" y="48" width="26" height="16" rx="4" fill="var(--accent)" />
            <rect x="72" y="48" width="40" height="16" rx="4" fill="var(--accent-soft)" stroke="var(--accent)" />
            <path d="M30 88h110" stroke="var(--line-2)" strokeWidth="2" strokeLinecap="round" />
            <path d="M46 24v6M86 24v6M126 24v6" stroke="var(--line-2)" strokeWidth="2" strokeLinecap="round" />
        </svg>
    ),
};

export type IllustrationName = keyof typeof ILLUS;

type EmptyProps = {
    art?: IllustrationName;
    title: ReactNode;
    text?: ReactNode;
    action?: ReactNode;
};

/** An empty state: illustration, title, a line of text and an optional action. */
export default function Empty({ art = "search", title, text, action }: EmptyProps) {
    return (
        <div className="empty">
            {ILLUS[art]}
            <h4>{title}</h4>
            {text && <p>{text}</p>}
            {action}
        </div>
    );
}
