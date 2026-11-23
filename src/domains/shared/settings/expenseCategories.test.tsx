import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { Schemas } from "@/api/types";
import { settingsHandlers } from "@/test/fixtures/settings";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

type Category = Schemas["ExpenseCategoryResponse"];

const start = (): Category[] => [
    { id: 1, domain: "execution", code: "materials", name: "Materials", sortOrder: 0, removable: false },
    { id: 2, domain: "execution", code: "fees", name: "Fees", sortOrder: 1, removable: true },
    { id: 3, domain: "execution", code: "other", name: "Other", sortOrder: 2, removable: false },
];

/** The categories API over Execution's list in memory, keeping each call. */
function categoriesApi(list: Category[] = start()) {
    const calls: { call: string; body?: unknown }[] = [];
    const handlers = [
        http.get("/api/expense-categories", ({ request }) => {
            calls.push({ call: `GET ${new URL(request.url).search}` });
            return HttpResponse.json(list);
        }),
        http.post("/api/expense-categories", async ({ request }) => {
            const body = (await request.json()) as { domain: string; name: string };
            calls.push({ call: "POST", body });
            if (list.some((c) => c.name.toLowerCase() === body.name.toLowerCase())) {
                return HttpResponse.json({ type: "validation", code: "expense_category_name_taken", message: "This business already has a category by that name." }, { status: 400 });
            }
            const added = { id: 10, domain: "execution", code: body.name.toLowerCase(), name: body.name, sortOrder: list.length, removable: true };
            list.push(added);
            return HttpResponse.json(added, { status: 201 });
        }),
        http.put("/api/expense-categories/order", async ({ request }) => {
            const body = (await request.json()) as { ids: number[] };
            calls.push({ call: "PUT order", body });
            list.sort((a, b) => body.ids.indexOf(a.id) - body.ids.indexOf(b.id));
            return HttpResponse.json(list);
        }),
        http.put("/api/expense-categories/:id", async ({ request, params }) => {
            const body = (await request.json()) as { name: string };
            calls.push({ call: `PUT ${String(params.id)}`, body });
            const c = list.find((x) => x.id === +String(params.id))!;
            c.name = body.name;
            return HttpResponse.json(c);
        }),
        http.delete("/api/expense-categories/:id", ({ params }) => {
            calls.push({ call: `DELETE ${String(params.id)}` });
            list.splice(list.findIndex((x) => x.id === +String(params.id)), 1);
            return new HttpResponse(null, { status: 204 });
        }),
    ];
    return { calls, handlers };
}

const page = "/execution/settings?section=finance";
const names = () => Array.from(document.querySelectorAll<HTMLInputElement>(".cat-row input"), (e) => e.value);

describe("the expense categories in Settings › Finance", () => {
    it("lists the business's own categories for whoever changes its money", async () => {
        const api = categoriesApi();
        renderApp(page, personas.superAdmin, ...api.handlers, ...settingsHandlers);
        expect(await screen.findByText("Expense categories")).toBeInTheDocument();
        await waitFor(() => expect(names()).toEqual(["Materials", "Fees", "Other"]));
        expect(api.calls[0].call).toBe("GET ?domain=execution");
    });

    it("isn't shown to someone who can't change the money", async () => {
        const api = categoriesApi();
        renderApp("/design/settings?section=finance", personas.designEmployee, ...api.handlers, ...settingsHandlers);
        await screen.findByRole("navigation", { name: "Settings" });
        expect(screen.queryByText("Expense categories")).not.toBeInTheDocument();
    });

    it("adds one, shows a too-long name at once and the API's duplicate name beside the field", async () => {
        const api = categoriesApi();
        renderApp(page, personas.superAdmin, ...api.handlers, ...settingsHandlers);
        const field = await screen.findByLabelText("New category");
        await userEvent.type(field, "x".repeat(61));
        expect(screen.getByText("Keep it to 60 characters.")).toBeInTheDocument();
        await userEvent.clear(field);
        await userEvent.type(field, "fees");
        await userEvent.click(screen.getByRole("button", { name: "Add" }));
        expect(await screen.findByText("This business already has a category by that name.")).toBeInTheDocument();
        await userEvent.clear(field);
        await userEvent.type(field, "Scaffolding");
        await userEvent.click(screen.getByRole("button", { name: "Add" }));
        await waitFor(() => expect(api.calls).toContainEqual({ call: "POST", body: { domain: "execution", name: "Scaffolding" } }));
        await waitFor(() => expect(names()).toEqual(["Materials", "Fees", "Other", "Scaffolding"]));
    });

    it("renames, reorders and removes; one in use, and Other, can't be removed", async () => {
        const api = categoriesApi();
        renderApp(page, personas.superAdmin, ...api.handlers, ...settingsHandlers);
        const fees = await screen.findByLabelText("Name of Fees");
        await userEvent.clear(fees);
        await userEvent.type(fees, "Permits & fees{Enter}");
        await waitFor(() => expect(api.calls).toContainEqual({ call: "PUT 2", body: { name: "Permits & fees" } }));

        await userEvent.click(screen.getByRole("button", { name: "Move Materials down" }));
        await waitFor(() => expect(api.calls).toContainEqual({ call: "PUT order", body: { domain: "execution", ids: [2, 1, 3] } }));

        expect(screen.getByRole("button", { name: "Remove Materials" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Remove Other" })).toBeDisabled();
        await userEvent.click(screen.getByRole("button", { name: /^Remove Permits/ }));
        await waitFor(() => expect(api.calls).toContainEqual({ call: "DELETE 2" }));
    });
});
