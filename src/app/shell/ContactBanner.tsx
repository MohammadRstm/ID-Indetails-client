import { useState } from "react";
import { useNavigate } from "react-router";
import { contactBannerSeen, openContact, putContactBannerAway } from "@/app/contact/contact";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useCurrentUser } from "@/app/session/useSession";
import Icon from "@/shared/icons/Icon";
import { contactPath } from "./contactPath";
import type { ShellArea } from "./useArea";

/**
 * Tells each person, once on each device (the installed app or a browser), that they can reach the developer from
 * Settings → Contact. Opened or closed, it doesn't come back there.
 */
export default function ContactBanner({ area }: { area: ShellArea }) {
    const me = useCurrentUser();
    const permissions = usePermissions();
    const navigate = useNavigate();
    const [away, setAway] = useState(() => contactBannerSeen(me.id));
    if (away) return null;

    const putAway = () => {
        putContactBannerAway(me.id);
        setAway(true);
    };
    const go = () => {
        putAway();
        const path = contactPath(permissions, area);
        if (path) navigate(path);
        else openContact();
    };

    return (
        <div className="banner app-contact">
            <Icon name="mail" />
            <span>Something not working, or an idea? You can now reach the developer from Settings → Contact.</span>
            <button type="button" className="btn btn-sm btn-primary" onClick={go}>Go to Contact</button>
            <button type="button" className="icon-btn" aria-label="Hide the Contact banner" title="Hide" onClick={putAway}>
                <Icon name="x" />
            </button>
        </div>
    );
}
