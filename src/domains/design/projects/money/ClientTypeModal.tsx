import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import { FieldError } from "@/shared/components/Forms/Field";
import { Segmented } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import Modal from "@/shared/components/Overlays/Modal";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { useClients } from "../../../shared/clients/clientsApi";
import type { Project } from "../../../shared/projects/projectsApi";
import { useSetProjectBilling } from "./moneyApi";

type Billing = "client" | "internal";

/**
 * Client work or internal work, and the client. Internal work has no payment: becoming internal drops it to 0, and
 * client work again starts with none until it is set.
 */
export default function ClientTypeModal({ project, onClose }: { project: Project; onClose: () => void }) {
    const save = useSetProjectBilling(project.id);
    const [billing, setBilling] = useState<Billing>(project.billingType === "internal" ? "internal" : "client");
    const [clientId, setClientId] = useState(project.client ? String(project.client.id) : "");
    const clients = useClients({ domain: project.domain, pageSize: 100 }, billing === "client").data?.items ?? [];
    const errors = useFormErrors();
    const clientError = billing === "client" && !clientId && "Choose the client this work is for.";
    // the client that would be saved; another one than now (or none) ends the current client's portal access
    const chosenClientId = billing === "internal" || !clientId ? null : +clientId;
    const changesClient = project.client != null && chosenClientId !== project.client.id;
    const dropsPayment = billing === "internal" && (project.money?.revenue ?? 0) > 0;

    function submit() {
        if (save.isPending) return;
        if (clientError) return errors.tried();
        save.mutate({ billingType: billing, clientId: chosenClientId }, {
            onSuccess: (saved) => {
                toast({
                    text: billing === "internal" ? `${project.title} is now an internal project` : `${project.title} is client work for ${saved.client?.displayName ?? "the client"}`,
                    icon: "checkCircle",
                });
                onClose();
            },
        });
    }

    return (
        <Modal title="Client & type" sub={project.title} onClose={onClose}
            foot={
                <>
                    <div className="grow">{save.error ? <span className="err"><Icon name="alert" />{errorMessage(save.error)}</span> : null}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={save.isPending} onClick={submit}>{save.isPending ? "Saving…" : "Save"}</button>
                </>
            }>
            <div className="field">
                <label className="label required">Project type</label>
                <Segmented value={billing} onChange={setBilling} aria-label="Project type" options={[{ value: "client", label: "Client project" }, { value: "internal", label: "Internal" }]} />
                <div className="hint">
                    {billing === "client" ? "A client project carries a payment and can show profit and margin."
                        : "An internal project has no payment - its labour and expenses are tracked as company cost."}
                </div>
            </div>
            {billing === "client" && (
                <div className="field mt">
                    <label className="label required" htmlFor="ct-client">Client</label>
                    <Select id="ct-client" value={clientId} onChange={setClientId} searchable
                        options={[{ value: "", label: "Choose the client", disabled: true }, ...clients.map((c) => ({ value: String(c.id), label: c.displayName }))]} />
                    <FieldError message={errors.show("client", clientError)} />
                    {project.billingType === "internal" && <div className="hint">It starts with no payment: set it on the Financials tab once saved.</div>}
                </div>
            )}
            {dropsPayment && (
                <div className="banner hold mt" role="note">
                    <Icon name="alert" />
                    <div className="grow">Its customer payment drops to 0, and the payment history says it became internal work.</div>
                </div>
            )}
            {changesClient && (
                <div className="banner hold mt" role="note">
                    <Icon name="alert" />
                    <div className="grow">
                        {project.client?.displayName}'s contacts lose access to this project's client portal. Its chat and comments stay with the
                        project: if it gets a client again, that client's contacts will see them once invited.
                    </div>
                </div>
            )}
        </Modal>
    );
}
