import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useNavigate } from "react-router";
import { cx } from "@/shared/utils/cx";
import Avatar, { type AvatarPerson } from "./Avatar";
import { useProfilePath } from "./useProfilePath";

export type Person = AvatarPerson & { id: number; position?: string | null };

function ProfileLink({ person, className, children }: { person: Person; className: string; children: ReactNode }) {
    const path = useProfilePath(person.id);
    const navigate = useNavigate();
    if (!path) return <>{children}</>;
    // Only the name or picture opens the profile: a clickable row underneath keeps its own click.
    const open = (e: MouseEvent | KeyboardEvent) => {
        e.stopPropagation();
        navigate(path);
    };
    return (
        <span className={cx("plink", className)} role="link" tabIndex={0} title={`Open ${person.name}'s profile`}
            onClick={open} onKeyDown={(e) => e.key === "Enter" && open(e)}>
            {children}
        </span>
    );
}

/** A person's name, linking to their profile where the viewer may open it (the prototype's UI.PersonName). */
export function PersonName({ person, text, bold }: { person: Person; text?: string; bold?: boolean }) {
    const label = text ?? person.name;
    return (
        <ProfileLink person={person} className="plink-name">
            {bold ? <b>{label}</b> : label}
        </ProfileLink>
    );
}

/** An avatar that links to the profile. */
export function PersonAvatar({ person, size, presence, link = true }: { person: Person; size?: number; presence?: boolean; link?: boolean }) {
    const avatar = <Avatar person={person} size={size} presence={presence} />;
    return link ? <ProfileLink person={person} className="plink-av">{avatar}</ProfileLink> : avatar;
}

/** Avatar, name and a sub-line (their position by default) (the prototype's UI.PersonLine). */
export function PersonLine({ person, size = 28, presence, link, sub }: { person: Person; size?: number; presence?: boolean; link?: boolean; sub?: ReactNode | false }) {
    return (
        <div className="row" style={{ gap: 9, minWidth: 0 }}>
            <PersonAvatar person={person} size={size} presence={presence} link={link} />
            <div style={{ minWidth: 0 }}>
                <div className="trunc" style={{ fontWeight: 600 }}>{link ? <PersonName person={person} /> : person.name}</div>
                {sub !== false && <div className="muted trunc" style={{ fontSize: "11.5px" }}>{sub ?? person.position}</div>}
            </div>
        </div>
    );
}

/** Overlapping avatars, "+3" past the limit (the prototype's UI.Avatars). */
export function Avatars({ people, max = 5, size = 22, link, total }: { people: Person[]; max?: number; size?: number; link?: boolean; total?: number }) {
    const shown = people.slice(0, max);
    const more = (total ?? people.length) - shown.length;
    return (
        <div className="av-stack">
            {shown.map((p) => <PersonAvatar key={p.id} person={p} size={size} link={link} />)}
            {more > 0 && <span className="av-more">+{more}</span>}
        </div>
    );
}
