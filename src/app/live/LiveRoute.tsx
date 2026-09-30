import { Outlet } from "react-router";
import { useCurrentUser } from "@/app/session/useSession";
import { useLiveUpdates } from "./useLiveUpdates";

/** Keeps the live connection open for as long as someone is signed in. */
export default function LiveRoute() {
    useLiveUpdates(useCurrentUser().id);
    return <Outlet />;
}
