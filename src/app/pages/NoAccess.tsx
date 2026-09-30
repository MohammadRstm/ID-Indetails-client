import { useSession } from "@/app/session/useSession";
import Empty from "@/shared/components/Feedback/Empty";

/** Signed in, but with no area to open (every permission revoked, or a deactivated role). */
export default function NoAccess() {
    const { signOut } = useSession();
    return (
        <div className="launcher">
            <Empty
                art="search"
                title="There is nothing here for you yet"
                text="Your account doesn't have access to any area. Ask an admin to check your permissions."
                action={<button className="btn btn-sm" onClick={() => signOut()}>Sign out</button>}
            />
        </div>
    );
}
