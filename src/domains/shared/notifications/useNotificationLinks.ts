import { useNavigate } from "react-router";
import { http } from "@/api/http";
import type { Schemas } from "@/api/types";
import { P } from "@/app/permissions/codes";
import type { Domain, Permissions } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { canOpen, companyRoutes } from "@/app/routing/routeTable";
import { useCurrentUser } from "@/app/session/useSession";
import { useArea } from "@/app/shell/useArea";
import type { NotificationView, Reader } from "./notificationWords";

/** The person reading, as the notification words need them. */
export function useReader(): Reader {
    const permissions = usePermissions();
    const user = useCurrentUser();
    const area = useArea();
    const visible = (["design", "execution"] as Domain[]).filter((d) => permissions.canSeeDomain(d));
    const domain = area.kind === "domain" ? area.domain : (user.domain as Domain | null) ?? visible[0] ?? null;
    return { userId: user.id, isAdmin: permissions.isAdmin, logsWork: permissions.has(P.WORK_ENTRY_CREATE) && canOpen(permissions, "design", "my-work"), domain };
}

/** Whether this person may open a page: a business's page by its route's rules, a company page by its own. */
function openable(permissions: Permissions, route: string): boolean {
    const [first, ...rest] = route.split("?")[0].split("/").filter(Boolean);
    const path = rest.join("/");
    if (first === "company") return companyRoutes.some((r) => r.path === path && r.access(permissions));
    if (first !== "design" && first !== "execution") return false;
    return path ? canOpen(permissions, first, route.slice(first.length + 2)) : permissions.canSeeDomain(first);
}

/** Opens what a notification is about, when the reader may; otherwise the click only marks it read. */
export function useOpenNotification() {
    const navigate = useNavigate();
    const permissions = usePermissions();
    return async (view: NotificationView) => {
        let route = view.route;
        // a client's page is in its own business, which only the client knows
        if (!route && view.clientId) {
            const client = await http.get<Schemas["ClientResponse"]>(`/clients/${view.clientId}`).then((r) => r.data).catch(() => null);
            if (client) route = `/${client.domain}/clients/${client.id}`;
        }
        if (route && openable(permissions, route)) navigate(route);
    };
}
