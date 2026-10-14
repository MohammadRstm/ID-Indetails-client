import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Outlet } from "react-router";
import { createQueryClient } from "@/api/queryClient";
import { usePortalLive } from "./live/usePortalLive";
import PortalSessionProvider from "./PortalSessionProvider";

/**
 * Every /portal page: the client portal's own session, never the staff one, and its own query cache. A staff sign-out
 * in the same browser clears the staff app's cache, and must leave what the client sees alone.
 */
export default function PortalRoot() {
    const [queryClient] = useState(createQueryClient);
    return (
        <QueryClientProvider client={queryClient}>
            <PortalSessionProvider>
                <PortalLive />
                <Outlet />
            </PortalSessionProvider>
        </QueryClientProvider>
    );
}

/** Keeps the live connection open while a client is signed in. */
function PortalLive() {
    usePortalLive();
    return null;
}
