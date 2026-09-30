import { createContext } from "react";
import type { AuthResponse, CurrentUser } from "@/api/types";

export type SessionStatus = "loading" | "signedOut" | "signedIn";

export type SessionValue = {
    status: SessionStatus;
    user: CurrentUser | null;
    /** Why the person was signed out, shown on the sign-in page. */
    notice: string | null;
    signIn(email: string, password: string): Promise<void>;
    signOut(): Promise<void>;
    /** Starts a session from a response that already signed the person in (accepting an invitation, changing the password). */
    adopt(auth: AuthResponse): void;
};

export const SessionContext = createContext<SessionValue | null>(null);
