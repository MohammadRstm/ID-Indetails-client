import { useState } from "react";
import { clickable } from "@/shared/utils/clickable";
import Avatar, { type AvatarPerson } from "./Avatar";
import PhotoLightbox from "./PhotoLightbox";

/**
 * The large picture at the top of a profile: clicking it opens the photo full screen. A generated avatar has no photo
 * behind it, so it stays as it is.
 */
export default function ProfilePicture({ person, size = 72, presence }: { person: AvatarPerson; size?: number; presence?: boolean }) {
    const [viewing, setViewing] = useState(false);
    const avatar = <Avatar person={person} size={size} presence={presence} />;
    if (person.photoFileId == null) return avatar;
    return (
        <>
            <span className="plink plink-av" title="See the photo full screen" aria-label={`${person.name}'s photo`}
                {...clickable(() => setViewing(true), "button")}>
                {avatar}
            </span>
            {viewing && <PhotoLightbox fileId={person.photoFileId} name={person.name} onClose={() => setViewing(false)} />}
        </>
    );
}
