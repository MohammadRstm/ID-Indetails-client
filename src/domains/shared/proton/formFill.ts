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

/** After a move, how long the page has to change before a form still open on it counts as the one to fill. */
const SETTLE_MS = 300;

/** `path`: where the form was opened, to tell a form that stays through a move from one the move is closing. */
type Adapter = { form: FormName; key: string; recordId: number | null; path: string; apply: (fill: FormFill) => string[] };

type Waiting = { fill: FormFill; at: number; report?: (message: string) => void; timers: ReturnType<typeof setTimeout>[] };

/**
 * The open forms, by form and the record they are for ("requirement:new" beside "requirement:42"): one form can be
 * open twice on a page (adding a requirement, and editing another in a window).
 */
const adapters = new Map<string, Adapter>();
let waiting: Waiting | null = null;

/** `scope`: the project a new record's form is on (a new requirement, a new invoice), so one meant for another project waits. */
const keyOf = (form: FormName, recordId: number | null | undefined, scope?: number | null) =>
    `${form}:${recordId ?? "new"}${scope != null ? `@${scope}` : ""}`;

/** The project a fill for a new record names, for the forms that are on one. */
function scopeOf(fill: FormFill): number | null {
    // a message to the client goes to the project chat, or to one file's comments beside it
    if (fill.form === "portal_message") return fill.portalMessage?.itemId ?? null;
    if (fill.id != null) return null;
    if (fill.form === "requirement") return fill.requirement?.projectId ?? null;
    if (fill.form === "invoice") return fill.invoice?.projectId ?? null;
    return null;
}

const fillKey = (fill: FormFill) => keyOf(fill.form, fill.id, scopeOf(fill));
const adapterFor = (fill: FormFill) => adapters.get(fillKey(fill));

/** Whether the form a fill is for is open now, for the record it names. */
export function isFormOpen(fill: FormFill): boolean {
    return adapterFor(fill) != null;
}

const here = () => window.location.pathname;

function applyTo(adapter: Adapter, fill: FormFill): string {
    // a form open for another record (or another project's new one) is not this fill's: nothing goes into it
    if (adapter.key !== fillKey(fill)) return "That form is open for something else, so I left it alone.";
    const filled = adapter.apply(fill);
    return filled.length > 0 ? `Filled ${filled.join(", ")}: check it and save.` : "The form already had everything I would have filled.";
}

function stopWaiting() {
    waiting?.timers.forEach(clearTimeout);
    waiting = null;
}

/** The waiting fill goes into this form, and says what happened. */
function take(adapter: Adapter) {
    const entry = waiting;
    if (!entry) return;
    stopWaiting();
    // filled first: `report?.(…)` alone wouldn't even fill the form when nobody listens
    const said = applyTo(adapter, entry.fill);
    entry.report?.(said);
}

export type FillOptions = {
    /** A move came first in the same answer: the form open now may be another record's, about to close. */
    afterMove?: boolean;
    /** Says what became of a fill that waited for its form, once it was filled or didn't open in time. */
    report?: (message: string) => void;
};

/** Sends a fill to its form, now or once it opens; says what happened, in words. */
export function fillForm(fill: FormFill, { afterMove = false, report }: FillOptions = {}): string {
    stopWaiting();
    if (!afterMove) {
        const adapter = adapterFor(fill) ?? [...adapters.values()].find((a) => a.form === fill.form);
        if (adapter) return applyTo(adapter, fill);
    }

    const entry: Waiting = { fill, at: Date.now(), report, timers: [] };
    waiting = entry;
    entry.timers.push(setTimeout(() => {
        if (waiting !== entry) return;
        waiting = null;
        report?.("The form didn't open, so I couldn't fill it.");
    }, WAIT_MS));
    if (afterMove) {
        // the same form may stay open through the move (its own record's page): it takes the fill once the page settled
        entry.timers.push(setTimeout(() => {
            const open = adapterFor(fill);
            if (waiting === entry && open && open.path === here()) take(open);
        }, SETTLE_MS));
    }

    return "I'll fill the form as it opens: check it and save.";
}

/** Keys that move around a form or hold a modifier without changing anything in it. */
const PASSING_KEYS = new Set(["Tab", "Shift", "Control", "Alt", "Meta", "Escape", "CapsLock"]);

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
export function useProtonForm(form: FormName, recordId: number | null, apply: (fill: FormFill) => string[], scope: number | null = null) {
    const [filled, setFilled] = useState<string[]>([]);
    const touched = useRef(true);
    const latest = useRef(apply);
    useEffect(() => { latest.current = apply; });

    useEffect(() => {
        const key = keyOf(form, recordId, scope);
        const adapter: Adapter = {
            form,
            key,
            recordId,
            path: here(),
            apply: (fill) => {
                const names = latest.current(fill);
                if (names.length > 0) {
                    touched.current = false;
                    setFilled(names);
                }

                return names;
            },
        };
        adapters.set(key, adapter);
        if (waiting && fillKey(waiting.fill) === key && Date.now() - waiting.at < WAIT_MS) take(adapter);

        return () => {
            if (adapters.get(key) === adapter) adapters.delete(key);
        };
    }, [form, recordId, scope]);

    return {
        filled,
        guard: {
            onKeyDownCapture: (e: KeyboardEvent) => {
                if (e.key === "Enter" && !touched.current && filled.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }

                // moving through the form isn't changing it: Tab then Enter mustn't send what the person hasn't read
                if (e.key !== "Enter" && !PASSING_KEYS.has(e.key)) touched.current = true;
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
