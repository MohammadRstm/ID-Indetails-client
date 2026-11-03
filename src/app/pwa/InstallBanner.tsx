import Icon from "@/shared/icons/Icon";
import { installApp, putInstallBannerAway, useInstallBannerAway, useInstallWay } from "./install";

/** Suggests installing the app, on phones only (client.css): a computer installs it from the account menu. */
export default function InstallBanner() {
    const way = useInstallWay();
    const away = useInstallBannerAway();
    if (!way || away) return null;
    return (
        <div className="banner app-install">
            <Icon name="download" />
            <span>Add ID-Indetails to your home screen, to open it like an app.</span>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => { putInstallBannerAway(); installApp(); }}>Install</button>
            <button type="button" className="icon-btn" aria-label="Not now" title="Not now" onClick={putInstallBannerAway}>
                <Icon name="x" />
            </button>
        </div>
    );
}
