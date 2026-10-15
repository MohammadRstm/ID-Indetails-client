import { createContext, useContext } from "react";
import type { PortalAccount, PortalAuthResponse } from "./portalApi";

export type PortalSessionStatus = "loading" | "signedIn" | "signedOut";

export type PortalSessionValue = {
    status: PortalSessionStatus;
    account: PortalAccount | null;
    /** Why the person was signed out, shown on the sign-in page. */
    notice: string | null;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    /** Starts the session from an answer that signed the client in (accepting an invitation). */
    adopt: (auth: PortalAuthResponse) => void;
};

export const PortalSessionContext = createContext<PortalSessionValue | null>(null);

/** How the client is called on screen: their name, or their email when they have none. */
export function accountName(account: PortalAccount): string {
    return `${account.firstName} ${account.lastName}`.trim() || account.email;
}

/** The client portal's session. Only inside the /portal pages. */
export function usePortalSession(): PortalSessionValue {
    const value = useContext(PortalSessionContext);
    if (!value) throw new Error("usePortalSession must be used inside PortalSessionProvider.");
    return value;
}
