import { useMemo } from "react";
import { useCurrentUser } from "@/app/session/useSession";
import { permissionsOf, type Permissions } from "./permissions";

/** The signed-in person's permissions. Only used inside the signed-in part of the app. */
export function usePermissions(): Permissions {
    const user = useCurrentUser();
    return useMemo(() => permissionsOf(user), [user]);
}
