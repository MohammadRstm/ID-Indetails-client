import { useState } from "react";
import { ErrorMessage } from "@/shared/components/Feedback/ErrorText";
import { toast } from "@/shared/components/Feedback/toast";
import Modal from "@/shared/components/Overlays/Modal";
import { useAddExpenseCategory, type CategoryDomain, type ExpenseCategory } from "./expenseCategoriesApi";

const NAME_MAX = 60;

/** A new expense category, from a category menu's "Add category…": the menu then picks it. */
export default function AddCategoryModal({ domain, onDone, onClose }: { domain: CategoryDomain; onDone: (category: ExpenseCategory) => void; onClose: () => void }) {
    const add = useAddExpenseCategory(domain);
    const [name, setName] = useState("");
    // shown as it is typed, as every form here does
    const error = name.trim().length > NAME_MAX ? `Keep it to ${NAME_MAX} characters.` : undefined;

    function submit() {
        if (!name.trim() || error) return;
        add.mutate(name.trim(), {
            onSuccess: (category) => {
                toast({ text: `${category.name} added`, sub: "Its business's expenses can use it now", icon: "checkCircle" });
                onDone(category);
            },
        });
    }

    return (
        <Modal size="sm" title="Add a category" sub={domain === "execution" ? "For this business's site expenses" : "For this business's project expenses"}
            onClose={onClose}
            foot={<>
                <div className="grow" />
                <button className="btn" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" disabled={!name.trim() || !!error || add.isPending} onClick={submit}>Add category</button>
            </>}>
            <div className="field">
                <label className="label required" htmlFor="new-category">Name</label>
                <input id="new-category" className="input" autoFocus maxLength={NAME_MAX + 10} placeholder="e.g. Printing" value={name}
                    onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
                {error && <div className="err">{error}</div>}
                {add.error && <div className="err"><ErrorMessage error={add.error} /></div>}
            </div>
        </Modal>
    );
}
