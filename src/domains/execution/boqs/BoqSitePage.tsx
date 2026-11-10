import { Link, useParams } from "react-router";
import { isStatus } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import { MissingRecord } from "@/app/pages/NotFound";
import { useDomain } from "@/app/routing/domainContext";
import { PageHead } from "@/shared/components/Data/Panel";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Icon from "@/shared/icons/Icon";
import BoqHost from "./BoqHost";
import BoqPanel from "./BoqPanel";
import { toBoqSite, useBoqSite } from "./boqsApi";

/**
 * One site an author writes BOQs for: its name and location over the BOQs panel, with only the author's own drafts in
 * it, and the editor the link asks for (?boq=). Nothing else of the site is shown.
 */
export default function BoqSitePage() {
    const { id } = useParams();
    const domain = useDomain();
    const siteId = Number(id);
    const query = useBoqSite(siteId);
    const back = `/${domain}/boq-sites`;
    if (!(Number.isInteger(siteId) && siteId > 0) || isStatus(query.error, 404)) return <MissingRecord title="Site not found" to={back} back="Back to BOQs" />;
    if (loadFailed(query)) return <div className="page"><LoadError error={query.error} retry={() => query.refetch()} what="the site" /></div>;
    if (!query.data) return <div className="page" aria-busy="true"><SkeletonLines lines={6} /></div>;
    const site = toBoqSite(query.data);

    return (
        <div className="page">
            <div className="crumbs">
                <Link to={back}>BOQs</Link>
                <Icon name="chevronRight" />
                <span>{site.title}</span>
            </div>
            <PageHead title={site.title} sub={query.data.location} />
            <BoqPanel project={site} />
            <BoqHost project={site} />
        </div>
    );
}
