import { Navigate, Outlet, useLocation } from "react-router";
import ContactHost from "@/app/contact/ContactHost";
import BootScreen from "@/app/pages/BootScreen";
import { sendFromClient } from "./portalApi";
import { usePortalSession } from "./portalSession";

/**
 * Portal pages that need a signed-in client; anyone else goes to the portal's sign-in page (coming back here
 * afterwards). A signed-in client can contact the developer from any of them.
 */
export default function RequirePortalSession() {
    const { status } = usePortalSession();
    const location = useLocation();
    if (status === "loading") return <BootScreen />;
    if (status === "signedOut") return <Navigate to="/portal/login" replace state={{ from: location }} />;
    return (
        <>
            <Outlet />
            <ContactHost send={sendFromClient} />
        </>
    );
}
