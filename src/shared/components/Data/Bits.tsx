import type { ReactNode } from "react";
import { lastSeen } from "@/shared/format/time";
import { icons, type IconName } from "@/shared/icons/icons";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";

/** A percentage bar with its value (the prototype's UI.Bar). */
export function Bar({ value, tone, hideValue }: { value: number; tone?: string; hideValue?: boolean }) {
    return (
        <div className="meter-row">
            <div className={cx("bar", tone)}><i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>
            {!hideValue && <span className="meter-val">{Math.round(value)}%</span>}
        </div>
    );
}

const ACTIVITY = ["No recent activity", "Quiet", "Steady", "Busy"];

/** Three bars for how busy a project is: 0 none, 1 quiet, 2 steady, 3 busy (the prototype's UI.Signal). */
export function Signal({ level }: { level: number }) {
    const label = ACTIVITY[level] ?? ACTIVITY[0];
    return (
        <span className={cx("sig", `l${level}`)} title={label} aria-label={label}>
            <i /><i /><i />
        </span>
    );
}

/** Online, or when they were last seen (the prototype's UI.Presence). */
export function Presence({ online, lastSeenAt }: { online: boolean; lastSeenAt?: string | null }) {
    return (
        <span className="pres-label">
            <span className={cx("dot", online ? "dot-on" : "dot-off")} />
            {online ? "Online" : lastSeenAt ? `Last seen ${lastSeen(lastSeenAt)}` : "Offline"}
        </span>
    );
}

/** A project's coloured tile with its icon (the prototype's UI.Tile). */
export function ProjectTile({ icon, tint, size }: { icon?: string | null; tint?: string | null; size?: "sm" | "lg" }) {
    return (
        <span className={cx("ptile", size)} style={{ background: tint || "var(--accent)" }}>
            <Icon name={icon && Object.hasOwn(icons, icon) ? (icon as IconName) : "folder"} />
        </span>
    );
}

/** A banner: info, hold (warning), done, attn (problem) or ok. */
export function Banner({ tone, icon = "info", children, action }: { tone?: "hold" | "done" | "attn" | "ok"; icon?: IconName; children: ReactNode; action?: ReactNode }) {
    return (
        <div className={cx("banner", tone)}>
            <Icon name={icon} />
            <div className="grow">{children}</div>
            {action}
        </div>
    );
}
