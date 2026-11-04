import Icon from "@/shared/icons/Icon";
import { useOnline } from "./online";

/**
 * Without a connection the pages wait to load (React Query holds their requests until it is back) and nothing can be
 * saved: this says why, instead of leaving the skeletons to explain themselves. It goes away by itself.
 */
export default function OfflineBanner() {
    const online = useOnline();
    if (online) return null;
    return (
        <div className="banner hold app-offline" role="status">
            <Icon name="alert" />
            <span>You're offline. What's on screen may be out of date, and nothing can be saved until you're back online.</span>
        </div>
    );
}
