import { AREAS } from "@/app/routing/areas";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";

/** A team chat's tile: its business's icon, in its colour (the prototype's MessagesGroupTile). */
export default function GroupTile({ domain, size }: { domain: string; size?: "sm" }) {
    const area = AREAS[domain as "design" | "execution"];
    return (
        <div className={cx("ptile", size)} style={{ background: domain === "execution" ? "var(--warn-mark)" : "var(--accent)" }}>
            <Icon name={area?.icon ?? "people"} />
        </div>
    );
}
