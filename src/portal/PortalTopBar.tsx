import Logo from "@/shared/components/Identity/Logo";
import { useBranding } from "@/shared/components/Identity/useBranding";
import Icon from "@/shared/icons/Icon";
import { accountName, usePortalSession } from "./portalSession";

/** The bar over every signed-in portal page: the company, the client's name and Sign out. */
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
                <button type="button" className="btn btn-sm" onClick={() => void signOut()}><Icon name="logout" />Sign out</button>
            </div>
        </header>
    );
}
