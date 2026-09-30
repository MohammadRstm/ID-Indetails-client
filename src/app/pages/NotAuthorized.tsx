import { Link } from "react-router";
import Empty from "@/shared/components/Feedback/Empty";

/** A page the person's permissions don't cover. */
export default function NotAuthorized() {
    return (
        <div className="page page-state">
            <Empty
                art="search"
                title="You don't have access to this page"
                text="Your permissions don't include it. If you need it, ask an admin."
                action={<Link className="btn btn-sm" to="/">Go to your start page</Link>}
            />
        </div>
    );
}
