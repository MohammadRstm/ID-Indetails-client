import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { Schemas } from "@/api/types";
import { settingsHandlers } from "@/test/fixtures/settings";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

type Label = Schemas["AccountLabelResponse"];

const page = "/design/settings?section=labels";
const start = (): Label[] => [
    { id: 1, name: "Concrete", position: 1, archived: false },
    { id: 2, name: "Finishing", position: 2, archived: false },
    { id: 3, name: "Permits", position: 3, archived: true },
];

/** The labels API over a list in memory, keeping each call's method, path and body. */
function labelsApi(labels: Label[] = start()) {
    const calls: { call: string; body?: unknown }[] = [];
    const taken = HttpResponse.json({ type: "conflict", code: "account_label_taken", message: "A label with this name already exists." }, { status: 409 });
    const handlers = [
        http.get("/api/account-labels", ({ request }) => {
            calls.push({ call: `GET ${new URL(request.url).search}` });
            return HttpResponse.json(labels);
        }),
        http.post("/api/account-labels", async ({ request }) => {
            const { name } = (await request.json()) as { name: string };
            calls.push({ call: "POST", body: { name } });
            if (labels.some((l) => l.name.toLowerCase() === name.toLowerCase())) return taken;
            const added = { id: 10, name, position: labels.length + 1, archived: false };
            labels.push(added);
            return HttpResponse.json(added, { status: 201 });
        }),
        http.put("/api/account-labels/order", async ({ request }) => {
            const { ids } = (await request.json()) as { ids: number[] };
            calls.push({ call: "PUT order", body: { ids } });
            // the order is of the labels that can be picked: the archived ones follow
            const rank = (l: Label) => (l.archived ? ids.length + l.id : ids.indexOf(l.id));
            labels.sort((a, b) => rank(a) - rank(b));
            return HttpResponse.json(labels);
        }),
        http.put("/api/account-labels/:id", async ({ request, params }) => {
            const { name } = (await request.json()) as { name: string };
            calls.push({ call: `PUT ${String(params.id)}`, body: { name } });
            if (labels.some((l) => l.id !== +String(params.id) && l.name.toLowerCase() === name.toLowerCase())) return taken;
            const label = labels.find((l) => l.id === +String(params.id))!;
            label.name = name;
            return HttpResponse.json(label);
        }),
        http.post("/api/account-labels/:id/:action", ({ params }) => {
            calls.push({ call: `POST ${String(params.id)} ${String(params.action)}` });
            const label = labels.find((l) => l.id === +String(params.id))!;
            label.archived = params.action === "archive";
            return HttpResponse.json(label);
        }),
    ];
    return { calls, handlers };
}

/** The names of the label rows, in order (not the toast that repeats one). */
const rows = () => Array.from(document.querySelectorAll(".switch-row .grow > div:first-child"), (e) => e.textContent);

describe("the account labels in Settings", () => {
    it("lists the labels in order for a super admin, archived ones too", async () => {
        const api = labelsApi();
        renderApp(page, personas.superAdmin, ...api.handlers, ...settingsHandlers);
        expect(await screen.findByText("Concrete")).toBeInTheDocument();
        expect(rows()).toEqual(["Concrete", "Finishing", "Permits"]);
        expect(screen.getByText("Archived: it can't be picked any more.")).toBeInTheDocument();
        expect(api.calls[0].call).toBe("GET ?includeArchived=true");
    });

    it("is for those who manage the company's settings, super admins by default: no section, and no request, for anyone else", async () => {
        const api = labelsApi();
        renderApp(page, personas.designAdmin, ...api.handlers, ...settingsHandlers);
        const nav = await screen.findByRole("navigation", { name: "Settings" });
        expect(within(nav).queryByRole("button", { name: "Account labels" })).not.toBeInTheDocument();
        expect(screen.queryByText("Concrete")).not.toBeInTheDocument();
        expect(api.calls).toEqual([]);
    });

    it("adds a label, and says at once when the name is missing or too long", async () => {
        const api = labelsApi();
        renderApp(page, personas.superAdmin, ...api.handlers, ...settingsHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Add label" }));
        const name = screen.getByLabelText("Label name");
        await userEvent.type(name, "x");
        await userEvent.clear(name);
        expect(screen.getByText("Give the label a name.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Add" }));
        expect(api.calls.filter((c) => c.call === "POST")).toEqual([]);

        await userEvent.type(name, "x".repeat(41));
        expect(screen.getByText("At most 40 characters.")).toBeInTheDocument();
        await userEvent.clear(name);
        await userEvent.type(name, "Flooring");
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Add" }));
        await waitFor(() => expect(api.calls).toContainEqual({ call: "POST", body: { name: "Flooring" } }));
        expect(await screen.findByText("Label added")).toBeInTheDocument();
        await waitFor(() => expect(rows()).toEqual(["Concrete", "Finishing", "Flooring", "Permits"]));
    });

    it("shows the API's duplicate-name error next to the field, keeping what was typed", async () => {
        const api = labelsApi();
        renderApp(page, personas.superAdmin, ...api.handlers, ...settingsHandlers);
        await userEvent.click(await screen.findByRole("button", { name: "Add label" }));
        await userEvent.type(screen.getByLabelText("Label name"), "concrete");
        await userEvent.click(screen.getByRole("button", { name: "Add" }));
        expect(await screen.findByText("A label with this name already exists.")).toBeInTheDocument();
        expect(screen.getByLabelText("Label name")).toHaveValue("concrete");
        // typing again clears it
        await userEvent.type(screen.getByLabelText("Label name"), "s");
        expect(screen.queryByText("A label with this name already exists.")).not.toBeInTheDocument();
    });

    it("renames a label in place", async () => {
        const api = labelsApi();
        renderApp(page, personas.superAdmin, ...api.handlers, ...settingsHandlers);
        const row = (await screen.findByText("Finishing")).closest(".switch-row") as HTMLElement;
        await userEvent.click(within(row).getByRole("button", { name: "Rename" }));
        const name = within(row).getByLabelText("Label name");
        expect(name).toHaveValue("Finishing");
        await userEvent.clear(name);
        await userEvent.type(name, "Flooring");
        await userEvent.click(within(row).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(api.calls).toContainEqual({ call: "PUT 2", body: { name: "Flooring" } }));
        expect(await screen.findByText("Label renamed")).toBeInTheDocument();
        await waitFor(() => expect(rows()).toEqual(["Concrete", "Flooring", "Permits"]));
    });

    it("says the name is taken when renaming to another label's name", async () => {
        const api = labelsApi();
        renderApp(page, personas.superAdmin, ...api.handlers, ...settingsHandlers);
        const row = (await screen.findByText("Finishing")).closest(".switch-row") as HTMLElement;
        await userEvent.click(within(row).getByRole("button", { name: "Rename" }));
        const name = within(row).getByLabelText("Label name");
        await userEvent.clear(name);
        await userEvent.type(name, "Concrete");
        await userEvent.click(within(row).getByRole("button", { name: "Save" }));
        expect(await within(row).findByText("A label with this name already exists.")).toBeInTheDocument();
    });

    it("archives a label and restores an archived one", async () => {
        const api = labelsApi();
        renderApp(page, personas.superAdmin, ...api.handlers, ...settingsHandlers);
        const concrete = (await screen.findByText("Concrete")).closest(".switch-row") as HTMLElement;
        await userEvent.click(within(concrete).getByRole("button", { name: "Archive" }));
        await waitFor(() => expect(api.calls).toContainEqual({ call: "POST 1 archive" }));
        expect(await screen.findByText("Label archived")).toBeInTheDocument();

        const permits = screen.getByText("Permits").closest(".switch-row") as HTMLElement;
        await userEvent.click(within(permits).getByRole("button", { name: "Restore" }));
        await waitFor(() => expect(api.calls).toContainEqual({ call: "POST 3 restore" }));
        expect(await screen.findByText("Label restored")).toBeInTheDocument();
    });

    it("moves a label up or down, sending the whole order", async () => {
        const api = labelsApi();
        renderApp(page, personas.superAdmin, ...api.handlers, ...settingsHandlers);
        await screen.findByText("Concrete");
        // the ends can't move further, and an archived label has no place to move
        expect(screen.getByRole("button", { name: "Move Concrete up" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Move Finishing down" })).toBeDisabled();
        expect(screen.queryByRole("button", { name: "Move Permits up" })).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Move Finishing up" }));
        await waitFor(() => expect(api.calls).toContainEqual({ call: "PUT order", body: { ids: [2, 1] } }));
        await waitFor(() => expect(rows()).toEqual(["Finishing", "Concrete", "Permits"]));
    });
});
