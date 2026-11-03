import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { http } from "@/api/http";
import type { Paged } from "@/api/types";
import BootScreen from "@/app/pages/BootScreen";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useMarkRead } from "@/domains/shared/notifications/notificationsApi";
import { describe, type Notification } from "@/domains/shared/notifications/notificationWords";
import { openable, useNotificationRoute, useReader } from "@/domains/shared/notifications/useNotificationLinks";
import { pushDataFrom, type PushData } from "./pushMessages";

/** How far back a tapped notification is looked for: it was pushed moments ago, but others may have come since. */
const RECENT = 50;

/**
 * Where a tapped push lands (src/sw.ts sends it to /open-push): a notification opens what the bell would open, and is
 * marked read; a message opens its chat; a reminder its page. Anything the person may not open, or that is gone, opens
 * their notifications.
 */
export default function PushOpener() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const permissions = usePermissions();
    const reader = useReader();
    const routeOf = useNotificationRoute();
    const markRead = useMarkRead();
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        const base = reader.domain ? `/${reader.domain}` : "/company";
        const fallback = `${base}/notifications`;
        const allowed = (route: string) => (openable(permissions, route) ? route : fallback);

        const landing = async (push: PushData | null): Promise<string> => {
            if (!push) return fallback;
            const target = push.target;
            if (push.notificationId) {
                const recent = await http.get<Paged<Notification>>("/notifications", { params: { page: 1, pageSize: RECENT } });
                const note = recent.data.items.find((n) => n.id === push.notificationId);
                if (!note) return fallback;
                if (!note.readAt) markRead.mutate(note.id);
                return (await routeOf(describe(note, reader))) ?? fallback;
            }
            if (push.kind === "message") {
                const chat = target.page === "announcements" ? "announcements=1"
                    : target.teamId ? `group=${target.teamId}` : target.userId ? `with=${target.userId}` : "";
                return `${base}/messages${chat ? `?${chat}` : ""}`;
            }
            if (target.type === "labour_week" && target.projectId) {
                return allowed(`/execution/projects/${target.projectId}?tab=financials&part=expenses&view=labour&labour=${target.weekStart ?? "current"}`);
            }
            if (target.page === "work") return allowed("/design/my-work");
            return fallback;
        };

        landing(pushDataFrom(params.get("push")))
            .catch(() => fallback)
            .then((route) => navigate(route, { replace: true }));
    }, [params, navigate, permissions, reader, routeOf, markRead]);

    return <BootScreen />;
}
