import { createContext, useContext } from "react";
import type { Domain } from "@/app/permissions/permissions";

export const DomainContext = createContext<Domain | null>(null);

/** The domain of the page being shown (the first segment of the URL). */
export function useDomain(): Domain {
    const domain = useContext(DomainContext);
    if (!domain) throw new Error("useDomain must be used inside a domain route.");
    return domain;
}
