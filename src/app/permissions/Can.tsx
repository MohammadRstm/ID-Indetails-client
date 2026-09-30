import type { ReactNode } from "react";
import type { PermissionCode } from "./codes";
import { usePermissions } from "./usePermissions";

type CanProps = {
    /** Every one of these is needed. */
    all?: PermissionCode[];
    /** Any one of these is enough. */
    any?: PermissionCode[];
    /** Shown instead when the person lacks them; nothing by default. */
    fallback?: ReactNode;
    children: ReactNode;
};

/** Shows its children only to people holding the permissions. */
export default function Can({ all, any, fallback = null, children }: CanProps) {
    const permissions = usePermissions();
    const allowed = (!all || permissions.hasAll(...all)) && (!any || permissions.hasAny(...any));
    return <>{allowed ? children : fallback}</>;
}
