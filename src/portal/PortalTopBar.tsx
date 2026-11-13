import { openContact } from "@/app/contact/contact";
import Logo from "@/shared/components/Identity/Logo";
import { useBranding } from "@/shared/components/Identity/useBranding";
import Icon from "@/shared/icons/Icon";
import PortalBell from "./notifications/PortalBell";
import { accountName, usePortalSession } from "./portalSession";

/** The bar over every signed-in portal page: the company, the client's name, the bell, Contact the developer and Sign out. */
export default function PortalTopBar() {
    const { account, signOut } = usePortalSession();
    const branding = useBranding();
    if (!account) return null;

    return (
        <header className="portal-top">
            <div className="row" style={{ gap: 10, minWidth: 0 }}>
                <Logo size={30} />
                <div style={{ minWidth: 0 }}>
                    <div className="logo-name trunc">{branding.data?.name || "ID InDetails"}</div>
                    <div className="logo-sub">Client portal</div>
                </div>
            </div>
            <div className="row" style={{ gap: 10 }}>
                <span className="muted trunc portal-who">{accountName(account)}</span>
                <PortalBell />
                {/* a narrow phone shows the icons only: the words stay for screen readers */}
                <button type="button" className="btn btn-sm" onClick={() => openContact()} title="Contact the developer"><Icon name="mail" /><span className="portal-btn-label">Contact</span></button>
                <button type="button" className="btn btn-sm" onClick={() => void signOut()}><Icon name="logout" /><span className="portal-btn-label">Sign out</span></button>
            </div>
        </header>
    );
}
