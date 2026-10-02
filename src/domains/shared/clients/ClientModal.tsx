import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "@/shared/components/Feedback/toast";
import { FieldError } from "@/shared/components/Forms/Field";
import PhoneField from "@/shared/components/Forms/PhoneField";
import Select from "@/shared/components/Forms/Select";
import Modal from "@/shared/components/Overlays/Modal";
import useDebounce from "@/shared/hooks/useDebounce";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import { CLIENT_LABELS } from "@/shared/format/labels";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { isEmail } from "@/shared/utils/email";
import { checkClient, useSaveClient, type Client } from "./clientsApi";
import HelpTip from "@/shared/components/Feedback/HelpTip";

type ContactDraft = { kind: "email" | "phone"; value: string; label: string; isWhatsapp: boolean };

type ClientModalProps = {
    domain: string;
    /** Editing this client; adding a new one when absent. */
    client?: Client;
    prefillName?: string;
    /** Called with the saved client, or nothing when cancelled. */
    onClose: (saved?: Client) => void;
};

/** Add or edit a client: name, organisation, label, contacts and a note (the prototype's P.ClientModal). */
export default function ClientModal({ domain, client, prefillName, onClose }: ClientModalProps) {
    const navigate = useNavigate();
    const save = useSaveClient(client?.id);
    const [name, setName] = useState(client?.name ?? prefillName ?? "");
    const [organisation, setOrganisation] = useState(client?.organisation ?? "");
    const [label, setLabel] = useState(client?.label ?? "Client");
    const [note, setNote] = useState(client?.note ?? "");
    const [contacts, setContacts] = useState<ContactDraft[]>(
        client?.contacts.map((c) => ({ kind: c.kind, value: c.value, label: c.label ?? "", isWhatsapp: c.isWhatsapp }))
            ?? [{ kind: "email", value: "", label: "Main", isWhatsapp: false }],
    );

    const filled = contacts.filter((c) => c.value.trim());
    // The API checks the typed name and contacts against the domain's clients, before anything is saved.
    // Debounced as a string: a new object on every render would never settle.
    const typed = JSON.stringify({ name: name.trim(), contacts: filled.map((c) => ({ kind: c.kind, value: c.value.trim() })) });
    const draft = JSON.parse(useDebounce({ value: typed, debounceTimeMs: 350 })) as { name: string; contacts: { kind: "email" | "phone"; value: string }[] };
    const check = useQuery({
        queryKey: ["clients", "check", domain, client?.id ?? null, draft],
        queryFn: () => checkClient({ domainCode: domain, name: draft.name || null, contacts: draft.contacts, exceptClientId: client?.id ?? null }),
        enabled: draft.name !== "" || draft.contacts.length > 0,
        staleTime: 30_000,
    });
    const taken = check.data?.contactTakenBy;
    const errors = useFormErrors();
    const nameError = !name.trim() && "Enter the client's name.";
    const labelError = !label.trim() && "Pick a label above, or type one.";
    const contactsError = filled.length === 0 && "Add an email or a phone number to reach them.";
    const emailError = (c: ContactDraft) => c.kind === "email" && c.value.trim() !== "" && !isEmail(c.value) && "Enter an email like name@company.com.";
    const ok = !nameError && !labelError && !contactsError && !contacts.some(emailError) && !taken;

    function setContact(i: number, patch: Partial<ContactDraft>) {
        setContacts(contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)));
    }

    async function submit() {
        if (save.isPending) return;
        if (!ok) return errors.tried();
        try {
            const saved = await save.mutateAsync({
                name: name.trim(),
                organisation: organisation.trim() || null,
                label: label.trim(),
                note: note.trim() || null,
                domainCode: domain,
                // The first contact is the one to use by default.
                contacts: filled.map((c, i) => ({
                    kind: c.kind, value: c.value.trim(), label: c.label.trim() || null, isWhatsapp: c.kind === "phone" && c.isWhatsapp, isPrimary: i === 0,
                })),
            });
            if (client) {
                toast({ text: `${saved.displayName} updated`, icon: "checkCircle" });
            } else {
                toast({
                    text: `${saved.displayName} added`,
                    sub: "Clients have no login - this is a record for your projects.",
                    icon: "checkCircle",
                    actionLabel: "Open client",
                    action: () => navigate(`/${domain}/clients/${saved.id}`),
                });
            }
            onClose(saved);
        } catch {
            // The error shows in the foot.
        }
    }

    return (
        <Modal
            size="md"
            title={client ? "Edit client" : "Add client"}
            sub="A record of who the work is for - clients never sign in."
            onClose={() => onClose()}
            foot={
                <>
                    <div className="grow">
                        {taken ? (
                            <span className="err"><Icon name="alert" />That {taken.kind} already belongs to {taken.name}</span>
                        ) : save.error ? (
                            <FieldError message={(save.error as Error).message} />
                        ) : "Name, label and at least one contact are required."}
                    </div>
                    <button className="btn" onClick={() => onClose()}>Cancel</button>
                    <button className="btn btn-primary" disabled={save.isPending} onClick={submit}>
                        {save.isPending ? "Saving…" : client ? "Save client" : "Add client"}
                    </button>
                </>
            }
        >
            <div className="grid g-2">
                <div className="field">
                    <label className="label required" htmlFor="cl-name">Full name</label>
                    <input id="cl-name" className="input" autoFocus placeholder="e.g. Rania Khoury" value={name} onChange={(e) => setName(e.target.value)} onBlur={errors.touch("name")} />
                    <FieldError message={errors.show("name", nameError)} />
                </div>
                <div className="field">
                    <label className="label" htmlFor="cl-org">Organisation</label>
                    <input id="cl-org" className="input" placeholder={`Optional - e.g. ${domain === "execution" ? "Cedar Developers SAL" : "Haddad Holdings"}`} value={organisation} onChange={(e) => setOrganisation(e.target.value)} />
                </div>
            </div>

            {check.data?.nameTaken && (
                <div className="banner hold mt-s">
                    <Icon name="info" />
                    <div>A client called <b>{name.trim()}</b> already exists. Carry on if this is a different person.</div>
                </div>
            )}

            <div className="field mt">
                <label className="label required">
                    Label
                    <HelpTip label="a client's label">
                        <b>What kind of client this is</b>: a key account, a retainer, an agency, a lead or anything you type. It shows
                        in the client list and on their page, and searching the list finds it, so you can pick out, say, every lead.
                        It grants no access and changes no figures.
                    </HelpTip>
                </label>
                <div className="chips">
                    {CLIENT_LABELS.map((l) => (
                        <button key={l} type="button" className={cx("chip", label === l && "on")} onClick={() => setLabel(l)}>{l}</button>
                    ))}
                </div>
                <input className="input mt-s" placeholder="or type your own label" aria-label="Your own label" value={label} onChange={(e) => setLabel(e.target.value)} onBlur={errors.touch("label")} />
                {errors.show("label", labelError) ? <FieldError message={errors.show("label", labelError)} />
                    : <div className="hint">A descriptive tag only - it grants no access and changes no figures.</div>}
            </div>

            <div className="field mt">
                <label className="label required">Contact details</label>
                <div className="stack" style={{ gap: 8 }}>
                    {contacts.map((c, i) => (
                        <div key={i}>
                            <div className="contact-edit">
                                <Select className="select sm" style={{ width: 94 }} aria-label="Kind" value={c.kind}
                                    options={[{ value: "email", label: "Email" }, { value: "phone", label: "Phone" }]}
                                    onChange={(kind) => setContact(i, { kind, isWhatsapp: kind === "phone" ? c.isWhatsapp : false })} />
                                {c.kind === "email" ? (
                                    <input className="input grow" placeholder="name@company.com" aria-label="Email address" value={c.value}
                                        onChange={(e) => setContact(i, { value: e.target.value })} onBlur={errors.touch(`contact-${i}`)} />
                                ) : (
                                    <PhoneField placeholder="3 555 142" aria-label="Phone number" value={c.value}
                                        onChange={(value) => setContact(i, { value })} onBlur={errors.touch(`contact-${i}`)} />
                                )}
                                <input className="input" style={{ width: 108 }} placeholder="e.g. Office" aria-label="Contact label" value={c.label} onChange={(e) => setContact(i, { label: e.target.value })} />
                                {c.kind === "phone" && (
                                    <button type="button" className={cx("chip", c.isWhatsapp && "on")} title="Reachable on WhatsApp"
                                        onClick={() => setContact(i, { isWhatsapp: !c.isWhatsapp })}>WhatsApp</button>
                                )}
                                <button type="button" className="icon-btn" aria-label="Remove contact" disabled={contacts.length === 1}
                                    onClick={() => setContacts(contacts.filter((_, j) => j !== i))}>
                                    <Icon name="x" />
                                </button>
                            </div>
                            <FieldError message={errors.show(`contact-${i}`, emailError(c))} />
                        </div>
                    ))}
                </div>
                <FieldError message={errors.show("contacts", contactsError)} />
                <button type="button" className="btn btn-sm btn-quiet mt-s"
                    onClick={() => setContacts([...contacts, { kind: "phone", value: "", label: "", isWhatsapp: true }])}>
                    <Icon name="plus" />Add another contact
                </button>
                <div className="hint">Used to identify and reach the client. They never receive anything from this system.</div>
            </div>

            <div className="field mt">
                <label className="label" htmlFor="cl-note">Note</label>
                <input id="cl-note" className="input" placeholder="Optional - one line of context" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
        </Modal>
    );
}
