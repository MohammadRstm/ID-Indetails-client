import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useSession } from "@/app/session/useSession";
import NotAuthorized from "@/app/pages/NotAuthorized";
import BootScreen from "@/app/pages/BootScreen";
import { DomainContext, useDomain } from "./domainContext";
import { homePath } from "./home";
import { pageFor, type CompanyRoute, type DomainRoute } from "./routeTable";

/** Signed in, or off to the sign-in page (coming back here afterwards). */
export function RequireSession() {
    const { status } = useSession();
    const location = useLocation();
    if (status === "loading") return <BootScreen />;
    if (status === "signedOut") return <Navigate to="/login" replace state={{ from: location }} />;
    return <Outlet />;
}

/** A person with a temporary password chooses their own before anything else (the API refuses the rest). */
export function RequirePasswordChanged() {
    const { user } = useSession();
    if (user?.mustChangePassword) return <Navigate to="/change-password" replace />;
    return <Outlet />;
}

/** Pages for signed-out visitors only; someone signed in goes home. */
export function PublicOnly({ children }: { children: ReactNode }) {
    const { status, user } = useSession();
    if (status === "loading") return <BootScreen />;
    if (status === "signedIn" && user) return <HomeRedirect />;
    return <>{children}</>;
}

export function HomeRedirect() {
    const permissions = usePermissions();
    return <Navigate to={homePath(permissions)} replace />;
}

/** The domain in the URL must be one the person may enter; otherwise they go home. */
export function DomainGuard() {
    const { domain } = useParams();
    const permissions = usePermissions();
    if (!permissions.canSeeDomain(domain)) return <HomeRedirect />;
    return (
        <DomainContext value={domain}>
            <Outlet />
        </DomainContext>
    );
}

/**
 * One route of a domain: the admin or employee page, if the person may open it. A route that has no page
 * for their workspace sends them home (as the prototype does); one they lack the permission for says so.
 */
export function DomainPage({ route }: { route: DomainRoute }) {
    const permissions = usePermissions();
    const domain = useDomain();
    const page = pageFor(route, permissions);
    if (!page) return <HomeRedirect />;
    if (!page.access({ p: permissions, domain })) return <NotAuthorized />;
    return <>{page.element}</>;
}

export function CompanyPage({ route }: { route: CompanyRoute }) {
    const permissions = usePermissions();
    if (!route.access(permissions)) return <NotAuthorized />;
    return <>{route.element}</>;
}
