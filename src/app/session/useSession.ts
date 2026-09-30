import { useContext } from "react";
import type { CurrentUser } from "@/api/types";
import { SessionContext, type SessionValue } from "./sessionContext";

export function useSession(): SessionValue {
    const session = useContext(SessionContext);
    if (!session) throw new Error("useSession must be used inside SessionProvider.");
    return session;
}

/** The signed-in person. Only for the signed-in part of the app, where the route guard guarantees one. */
export function useCurrentUser(): CurrentUser {
    const { user } = useSession();
    if (!user) throw new Error("useCurrentUser needs a signed-in user.");
    return user;
}

export function fullName(user: Pick<CurrentUser, "firstName" | "lastName" | "email">): string {
    const name = `${user.firstName} ${user.lastName}`.trim();
    return name || user.email;
}
