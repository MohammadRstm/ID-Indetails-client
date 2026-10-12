import type { ReactNode } from "react";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useArea } from "@/app/shell/useArea";
import type { ProtonRef } from "./protonApi";
import { ProtonContext } from "./protonContext";
import { stepOf } from "./uiCommands";
import { useProtonConversation } from "./useProtonConversation";

/** Gives the panel and the Proton page their one shared conversation, for people who have Proton. */
export default function ProtonProvider({ children }: { children: ReactNode }) {
    const permissions = usePermissions();
    return permissions.has(P.PROTON_USE) ? <Shared>{children}</Shared> : <>{children}</>;
}

function Shared({ children }: { children: ReactNode }) {
    const conversation = useProtonConversation();
    const permissions = usePermissions();
    const area = useArea();
    // the same route rules as Proton's own commands: a link shows only where this person may go
    const linkOf = (ref: ProtonRef) => {
        const step = stepOf({ type: `open_${ref.type}`, id: ref.id, domain: ref.domain, label: ref.name }, permissions,
            area.kind === "domain" ? area.domain : null);
        return step?.kind === "go" ? step.path : null;
    };
    return <ProtonContext.Provider value={{ conversation, linkOf }}>{children}</ProtonContext.Provider>;
}
