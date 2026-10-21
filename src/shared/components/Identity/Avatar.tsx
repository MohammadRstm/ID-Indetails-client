import { useFileUrl } from "@/shared/files/useFileUrl";
import { cx } from "@/shared/utils/cx";
import { avatarUri, initials } from "./avatars";

export type AvatarPerson = {
    name: string;
    photoFileId?: number | null;
    online?: boolean | null;
};

type AvatarProps = {
    person: AvatarPerson;
    size?: number;
    /** Show the online / offline dot. */
    presence?: boolean;
};

/** A person's photo, or their generated avatar, or their initials; with an optional presence dot. */
export default function Avatar({ person, size = 28, presence = false }: AvatarProps) {
    const photo = useFileUrl(person.photoFileId, 160);
    const src = photo.url ?? safeAvatar(person.name);
    const img = src
        ? <img className="av" src={src} width={size} height={size} alt="" style={{ width: size, height: size }} />
        : (
            <div
                className="av-fb"
                style={{ width: size, height: size, fontSize: Math.max(9, size * 0.36), background: "var(--surface-3)" }}
            >
                {initials(person.name)}
            </div>
        );

    if (!presence) return img;
    const online = person.online !== false;
    return (
        <span className={cx("avw", size < 30 && "sm")}>
            {img}
            <span className={cx("dot", online ? "dot-on" : "dot-off")} title={online ? "Online" : "Offline"} />
        </span>
    );
}

function safeAvatar(name: string): string | null {
    try {
        return avatarUri(name);
    } catch {
        return null;
    }
}
