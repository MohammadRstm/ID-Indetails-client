import Icon from "@/shared/icons/Icon";
import { installApp, useInstallWay } from "./install";

/** "Install ID-Indetails" in an account menu, while this browser can install the app. */
export default function InstallMenuItem({ close }: { close: () => void }) {
    const way = useInstallWay();
    if (!way) return null;
    return (
        <button className="pop-item" onClick={() => { close(); installApp(); }}>
            <Icon name="download" />Install ID-Indetails
        </button>
    );
}
