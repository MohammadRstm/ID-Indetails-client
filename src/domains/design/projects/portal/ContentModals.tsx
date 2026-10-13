import { z } from "zod";
import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import Field, { FieldError } from "@/shared/components/Forms/Field";
import { useForm } from "@/shared/components/Forms/useForm";
import Modal from "@/shared/components/Overlays/Modal";
import Icon from "@/shared/icons/Icon";
import { useDeleteItem, useUpdateItem, type PortalContentItem } from "./contentApi";

const schema = z.object({ title: z.string().trim().min(1, "Give the file a title.").max(200, "Use at most 200 characters.") });

/** A card's title: what the client will see it called. Its file name stays as it was uploaded. */
export function RenameModal({ projectId, item, onClose }: { projectId: number; item: PortalContentItem; onClose: () => void }) {
    const update = useUpdateItem(projectId);
    const form = useForm({ title: item.title }, schema);
    // checked as it is typed, not only when Save is pressed
    const rule = schema.safeParse(form.values);
    const titleError = form.errors.title ?? (rule.success ? undefined : rule.error.issues[0].message);

    async function submit() {
        if (update.isPending || !form.validate()) return;
        const title = form.values.title.trim();
        if (title === item.title) return onClose();
        try {
            await update.mutateAsync({ itemId: item.id, title });
            toast({ text: "Renamed", sub: title, icon: "checkCircle" });
            onClose();
        } catch (error) {
            form.fail(error);
        }
    }

    return (
        <Modal title="Rename" sub={item.file.name} onClose={onClose}
            foot={
                <>
                    <div className="grow"><FieldError message={form.errors.form} /></div>
                    <button type="button" className="btn" onClick={onClose}>Cancel</button>
                    <button type="button" className="btn btn-primary" disabled={update.isPending} onClick={() => void submit()}>Save</button>
                </>
            }>
            <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
                <Field id="pc-title" label="Title" required error={titleError} hint="Up to 200 characters.">
                    <input id="pc-title" className="input" autoFocus value={form.values.title} onChange={(e) => form.set("title", e.target.value)} />
                </Field>
            </form>
        </Modal>
    );
}

/** Asks before a file is removed for good. */
export function DeleteModal({ projectId, item, onClose }: { projectId: number; item: PortalContentItem; onClose: () => void }) {
    const remove = useDeleteItem(projectId);

    async function submit() {
        try {
            await remove.mutateAsync(item.id);
            toast({ text: "File deleted", sub: item.title, icon: "trash" });
            onClose();
        } catch {
            // the answer is shown in the window
        }
    }

    return (
        <Modal title={`Delete ${item.title}?`} sub={item.file.name} onClose={onClose}
            foot={
                <>
                    <div className="grow">{remove.error ? <span className="err" role="alert"><Icon name="alert" />{errorMessage(remove.error)}</span> : null}</div>
                    <button type="button" className="btn" onClick={onClose}>Keep it</button>
                    <button type="button" className="btn btn-danger" disabled={remove.isPending} onClick={() => void submit()}>Delete</button>
                </>
            }>
            <p>The file is removed from the client portal drafts. This can't be undone.</p>
        </Modal>
    );
}
