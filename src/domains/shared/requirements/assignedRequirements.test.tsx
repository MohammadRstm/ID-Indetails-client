import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { work, workHandlers } from "@/test/fixtures/work";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

const [first] = work.requirements.items;
const other = { ...first, id: 9, text: "Kitchen elevations", deadline: null, project: { ...first.project, id: 5, title: "Studio Nour brand space" } };
const mine = http.get("/api/me/requirements", () => HttpResponse.json({ ...work.requirements, items: [other, first], projects: 2 }));

describe("A Design employee's Requirements page", () => {
    it("lists the requirements assigned to them, dated first, and narrows them to one project", async () => {
        renderApp("/design/requirements", personas.designEmployee, mine, ...workHandlers);
        expect(await screen.findByRole("heading", { name: "Requirements" })).toBeInTheDocument();
        const rows = await screen.findAllByText(/^(Handover package|Kitchen elevations)/);
        expect(rows.map((r) => r.textContent)).toEqual([first.text, "Kitchen elevations"]);
        expect(screen.getByText("No deadline")).toBeInTheDocument();

        await userEvent.click(screen.getByLabelText("Project"));
        await userEvent.click(screen.getByRole("option", { name: "Studio Nour brand space" }));
        expect(screen.queryByText(first.text)).toBeNull();
        expect(screen.getByText("Kitchen elevations")).toBeInTheDocument();
        expect(screen.getByText("1 of 2")).toBeInTheDocument();
    });

    it("has left My work", async () => {
        renderApp("/design/my-work", personas.designEmployee, ...workHandlers);
        expect(await screen.findByRole("heading", { name: "My work" })).toBeInTheDocument();
        expect(screen.queryByText("Your requirement deadlines")).toBeNull();
    });
});
