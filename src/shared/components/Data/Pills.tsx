import type { IconName } from "@/shared/icons/icons";
import { PROJECT_STATUS, type ProjectStatusKey } from "./status";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";

/*
 * The prototype's status badges. One place for every kind, so a status reads the same on every page.
 */

/** A project's (or an invited person's) status (the prototype's UI.Status). */
export function StatusBadge({ status, label }: { status: string; label?: string }) {
    const s = PROJECT_STATUS[status as ProjectStatusKey] ?? PROJECT_STATUS.active;
    return (
        <span className={cx("badge", s.cls)}>
            <Icon name={s.icon} />
            {label ?? s.label}
        </span>
    );
}

type MarginPillProps = {
    /** Profit ÷ revenue, e.g. 0.18. Null when it's too early to tell. */
    value: number | null | undefined;
    internal?: boolean;
    /** false leaves off the word "margin". */
    label?: boolean;
    hint?: string;
};

/** A project's margin, coloured by band (the prototype's UI.MarginPill). */
export function MarginPill({ value, internal, label = true, hint }: MarginPillProps) {
    if (internal) return <span className="badge">Internal</span>;
    if (value == null) return <span className="badge" title={hint ?? "Not enough work logged yet"}>Too early</span>;
    const cls = value < 0 ? "pill-neg" : value < 0.15 ? "pill-low" : value < 0.4 ? "pill-mid" : "pill-high";
    return <span className={cx("badge pill", cls)}>{(value * 100).toFixed(1)}%{label ? " margin" : ""}</span>;
}

/** A plain grey badge, optionally with an icon. */
export function Badge({ icon, className, children }: { icon?: IconName; className?: string; children: React.ReactNode }) {
    return (
        <span className={cx("badge", className)}>
            {icon && <Icon name={icon} />}
            {children}
        </span>
    );
}
