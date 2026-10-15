import { Outlet } from "react-router";
import { usePortalLive } from "./live/usePortalLive";
import PortalSessionProvider from "./PortalSessionProvider";

/** Every /portal page: the client portal's own session, never the staff one. */
export default function PortalRoot() {
    return (
        <PortalSessionProvider>
            <PortalLive />
            <Outlet />
        </PortalSessionProvider>
    );
}

/** Keeps the live connection open while a client is signed in. */
function PortalLive() {
    usePortalLive();
    return null;
}
