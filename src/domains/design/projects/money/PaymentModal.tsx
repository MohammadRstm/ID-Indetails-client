import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { CostRow } from "@/shared/components/Data/Money";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import { FieldError } from "@/shared/components/Forms/Field";
import { Segmented } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { fmtDateY } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { useClients } from "../../../shared/clients/clientsApi";
import type { Project } from "../../../shared/projects/projectsApi";
import { useRevenueHistory, useSetProjectBilling } from "./moneyApi";

type Billing = "client" | "internal";

/**
 * The customer payment (the prototype's PF.PaymentModal): client work with its payment, or internal work
 * with none. Client work needs a client, so one is asked for when an internal project becomes client work.
 */
export default function PaymentModal({ project, onClose }: { project: Project; onClose: () => void }) {
    const permissions = usePermissions();
    const save = useSetProjectBilling(project.id);
    const [billing, setBilling] = useState<Billing>(project.billingType === "internal" ? "internal" : "client");
    const [amount, setAmount] = useState(project.money?.revenue ?? 0);
    const [clientId, setClientId] = useState(project.client ? String(project.client.id) : "");
    const needsClient = billing === "client" && !project.client;
    const clients = useClients({ domain: project.domain, pageSize: 100 }, needsClient).data?.items ?? [];
    const history = useRevenueHistory(project.id, permissions.has(P.ACTIVITY_VIEW)).data ?? [];
    const errors = useFormErrors();
    const clientError = billing === "client" && !clientId && "Choose the client this work is for.";

    function submit() {
        if (save.isPending) return;
        if (clientError) return errors.tried();
        save.mutate({
            billingType: billing,
            clientId: billing === "internal" ? null : +clientId,
            revenue: billing === "client" ? amount : null,
        }, {
            onSuccess: () => {
                toast({ text: billing === "internal" ? `${project.title} is now an internal project` : `Payment set to ${money.fmt(amount)}`, icon: "checkCircle" });
                onClose();
            },
        });
    }

    return (
        <Modal title="Customer payment" sub={project.title} onClose={onClose}
            foot={
                <>
                    <div className="grow">{save.error ? <span className="err"><Icon name="alert" />{errorMessage(save.error)}</span> : "The amount can be changed until the project is completed."}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={save.isPending} onClick={submit}>Save</button>
                </>
            }>
            <div className="field">
                <label className="label">Project type</label>
                <Segmented value={billing} onChange={setBilling} aria-label="Project type" options={[{ value: "client", label: "Client project" }, { value: "internal", label: "Internal" }]} />
                <div className="hint">
                    {billing === "client" ? "A client project carries a payment amount and can show profit and margin."
                        : `An internal project has no payment - its labour and expenses are tracked as company cost.${project.client ? ` It will no longer belong to ${project.client.displayName}.` : ""}`}
                </div>
            </div>
            {needsClient && (
                <div className="field mt">
                    <label className="label" htmlFor="pay-client">Client</label>
                    <Select id="pay-client" value={clientId} onChange={setClientId}
                        options={[{ value: "", label: "Choose the client" }, ...clients.map((c) => ({ value: String(c.id), label: c.displayName }))]} />
                    <FieldError message={errors.show("client", clientError)} />
                </div>
            )}
            {billing === "client" && (
                <div className="field mt">
                    <label className="label" htmlFor="pay-amount">Customer payment</label>
                    <AmountField id="pay-amount" value={amount} currency="USD" currencies={false} onChange={setAmount} />
                    <div className="hint">Total amount the company is paid for this project.</div>
                </div>
            )}
            {history.length > 0 && (
                <div className="mt">
                    <div className="u" style={{ marginBottom: 4 }}>History</div>
                    {history.map((e) => (
                        <CostRow key={e.id} label={e.kind === "revenue_changed" ? `Changed from ${money.fmt(e.prevAmount ?? 0)}` : "Set"}
                            meta={fmtDateY(e.occurredAt)} value={money.fmt(e.amount ?? 0)} />
                    ))}
                </div>
            )}
        </Modal>
    );
}
