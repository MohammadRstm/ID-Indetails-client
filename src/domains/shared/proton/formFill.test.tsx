import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import Composer from "@/domains/shared/messages/Composer";
import FilledNote from "./FilledNote";
import { fillEmpty, fillForm, setDraft, useProtonForm, type FormFill } from "./formFill";

const fill = (fields: Partial<FormFill>): FormFill => ({
    form: "client", id: null, client: null, meeting: null, newProject: null, editProject: null, reportBug: null, invite: null, message: null, logWork: null, ...fields,
});

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
