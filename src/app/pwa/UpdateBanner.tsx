import Icon from "@/shared/icons/Icon";
import { useNewVersionReady } from "./newVersion";

/** Offers the version that went out since the app was opened. It never reloads by itself, so nothing typed is lost. */
export default function UpdateBanner() {
    const ready = useNewVersionReady();
    if (!ready) return null;
    return (
        <div className="banner app-update" role="status">
            <Icon name="refresh" />
            <span>A new version of ID InDetails is ready.</span>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
    );
}
