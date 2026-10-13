import { Outlet } from "react-router";
import PortalSessionProvider from "./PortalSessionProvider";

/** Every /portal page: the client portal's own session, never the staff one. */
export default function PortalRoot() {
    return (
        <PortalSessionProvider>
            <Outlet />
        </PortalSessionProvider>
    );
}
