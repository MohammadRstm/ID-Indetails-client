import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { P } from "@/app/permissions/codes";
import { fixtures, projectHandlers } from "@/test/fixtures";
import { MONEY_AND_HIRING, personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const rana = personas.superAdmin;
const archived = { ...fixtures.project, status: "archived", completedAt: "2026-09-01T09:00:00Z", finalizedAt: "2026-09-01T09:00:00Z" };
const title = fixtures.project.title;
const archivedHandlers = [http.get("/api/projects/1", () => HttpResponse.json(archived)), ...projectHandlers];
const deletable = { canDelete: true, blockers: [], removes: ["3 requirements", "2 project expenses", "14 activity entries"] };

const openDelete = async () => {
    await userEvent.click(await screen.findByRole("button", { name: "Delete project" }));
    return screen.findByRole("dialog", { name: `Delete ${title}?` });
};

describe("deleting a project made by mistake", () => {
    it("says what goes with it, and deletes it only once its name is typed exactly", async () => {
        const sent: unknown[] = [];
        renderApp("/design/projects/1", rana,
            http.get("/api/projects/1/deletion", () => HttpResponse.json(deletable)),
            http.delete("/api/projects/1", async ({ request }) => { sent.push(await request.json()); return new HttpResponse(null, { status: 204 }); }),
            ...archivedHandlers);
        const dialog = await openDelete();
        const goes = await within(dialog).findByRole("list", { name: "What goes with it" });
        expect(within(goes).getAllByRole("listitem").map((i) => i.textContent)).toEqual(deletable.removes);

        const name = within(dialog).getByPlaceholderText("Enter project name");
        const remove = within(dialog).getByRole("button", { name: "Delete project" });
        expect(remove).toBeDisabled();
        await userEvent.type(name, title.toUpperCase());
        expect(within(dialog).getByText("That isn't the project's name.")).toBeInTheDocument();
        expect(remove).toBeDisabled();

        await userEvent.clear(name);
        await userEvent.type(name, title);
        expect(remove).toBeEnabled();
        await userEvent.click(remove);
        await waitFor(() => expect(sent).toEqual([{ title }]));
        expect(await screen.findByText(`${title} deleted`)).toBeInTheDocument();
    });

    it("says why a project that holds something real can't be deleted, and asks for nothing", async () => {
        const blocked = { canDelete: false, blockers: ["1 payment received from the client."], removes: [] };
        renderApp("/design/projects/1", rana, http.get("/api/projects/1/deletion", () => HttpResponse.json(blocked)), ...archivedHandlers);
        const dialog = await openDelete();
        expect(await within(dialog).findByText("This project can't be deleted.")).toBeInTheDocument();
        expect(within(dialog).getByText("1 payment received from the client.")).toBeInTheDocument();
        expect(within(dialog).queryByPlaceholderText("Enter project name")).not.toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Delete project" })).toBeDisabled();
    });

    it("is offered only on an archived project, to whoever holds project:delete", async () => {
        renderApp("/design/projects/1", rana, ...projectHandlers);
        await screen.findByRole("button", { name: "Mark as done" });
        expect(screen.queryByRole("button", { name: "Delete project" })).not.toBeInTheDocument();
    });

    it("isn't offered to an admin without project:delete, even with the money", async () => {
        renderApp("/design/projects/1", withPermissions(personas.designAdmin, { grant: MONEY_AND_HIRING, revoke: [P.PROJECT_DELETE] }), ...archivedHandlers);
        await screen.findByRole("button", { name: "Reopen project" });
        expect(screen.queryByRole("button", { name: "Delete project" })).not.toBeInTheDocument();
    });
});

describe("the projects list's filters", () => {
    it("are in one panel, and All leaves the archived projects out until Archived is chosen", async () => {
        const asked: URLSearchParams[] = [];
        renderApp("/design/projects", rana,
            http.get("/api/projects", ({ request }) => {
                const q = new URL(request.url).searchParams;
                if (q.get("pageSize") !== "1") asked.push(q);
                return HttpResponse.json(fixtures.projects);
            }),
            ...projectHandlers);
        await screen.findByText(title);
        await waitFor(() => expect(asked.length).toBeGreaterThan(0));
        expect(asked.at(-1)!.get("excludeArchived")).toBe("true");
        expect(asked.at(-1)!.get("status")).toBeNull();
        // the statuses and the quarters are not on the page itself: they are in the Filters panel
        expect(screen.queryByRole("button", { name: "Q1" })).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Filters" }));
        const panel = await screen.findByRole("dialog", { name: "Filters" });
        await userEvent.click(within(panel).getByRole("button", { name: /^Archived/ }));
        await waitFor(() => expect(asked.at(-1)!.get("status")).toBe("archived"));
        expect(asked.at(-1)!.get("excludeArchived")).toBeNull();

        await userEvent.click(within(panel).getByRole("button", { name: "Q2" }));
        await waitFor(() => expect(asked.at(-1)!.get("quarter")).toBe("2"));
        expect(asked.at(-1)!.get("year")).not.toBeNull();
    });
});
