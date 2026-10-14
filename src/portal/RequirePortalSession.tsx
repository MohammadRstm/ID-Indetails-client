import { Navigate, Outlet, useLocation } from "react-router";
import BootScreen from "@/app/pages/BootScreen";
import { usePortalSession } from "./portalSession";

/** Portal pages that need a signed-in client; anyone else goes to the portal's sign-in page (coming back here afterwards). */
export default function RequirePortalSession() {
    const { status } = usePortalSession();
    const location = useLocation();
    if (status === "loading") return <BootScreen />;
    if (status === "signedOut") return <Navigate to="/portal/login" replace state={{ from: location }} />;
    return <Outlet />;
}
