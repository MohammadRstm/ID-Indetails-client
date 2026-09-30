import { Link } from "react-router";
import Empty from "@/shared/components/Feedback/Empty";

/** An address that leads nowhere, or a record the person can't see (the API answers 404 for both). */
export default function NotFound({ what = "page" }: { what?: string }) {
    return (
        <div className="page page-state">
            <Empty
                art="search"
                title={`This ${what} couldn't be found`}
                text="It may have been removed, or the link may be wrong."
                action={<Link className="btn btn-sm" to="/">Go to your start page</Link>}
            />
        </div>
    );
}

/** A record's page when the record isn't there or the person can't see it (the prototype's "Project not found"). */
export function MissingRecord({ title, to, back }: { title: string; to: string; back: string }) {
    return (
        <div className="page">
            <Empty art="search" title={title} action={<Link className="btn" to={to}>{back}</Link>} />
        </div>
    );
}
