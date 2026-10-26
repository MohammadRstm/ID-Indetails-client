import { z } from "zod";
import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import Field, { FieldError } from "@/shared/components/Forms/Field";
import { useForm } from "@/shared/components/Forms/useForm";
import Modal from "@/shared/components/Overlays/Modal";
import FilledNote from "@/domains/shared/proton/FilledNote";
import { fillChange, useProtonForm } from "@/domains/shared/proton/formFill";
import Icon from "@/shared/icons/Icon";
import type { CardItem } from "./cards";
import { useDeleteFile, useUpdateFile } from "./filesApi";

const schema = z.object({ title: z.string().trim().min(1, "Give the file a title.").max(200, "Use at most 200 characters.") });

/** A file's title: what the team and the client see it called. Its file name stays as it was uploaded. */
export function RenameModal({ projectId, item, onClose }: { projectId: number; item: CardItem; onClose: () => void }) {
    const update = useUpdateFile(projectId);
    const form = useForm({ title: item.title }, schema);
    // checked as it is typed, not only when Save is pressed
    const rule = schema.safeParse(form.values);
    const titleError = form.errors.title ?? (rule.success ? undefined : rule.error.issues[0].message);
    // Proton puts the new title in; the old one shows beside it until the person saves
    const proton = useProtonForm("file_rename", item.id, (fill) => {
        const done: string[] = [];
        fillChange(form.values.title, fill.fileRename?.title, (title) => form.set("title", title), "title", done);
        return done;
    });

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
            <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate {...proton.guard}>
                <FilledNote fields={proton.filled} />
                <Field id="pc-title" label="Title" required error={titleError} hint="Up to 200 characters.">
                    <input id="pc-title" className="input" autoFocus value={form.values.title} onChange={(e) => form.set("title", e.target.value)} />
                </Field>
            </form>
        </Modal>
    );
}

/** Asks before a file is deleted for good. */
export function DeleteModal({ projectId, item, onClose }: { projectId: number; item: CardItem; onClose: () => void }) {
    const remove = useDeleteFile(projectId);

    async function submit() {
        try {
            await remove.mutateAsync(item.id);
            toast(item.published ? { text: "File removed", sub: `${item.title} stays visible to clients until the next publish`, icon: "trash" } : { text: "File deleted", sub: item.title, icon: "trash" });
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
            {item.published ? (
                <p>Clients keep seeing this file until the next publish; then it's removed from what they see. Until then you can undo this.</p>
            ) : (
                <p>The file and its comments are deleted from the project. This can't be undone.</p>
            )}
        </Modal>
    );
}
