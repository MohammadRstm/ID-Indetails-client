import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import Composer from "@/domains/shared/messages/Composer";
import FilledNote from "./FilledNote";
import { fillEmpty, fillForm, setDraft, useProtonForm, type FormFill } from "./formFill";

// a fill gives one form's values: the other slots are left out
const fill = (fields: Partial<FormFill>): FormFill => ({ form: "client", id: null, ...fields }) as FormFill;

function ClientForm({ recordId = null, onSubmit }: { recordId?: number | null; onSubmit: () => void }) {
    const [name, setName] = useState("");
    const [note, setNote] = useState("Typed by me");
    const proton = useProtonForm("client", recordId, (f) => {
        const done: string[] = [];
        fillEmpty(name, f.client?.name, setName, "name", done);
        fillEmpty(note, f.client?.note, setNote, "note", done);
        return done;
    });
    return (
        <div {...proton.guard}>
            <FilledNote fields={proton.filled} />
            <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
                <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
                <input aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
                <button type="submit">Save</button>
            </form>
        </div>
    );
}

describe("Proton filling a form", () => {
    it("fills only the empty fields, says so, and waits for a form that opens just after", () => {
        // the fill arrives before the form opens (Proton opened it in the same answer)
        expect(fillForm(fill({ client: { name: "Acme", note: "From Proton", organisation: null, email: null, phone: null } }))).toMatch(/as it opens/);
        render(<ClientForm onSubmit={() => {}} />);

        expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Acme");
        expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Typed by me");
        expect(screen.getByRole("status")).toHaveTextContent("Filled by Proton: name. Check it, then save.");
    });

    it("leaves a form open for another record alone", () => {
        render(<ClientForm recordId={4} onSubmit={() => {}} />);
        let said = "";
        act(() => { said = fillForm(fill({ id: 9, client: { name: "Acme", note: null, organisation: null, email: null, phone: null } })); });
        expect(said).toMatch(/something else/);
        expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("");
    });

    it("never submits: Enter in a filled form does nothing until the person touches it", async () => {
        const submit = vi.fn();
        render(<ClientForm onSubmit={submit} />);
        act(() => { fillForm(fill({ client: { name: "Acme", note: null, organisation: null, email: null, phone: null } })); });

        fireEvent.keyDown(screen.getByRole("textbox", { name: "Name" }), { key: "Enter" });
        expect(submit).not.toHaveBeenCalled();

        const user = userEvent.setup();
        await user.click(screen.getByRole("textbox", { name: "Name" }));
        await user.keyboard("{Enter}");
        expect(submit).toHaveBeenCalledTimes(1);
    });

    it("doesn't count moving through the form as touching it: Tab then Enter still sends nothing", async () => {
        const submit = vi.fn();
        render(<ClientForm onSubmit={submit} />);
        act(() => { fillForm(fill({ client: { name: "Acme", note: null, organisation: null, email: null, phone: null } })); });

        act(() => screen.getByRole("textbox", { name: "Name" }).focus());
        const user = userEvent.setup();
        await user.keyboard("{Tab}{Enter}");
        expect(screen.getByRole("textbox", { name: "Note" })).toHaveFocus();
        expect(submit).not.toHaveBeenCalled();

        // typing is touching it: then Enter is the person's own
        await user.keyboard("!{Enter}");
        expect(submit).toHaveBeenCalledTimes(1);
    });
});

describe("Proton filling a form after opening it in the same answer", () => {
    const acme = () => fill({ client: { name: "Acme", note: null, organisation: null, email: null, phone: null } });

    it("leaves the form the move is closing alone, and fills the one that opens, saying so", () => {
        vi.useFakeTimers();
        try {
            window.history.pushState({}, "", "/execution/clients");
            const closing = render(<ClientForm onSubmit={() => {}} />);
            const report = vi.fn();

            // Proton moves to another page, where the same kind of form opens
            window.history.pushState({}, "", "/design/clients");
            expect(fillForm(acme(), { afterMove: true, report })).toMatch(/as it opens/);
            act(() => { vi.advanceTimersByTime(500); });
            expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("");

            closing.unmount();
            render(<ClientForm onSubmit={() => {}} />);
            expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Acme");
            expect(report).toHaveBeenCalledWith("Filled name: check it and save.");
        } finally {
            vi.useRealTimers();
        }
    });

    it("fills a form that stays open through the move once the page has settled", () => {
        vi.useFakeTimers();
        try {
            window.history.pushState({}, "", "/design/clients");
            render(<ClientForm onSubmit={() => {}} />);
            const report = vi.fn();

            fillForm(acme(), { afterMove: true, report });
            act(() => { vi.advanceTimersByTime(500); });
            expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Acme");
            expect(report).toHaveBeenCalledWith("Filled name: check it and save.");
        } finally {
            vi.useRealTimers();
        }
    });

    it("says so when the form never opened", () => {
        vi.useFakeTimers();
        try {
            const report = vi.fn();
            fillForm(fill({ form: "meeting" }), { afterMove: true, report });
            act(() => { vi.advanceTimersByTime(10_000); });
            expect(report).toHaveBeenCalledWith("The form didn't open, so I couldn't fill it.");
        } finally {
            vi.useRealTimers();
        }
    });
});

function RequirementForm({ projectId }: { projectId: number }) {
    const [text, setText] = useState("");
    const proton = useProtonForm("requirement", null, (f) => {
        const done: string[] = [];
        fillEmpty(text, f.requirement?.text, setText, "requirement", done);
        return done;
    }, projectId);
    return <input aria-label={`Requirement for ${projectId}`} value={text} onChange={(e) => setText(e.target.value)} {...proton.guard} />;
}

describe("Proton filling a new record's form on a project", () => {
    const forProject = (projectId: number) => fill({ form: "requirement", requirement: { projectId, text: "Lighting plan", deadline: null, assigneeIds: null } });

    it("fills the form on the project the fill names, never another project's", () => {
        render(<><RequirementForm projectId={5} /><RequirementForm projectId={6} /></>);
        act(() => { fillForm(forProject(6)); });
        expect(screen.getByRole("textbox", { name: "Requirement for 6" })).toHaveValue("Lighting plan");
        expect(screen.getByRole("textbox", { name: "Requirement for 5" })).toHaveValue("");
    });

    it("leaves another project's form alone when only that one is open", () => {
        render(<RequirementForm projectId={5} />);
        let said = "";
        act(() => { said = fillForm(forProject(6)); });
        expect(said).toMatch(/something else/);
        expect(screen.getByRole("textbox", { name: "Requirement for 5" })).toHaveValue("");
    });
});

describe("a draft from Proton", () => {
    it("starts in its chat's composer and isn't sent by Enter until the person changes it", async () => {
        const send = vi.fn().mockResolvedValue(undefined);
        setDraft("dm-9", "Can we meet at 3?");
        render(<Composer draftKey="dm-9" members={null} meId={1} sending={false} error={null} onSend={send} />);
        const box = screen.getByRole("textbox", { name: "Message" });
        expect(box).toHaveValue("Can we meet at 3?");

        const user = userEvent.setup();
        await user.type(box, "{Enter}");
        expect(send).not.toHaveBeenCalled();

        await user.type(box, " Thanks{Enter}");
        expect(send).toHaveBeenCalledWith(expect.objectContaining({ body: "Can we meet at 3? Thanks" }));
    });

    it("lands only in the chat it was written for", () => {
        render(<Composer draftKey="dm-2" members={null} meId={1} sending={false} error={null} onSend={vi.fn()} />);
        act(() => setDraft("dm-3", "Not for you"));
        expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
        act(() => setDraft("dm-2", "For you"));
        expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("For you");
    });
});
