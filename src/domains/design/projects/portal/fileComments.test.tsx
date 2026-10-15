import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { note, notificationHandlers, notifications } from "@/test/fixtures/notifications";
import { projectWork, projectWorkHandlers } from "@/test/fixtures/project";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { commentOf, commentsApi, filesOf, filesPart, projectFileOf, sarahRef, servedFiles } from "./filesTestKit";
import { fileOf, menuOf, page, person } from "./portalTestKit";

/*
 * A file's comments, in the panel beside the Project files tab: oldest first with the fixed ones folded away, who
 * starts them and who may only reply, editing and deleting your own, marking them fixed, and the ways in: a card's
 * count, its menu, and a notification.
 */

const nadia = personas.designAdmin;
const sarah = personas.designEmployee;

// in 3D, so that a link naming only the file has to find its section
const living = projectFileOf(5, "Living room v3", fileOf(11, "Living room v3.jpg"), { section: "model", comments: { total: 3, open: 2 } });
const quiet = { ...living, comments: { total: 0, open: 0 } };
const commentsOn = (itemId: number) => `${page}?tab=files&comments=${itemId}`;
const panel = () => screen.findByRole("dialog", { name: "Comments on Living room v3" });
/** The comment that says `text`. */
const rowOf = (dialog: HTMLElement, text: string) => within(dialog).getByText(text).closest("li") as HTMLElement;
const toggle = /^(Show|Hide) \d+ fixed$/;

// Wednesday 30 September 2026, noon in Beirut
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("a file's comments", () => {
    it("open from a link that names only the file, in its section, oldest first, with the fixed ones folded away", async () => {
        const { handlers } = commentsApi([
            commentOf(1, "Is the sofa final?"),
            commentOf(2, "Swap the rug, please", { author: sarahRef, editedAt: "2026-09-30T08:30:00Z" }),
            commentOf(3, "Lighting is too warm", { fixedAt: "2026-09-30T08:45:00Z", fixedBy: person }),
        ]);
        renderApp(commentsOn(5), nadia, servedFiles(filesOf([living])), ...handlers, ...projectWorkHandlers);

        const dialog = await panel();
        await within(dialog).findByText("Is the sofa final?");
        expect(within(dialog).getAllByRole("listitem").map((li) => li.querySelector(".dp-text")?.textContent)).toEqual(["Is the sofa final?", "Swap the rug, please"]);
        const second = within(rowOf(dialog, "Swap the rug, please"));
        expect(second.getByText("Sarah Haddad")).toBeInTheDocument();
        expect(second.getByText("1 hour ago")).toBeInTheDocument();
        expect(second.getByText("(edited)")).toBeInTheDocument();
        // the section the file is in
        expect(screen.getByRole("tab", { name: "3D" })).toHaveAttribute("aria-selected", "true");

        // the fixed one waits under its toggle
        expect(within(dialog).queryByText("Lighting is too warm")).toBeNull();
        await userEvent.click(within(dialog).getByRole("button", { name: "Show 1 fixed" }));
        expect(within(rowOf(dialog, "Lighting is too warm")).getByText(/^Fixed by Nadia Karam/)).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Hide 1 fixed" }));
        expect(within(dialog).queryByText("Lighting is too warm")).toBeNull();
    });

    it("lets a manager start them, telling as it is typed when a comment is too long", async () => {
        const api = commentsApi([]);
        renderApp(commentsOn(5), nadia, servedFiles(filesOf([quiet])), ...api.handlers, ...projectWorkHandlers);

        const dialog = await panel();
        expect(await within(dialog).findByText("No comments yet.")).toBeInTheDocument();
        const box = within(dialog).getByLabelText("Add a comment");
        expect(within(dialog).getByText("0 / 2000")).toBeInTheDocument();

        await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));
        expect(within(dialog).getByText("Write a comment first.")).toBeInTheDocument();

        fireEvent.change(box, { target: { value: "x".repeat(2001) } });
        expect(within(dialog).getByText("Use at most 2000 characters.")).toBeInTheDocument();
        expect(within(dialog).getByText("2001 / 2000")).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));
        expect(api.box.sent).toEqual([]);

        fireEvent.change(box, { target: { value: "  Can we try a lighter oak?  " } });
        expect(within(dialog).queryByRole("alert")).toBeNull();
        await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));

        expect(await within(dialog).findByText("Can we try a lighter oak?")).toBeInTheDocument();
        expect(api.box.sent).toEqual([{ what: "post 5", body: { body: "Can we try a lighter oak?" } }]);
        expect(within(dialog).getByLabelText("Add a comment")).toHaveValue("");
    });

    it("tells someone who may only reply that admins start the comments, and lets them reply once there are some", async () => {
        const { unmount } = renderApp(commentsOn(5), sarah, servedFiles(filesOf([quiet], { canManage: false })), ...commentsApi([]).handlers, ...projectWorkHandlers);
        const first = await panel();
        expect(await within(first).findByText("Only admins start comments on a file.")).toBeInTheDocument();
        expect(within(first).queryByLabelText("Add a comment")).toBeNull();
        unmount();

        const api = commentsApi([commentOf(1, "Is the sofa final?")], sarahRef);
        renderApp(commentsOn(5), sarah, servedFiles(filesOf([living], { canManage: false })), ...api.handlers, ...projectWorkHandlers);
        const dialog = await panel();
        await userEvent.type(await within(dialog).findByLabelText("Add a comment"), "Yes, the grey one");
        await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));

        expect(await within(dialog).findByText("Yes, the grey one")).toBeInTheDocument();
        expect(within(rowOf(dialog, "Yes, the grey one")).getByText("Sarah Haddad")).toBeInTheDocument();
        expect(api.box.sent).toEqual([{ what: "post 5", body: { body: "Yes, the grey one" } }]);
    });

    it("lets the author edit and delete their own comments, and nobody else's", async () => {
        const api = commentsApi([
            commentOf(1, "Is the sofa final?", { canEdit: true, canDelete: true }),
            commentOf(2, "Swap the rug, please", { author: sarahRef }),
        ]);
        renderApp(commentsOn(5), nadia, servedFiles(filesOf([living])), ...api.handlers, ...projectWorkHandlers);
        const dialog = await panel();
        await within(dialog).findByText("Is the sofa final?");
        const theirs = within(rowOf(dialog, "Swap the rug, please"));
        expect(theirs.queryByRole("button", { name: "Edit" })).toBeNull();
        expect(theirs.queryByRole("button", { name: "Delete" })).toBeNull();

        await userEvent.click(within(rowOf(dialog, "Is the sofa final?")).getByRole("button", { name: "Edit" }));
        const box = within(dialog).getByLabelText("Edit comment");
        expect(box).toHaveValue("Is the sofa final?");
        fireEvent.change(box, { target: { value: "x".repeat(2001) } });
        expect(within(dialog).getByText("Use at most 2000 characters.")).toBeInTheDocument();
        fireEvent.change(box, { target: { value: "Is the grey sofa final?" } });
        await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

        const mine = within((await within(dialog).findByText("Is the grey sofa final?")).closest("li") as HTMLElement);
        expect(mine.getByText("(edited)")).toBeInTheDocument();
        expect(api.box.sent).toEqual([{ what: "edit 1", body: { body: "Is the grey sofa final?" } }]);

        await userEvent.click(mine.getByRole("button", { name: "Delete" }));
        const ask = within(dialog).getByRole("group", { name: "Delete this comment?" });
        await userEvent.click(within(ask).getByRole("button", { name: "Delete comment" }));
        await waitFor(() => expect(within(dialog).queryByText("Is the grey sofa final?")).toBeNull());
        expect(api.box.sent[1]).toEqual({ what: "delete 1", body: null });
        expect(within(dialog).getByText("Swap the rug, please")).toBeInTheDocument();
    });

    it("marks a comment fixed, which folds it away, and opens it again", async () => {
        const api = commentsApi([commentOf(1, "Lighting is too warm", { canFix: true }), commentOf(2, "Is the sofa final?", { canFix: true })]);
        renderApp(commentsOn(5), nadia, servedFiles(filesOf([living])), ...api.handlers, ...projectWorkHandlers);
        const dialog = await panel();
        await within(dialog).findByText("Lighting is too warm");

        await userEvent.click(within(rowOf(dialog, "Lighting is too warm")).getByRole("button", { name: "Mark fixed" }));
        expect(await within(dialog).findByRole("button", { name: "Show 1 fixed" })).toBeInTheDocument();
        expect(within(dialog).queryByText("Lighting is too warm")).toBeNull();
        expect(api.box.sent).toEqual([{ what: "fixed 1", body: { fixed: true } }]);

        await userEvent.click(within(dialog).getByRole("button", { name: "Show 1 fixed" }));
        await userEvent.click(within(rowOf(dialog, "Lighting is too warm")).getByRole("button", { name: "Reopen" }));
        await waitFor(() => expect(within(dialog).queryByRole("button", { name: toggle })).toBeNull());
        expect(within(rowOf(dialog, "Lighting is too warm")).getByRole("button", { name: "Mark fixed" })).toBeInTheDocument();
        expect(api.box.sent[1]).toEqual({ what: "fixed 1", body: { fixed: false } });
    });

    it("can only be read on an archived project", async () => {
        const api = commentsApi([commentOf(1, "Is the sofa final?", { canEdit: true, canDelete: true, canFix: true })]);
        renderApp(commentsOn(5), nadia, ...api.handlers, ...projectWorkHandlers,
            servedFiles(filesOf([living], { canEdit: false, readOnlyReason: "This project is archived, so its files can't be changed." })));
        const dialog = await panel();

        expect(await within(dialog).findByText("This project is archived, so its files can't be changed.")).toBeInTheDocument();
        expect(within(dialog).getByText("Is the sofa final?")).toBeInTheDocument();
        expect(within(dialog).queryByLabelText("Add a comment")).toBeNull();
        for (const name of ["Edit", "Delete", "Mark fixed"]) expect(within(dialog).queryByRole("button", { name })).toBeNull();
    });
});

describe("the ways to a file's comments", () => {
    it("opens them from a card's count and from its menu, and closing keeps the file's section", async () => {
        const { handlers } = commentsApi([commentOf(1, "Is the sofa final?")]);
        renderApp(filesPart("model"), nadia, servedFiles(filesOf([living])), ...handlers, ...projectWorkHandlers);

        await userEvent.click(await screen.findByRole("button", { name: "Comments on Living room v3: 3, 2 open" }));
        const dialog = await panel();
        expect(await within(dialog).findByText("Is the sofa final?")).toBeInTheDocument();
        expect(window.location.search).toBe("?tab=files&part=model&comments=5");

        await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(window.location.search).toBe("?tab=files&part=model");

        await menuOf("Living room v3");
        await userEvent.click(screen.getByRole("button", { name: "Comments" }));
        expect(await panel()).toBeInTheDocument();
    });

    it("opens them from a notification about a comment", async () => {
        const project = { id: projectWork.project.id, title: projectWork.project.title, domain: "design", icon: null, tint: null };
        const commented = note("project_file_comment", { projectTitle: project.title, fileTitle: "Living room v3", authorName: "Nadia Karam" },
            { id: 77, project, subjectType: "item", subjectId: 5 });
        const { handlers } = commentsApi([commentOf(1, "Is the sofa final?")]);
        renderApp("/design/notifications", sarah, ...notificationHandlers({ ...notifications.rana, items: [commented], totalCount: 1 }),
            http.post("/api/notifications/:id/read", () => HttpResponse.json({ unread: 0 })),
            servedFiles(filesOf([living], { canManage: false })), ...handlers, ...projectWorkHandlers);

        await userEvent.click(await screen.findByText(`Nadia Karam commented on Living room v3 in ${project.title}`));
        await waitFor(() => expect(window.location.pathname + window.location.search).toBe(`${page}?tab=files&comments=5`));
        const dialog = await panel();
        expect(await within(dialog).findByText("Is the sofa final?")).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "3D" })).toHaveAttribute("aria-selected", "true");
    });
});
