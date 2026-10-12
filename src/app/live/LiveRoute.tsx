import { Outlet } from "react-router";
import { useCurrentUser } from "@/app/session/useSession";
import ProtonHost from "@/domains/shared/proton/ProtonHost";
import { useLiveUpdates } from "./useLiveUpdates";

/** Keeps the live connection open, and Proton at hand, for as long as someone is signed in. */
export default function LiveRoute() {
    useLiveUpdates(useCurrentUser().id);
    return (
        <>
            <Outlet />
            <ProtonHost />
        </>
    );
}
