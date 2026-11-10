import { useNavigate } from "react-router";
import { loadFailed } from "@/api/queryState";
import { useDomain } from "@/app/routing/domainContext";
import { ProjectTile } from "@/shared/components/Data/Bits";
import { PageHead } from "@/shared/components/Data/Panel";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { clickable } from "@/shared/utils/clickable";
import { useBoqSites } from "./boqsApi";

/**
 * The sites a BOQ author writes drafts for, in either business: Execution's active client sites, by name and location.
 * Nothing else of a site is shown here; opening one shows only the author's own BOQs on it.
 */
export default function BoqSitesPage() {
    const sites = useBoqSites();
    const domain = useDomain();
    const navigate = useNavigate();

    return (
        <div className="page">
            <PageHead title="BOQs" sub="The sites you write bills of quantities for. Open one to draft its quantities, then submit a draft to the site when it is ready." />
            {loadFailed(sites) ? <LoadError error={sites.error} retry={() => sites.refetch()} what="the sites" />
                : !sites.data ? <SkeletonLines lines={4} />
                    : sites.data.length === 0 ? <Empty art="search" title="No site to write BOQs for" text="Active Execution sites with a client appear here." />
                        : (
                            <div className="grid g-3" role="list" aria-label="Sites">
                                {sites.data.map((s) => (
                                    <div key={s.id} role="listitem">
                                        <div className="panel click" {...clickable(() => navigate(`/${domain}/boq-sites/${s.id}`), "link")} aria-label={`Open ${s.title}`}>
                                            <div className="panel-body">
                                                <div className="row" style={{ gap: 10 }}>
                                                    <ProjectTile />
                                                    <div className="grow" style={{ minWidth: 0 }}>
                                                        <div className="trunc site-card-title" style={{ fontWeight: 650 }}>{s.title}</div>
                                                        <div className="muted trunc" style={{ fontSize: 12 }}>{s.location || "-"}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
        </div>
    );
}
