import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import { ErrorMessage } from "@/shared/components/Feedback/ErrorText";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import Icon from "@/shared/icons/Icon";
import {
    useAddExpenseCategory, useExpenseCategories, useOrderExpenseCategories, useRemoveExpenseCategory, useRenameExpenseCategory,
    type CategoryDomain, type ExpenseCategory,
} from "../finance/expenseCategoriesApi";

const NAME_MAX = 60;

function Row({ category, domain, first, last, onMove }: { category: ExpenseCategory; domain: CategoryDomain; first: boolean; last: boolean; onMove: (by: number) => void }) {
    const rename = useRenameExpenseCategory(domain);
    const remove = useRemoveExpenseCategory(domain);
    const [name, setName] = useState(category.name);
    const changed = name.trim() !== category.name;
    const error = !name.trim() ? "Give it a name." : name.trim().length > NAME_MAX ? `Keep it to ${NAME_MAX} characters.` : undefined;

    function save() {
        if (!changed || error) return;
        rename.mutate({ id: category.id, name: name.trim() }, {
            onSuccess: () => toast({ text: "Category renamed", sub: "Its expenses keep it", icon: "checkCircle" }),
        });
    }

    const why = category.code === "other" ? "\"Other\" is every business's fallback: rename it instead."
        : category.removable === false ? "Expenses or a budget use it: move them to another category first." : undefined;

    return (
        <div className="row cat-row">
            <div className="cat-move">
                <button type="button" className="icon-btn" disabled={first} aria-label={`Move ${category.name} up`} onClick={() => onMove(-1)}><Icon name="chevronUp" /></button>
                <button type="button" className="icon-btn" disabled={last} aria-label={`Move ${category.name} down`} onClick={() => onMove(1)}><Icon name="chevronDown" /></button>
            </div>
            <div className="grow" style={{ minWidth: 0 }}>
                <input className="input" aria-label={`Name of ${category.name}`} maxLength={NAME_MAX + 10} value={name}
                    onChange={(e) => setName(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
                {error && <div className="err">{error}</div>}
                {rename.error && <div className="err"><ErrorMessage error={rename.error} /></div>}
            </div>
            {changed && !error && <button className="btn btn-sm btn-primary" disabled={rename.isPending} onClick={save}>Save</button>}
            <button className="icon-btn" disabled={!!why || remove.isPending} title={why ?? `Remove ${category.name}`} aria-label={`Remove ${category.name}`}
                onClick={() => remove.mutate(category.id, {
                    onSuccess: () => toast({ text: `${category.name} removed`, icon: "trash" }),
                    onError: (e) => toast({ text: "It wasn't removed", sub: errorMessage(e), icon: "alert" }),
                })}><Icon name="trash" /></button>
        </div>
    );
}

/**
 * Settings › Finance: the business's expense categories (Design's for project expenses, Execution's for site expenses),
 * for whoever changes its money. Renamed freely, reordered, added; one an expense or a budget uses can't be removed.
 */
export default function ExpenseCategoriesPanel({ domain }: { domain: CategoryDomain }) {
    const list = useExpenseCategories(domain);
    const add = useAddExpenseCategory(domain);
    const order = useOrderExpenseCategories(domain);
    const [name, setName] = useState("");
    const addError = name.trim().length > NAME_MAX ? `Keep it to ${NAME_MAX} characters.` : undefined;
    const rows = list.data ?? [];

    function move(index: number, by: number) {
        const ids = rows.map((c) => c.id);
        const [moved] = ids.splice(index, 1);
        ids.splice(index + by, 0, moved);
        order.mutate(ids);
    }

    function submit() {
        if (!name.trim() || addError) return;
        add.mutate(name.trim(), { onSuccess: (c) => { toast({ text: `${c.name} added`, icon: "checkCircle" }); setName(""); } });
    }

    return (
        <div className="panel mt">
            <div className="panel-head">
                <div>
                    <div className="panel-title">Expense categories</div>
                    <div className="panel-sub">{domain === "execution" ? "What site expenses are for. Each has a line on site budgets." : "What project expenses are for."}</div>
                </div>
            </div>
            <div className="panel-body">
                {loadFailed(list) ? <LoadError error={list.error} retry={() => list.refetch()} what="the categories" />
                    : !list.data ? <SkeletonLines lines={4} /> : (
                        <div className="cat-list">
                            {rows.map((c, i) => <Row key={c.id} category={c} domain={domain} first={i === 0} last={i === rows.length - 1} onMove={(by) => move(i, by)} />)}
                        </div>
                    )}
                <div className="row mt" style={{ gap: 8, alignItems: "flex-start" }}>
                    <div className="grow">
                        <input className="input" aria-label="New category" maxLength={NAME_MAX + 10} placeholder="A new category, e.g. Printing" value={name}
                            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
                        {addError && <div className="err">{addError}</div>}
                        {add.error && <div className="err"><ErrorMessage error={add.error} /></div>}
                    </div>
                    <button className="btn btn-primary" disabled={!name.trim() || !!addError || add.isPending} onClick={submit}><Icon name="plus" />Add</button>
                </div>
            </div>
        </div>
    );
}
