import { useRef, useState } from "react";
import { loadFailed } from "@/api/queryState";
import Pager from "@/shared/components/Data-Tables/Pager";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { usePayments } from "../../shared/billing/billingApi";
import { useBillingLinks } from "../../shared/billing/billingLinks";
import { PaymentTable } from "../../shared/billing/BillingTables";
import type { Project } from "../../shared/projects/projectsApi";

const PAGE_SIZE = 20;

/**
 * The site's client payments with the account label each is filed under, so one can be filed, changed or cleared
 * from the row's menu (payment:record). The label decides the row a payment counts in on the account. Twenty a page.
 */
export default function SitePayments({ project }: { project: Project }) {
    const links = useBillingLinks();
    const [page, setPage] = useState(1);
    const anchor = useRef<HTMLElement>(null);
    const query = usePayments({ projectId: project.id, page, pageSize: PAGE_SIZE });
    const payments = query.data?.items;
    return (
        <section className="panel mt" aria-label="Payments received" ref={anchor}>
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Payments received</div>
                    <div className="panel-sub">Each payment and the account label it is filed under.</div>
                </div>
            </div>
            {loadFailed(query) ? <div className="panel-body"><LoadError error={query.error} retry={() => query.refetch()} what="the payments" /></div>
                : !payments ? <div className="panel-body"><SkeletonLines lines={3} /></div>
                    : (
                        <>
                            <PaymentTable payments={payments} onOpen={links.openInvoice} actions />
                            <Pager page={page} pageSize={PAGE_SIZE} total={query.data?.totalCount ?? 0} onPage={setPage} anchor={anchor} />
                        </>
                    )}
        </section>
    );
}
