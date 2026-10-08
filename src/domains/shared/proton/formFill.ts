import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Schemas } from "@/api/types";

/*
 * Proton filling a form for the person to review: a form that can be filled registers an adapter while it is open,
 * and a fill goes to it, or waits a moment for it to open (Proton opens the form and fills it in the same answer). An
 * adapter fills empty fields only and says which; the form shows what was filled, and is never submitted for the
 * person. In a filled form, Enter does nothing until the person has touched it.
 */

export type FormFill = Schemas["ProtonFormFill"];
type FormName = FormFill["form"];

/** A fill for a form that isn't open yet is dropped after this long, or when another arrives. */
const WAIT_MS = 10_000;

type Adapter = { recordId: number | null; apply: (fill: FormFill) => string[] };

const adapters = new Map<FormName, Adapter>();
let waiting: { fill: FormFill; at: number } | null = null;

function applyTo(adapter: Adapter, fill: FormFill): string {
    // a form open for another record is not this fill's: nothing goes into it
    if (fill.id != null && adapter.recordId !== fill.id) return "That form is open for something else, so I left it alone.";
    const filled = adapter.apply(fill);
    return filled.length > 0 ? `Filled ${filled.join(", ")}: check it and save.` : "The form already had everything I would have filled.";
}

/** Sends a fill to its form, now or once it opens; says what happened, in words. */
export function fillForm(fill: FormFill): string {
    const adapter = adapters.get(fill.form);
    if (adapter) {
        waiting = null;
        return applyTo(adapter, fill);
    }

    waiting = { fill, at: Date.now() };
    return "I'll fill the form as it opens: check it and save.";
}

/** Only a value for an empty field: what the person typed stays. */
export function fillEmpty<T>(current: T, value: T | null | undefined, set: (value: T) => void, name: string, filled: string[]) {
    const empty = current == null || (typeof current === "string" && current.trim() === "");
    if (value == null || !empty) return;
    set(value);
    filled.push(name);
}

/**
 * For editing what is already there: a different value replaces it, and the note says what it was, so the person
 * sees both before they save (saving is how they accept it).
 */
export function fillChange(current: string, value: string | null | undefined, set: (value: string) => void, name: string, filled: string[]) {
    if (value == null || value === current) return;
    set(value);
    filled.push(current.trim() ? `${name} (was "${current}")` : name);
}

/**
 * Lets Proton fill this form while it is open. `apply` sets the form's own fields (through fillEmpty) and returns
 * the names it filled. Returns those names, for the form to show, and handlers that keep Enter from submitting a
 * filled form the person hasn't touched.
 */
export function useProtonForm(form: FormName, recordId: number | null, apply: (fill: FormFill) => string[]) {
    const [filled, setFilled] = useState<string[]>([]);
    const touched = useRef(true);
    const latest = useRef(apply);
    useEffect(() => { latest.current = apply; });

    useEffect(() => {
        const adapter: Adapter = {
            recordId,
            apply: (fill) => {
                const names = latest.current(fill);
                if (names.length > 0) {
                    touched.current = false;
                    setFilled(names);
                }

                return names;
            },
        };
        adapters.set(form, adapter);
        if (waiting && waiting.fill.form === form) {
            const { fill, at } = waiting;
            waiting = null;
            if (Date.now() - at < WAIT_MS) applyTo(adapter, fill);
        }

        return () => {
            if (adapters.get(form) === adapter) adapters.delete(form);
        };
    }, [form, recordId]);

    return {
        filled,
        guard: {
            onKeyDownCapture: (e: KeyboardEvent) => {
                if (e.key === "Enter" && !touched.current && filled.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }

                if (e.key !== "Enter") touched.current = true;
            },
            onPointerDownCapture: () => { touched.current = true; },
        },
    };
}

/*
 * Message drafts: Proton writes one for a chat, and the chat's composer starts with it (or takes it, if it is open
 * and empty). The person reads it and presses Send.
 */

const drafts = new Map<string, string>();
const draftListeners = new Set<(chat: string) => void>();

/** The chat key as the messages page names its chats ("dm-9", "group-3"). */
export const chatOf = (team: boolean, id: number) => (team ? `group-${id}` : `dm-${id}`);

export function setDraft(chat: string, body: string) {
    drafts.set(chat, body);
    draftListeners.forEach((l) => l(chat));
}

export const peekDraft = (chat: string) => drafts.get(chat) ?? null;

export const clearDraft = (chat: string) => drafts.delete(chat);

export function onDraft(listener: (chat: string) => void): () => void {
    draftListeners.add(listener);
    return () => draftListeners.delete(listener);
}
