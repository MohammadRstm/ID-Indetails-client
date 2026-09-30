import type { ReactNode } from "react";
import { useSearchParams } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Modal from "@/shared/components/Overlays/Modal";
import { useProject, type Project } from "../projects/projectsApi";
import { useInvoice } from "./billingApi";
import { useBillingLinks } from "./billingLinks";
import InvoiceEditor from "./InvoiceEditor";
import InvoiceModal from "./InvoiceModal";
import RecordPaymentModal from "./RecordPaymentModal";
import SendInvoiceModal from "./SendInvoiceModal";

function Loading({ onClose }: { onClose: () => void }) {
    return <Modal size="md" title="Loading…" onClose={onClose}><SkeletonLines lines={5} /></Modal>;
}

/** The page's project, or the one an invoice belongs to. */
function WithProject({ project, projectId, onClose, children }: { project?: Project; projectId: number; onClose: () => void; children: (project: Project) => ReactNode }) {
    const loaded = useProject(project ? 0 : projectId).data;
    const p = project ?? loaded;
    return p ? <>{children(p)}</> : <Loading onClose={onClose} />;
}

function EditDraft({ invoiceId, project }: { invoiceId: number; project?: Project }) {
    const links = useBillingLinks();
    const inv = useInvoice(invoiceId).data;
    if (!inv) return <Loading onClose={links.close} />;
    return (
        <WithProject project={project} projectId={inv.project.id} onClose={links.close}>
            {(p) => <InvoiceEditor project={p} invoice={inv} onClose={links.close} onSend={(saved) => links.send(saved.id)} />}
        </WithProject>
    );
}

function SendById({ invoiceId }: { invoiceId: number }) {
    const links = useBillingLinks();
    const inv = useInvoice(invoiceId).data;
    return inv ? <SendInvoiceModal invoice={inv} onClose={links.close} /> : <Loading onClose={links.close} />;
}

function PayFor({ invoiceId, project }: { invoiceId: number | null; project?: Project }) {
    const links = useBillingLinks();
    const inv = useInvoice(project ? null : invoiceId).data;
    const projectId = project?.id ?? inv?.project.id;
    if (projectId == null) return <Loading onClose={links.close} />;
    return (
        <WithProject project={project} projectId={projectId} onClose={links.close}>
            {(p) => <RecordPaymentModal project={p} invoiceId={invoiceId} onClose={links.close} />}
        </WithProject>
    );
}

/**
 * Whichever billing window the link asks for (see useBillingLinks), for the viewer who may open it. On a
 * project's page, new invoices and payments are for that project.
 */
export default function BillingModalHost({ project }: { project?: Project }) {
    const permissions = usePermissions();
    const [params] = useSearchParams();
    const links = useBillingLinks();
    if (!permissions.has(P.FINANCIAL_VIEW)) return null;
    const id = (key: string) => {
        const n = Number(params.get(key));
        return Number.isInteger(n) && n > 0 ? n : null;
    };
    const invoice = params.get("invoice");
    const pay = params.get("pay");

    if (invoice === "new") {
        return project && permissions.has(P.INVOICE_CREATE)
            ? <InvoiceEditor project={project} onClose={links.close} onSend={(saved) => links.send(saved.id)} /> : null;
    }
    if (id("invoice") != null) {
        return (
            <InvoiceModal invoiceId={id("invoice")!} onClose={links.close}
                onSend={(inv) => links.send(inv.id)} onEdit={(inv) => links.editDraft(inv.id)} onPayment={(inv) => links.recordPayment(inv.id)} />
        );
    }
    if (id("edit") != null && permissions.has(P.INVOICE_CREATE)) return <EditDraft invoiceId={id("edit")!} project={project} />;
    if (id("send") != null && permissions.has(P.INVOICE_SEND)) return <SendById invoiceId={id("send")!} />;
    if (pay && permissions.has(P.PAYMENT_RECORD)) {
        const invoiceId = pay === "1" ? null : id("pay");
        return project || invoiceId != null ? <PayFor invoiceId={invoiceId} project={project} /> : null;
    }
    return null;
}
