import { AREAS } from "@/app/routing/areas";
import { ProjectTile } from "@/shared/components/Data/Bits";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";

/** Announcements' tile: a megaphone, for the chat everyone reads. */
export function AnnouncementsTile({ size }: { size?: "sm" }) {
    return <div className={cx("ptile", size)} style={{ background: "var(--accent)" }}><Icon name="megaphone" /></div>;
}

/** A team chat's tile: its business's icon, in its colour (the prototype's MessagesGroupTile). */
export default function GroupTile({ domain, size }: { domain: string; size?: "sm" }) {
    const area = AREAS[domain as "design" | "execution"];
    return (
        <div className={cx("ptile", size)} style={{ background: domain === "execution" ? "var(--warn-mark)" : "var(--accent)" }}>
            <Icon name={area?.icon ?? "people"} />
        </div>
    );
}

/** A custom group's tile: its photo, or a people icon in a colour of its own, apart from the businesses' team chats. */
export function ChatGroupTile({ photoFileId, size }: { photoFileId?: number | null; size?: "sm" | "lg" }) {
    return <ProjectTile icon="people" tint="var(--ok)" photo={photoFileId} size={size} />;
}
