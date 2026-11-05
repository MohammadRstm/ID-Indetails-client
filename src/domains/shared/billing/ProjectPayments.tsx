import { useRef, useState } from "react";
import { loadFailed } from "@/api/queryState";
import Pager from "@/shared/components/Data-Tables/Pager";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import type { Project } from "../projects/projectsApi";
import { usePayments } from "./billingApi";
import { useBillingLinks } from "./billingLinks";
import { PaymentTable } from "./BillingTables";

const PAGE_SIZE = 20;

/**
 * A project's client payments, under its invoices: each one, what it paid and the account label it is filed under, so
 * one can be applied, filed or voided from the row's menu (payment:record, payment:void). On a site the label decides
 * the row a payment counts in on the account. Twenty a page.
 */
export default function ProjectPayments({ project }: { project: Project }) {
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
                    <div className="panel-sub">Each payment, the invoice it paid and the account label it is filed under.</div>
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
