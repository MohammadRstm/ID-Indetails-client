import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { workHandlers } from "@/test/fixtures/work";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";

async function openReport() {
    await userEvent.click(await screen.findByRole("button", { name: "Account" }));
    await userEvent.click(screen.getByRole("button", { name: "Report a bug" }));
    return screen.findByRole("dialog", { name: "Report a bug" });
}

describe("Report a bug", () => {
    it("says what is missing, then sends the report with the page's path only", async () => {
        const sent: unknown[] = [];
        renderApp("/design/projects?new=1", personas.designEmployee, ...workHandlers,
            http.post("/api/bug-reports", async ({ request }) => { sent.push(await request.json()); return new HttpResponse(null, { status: 204 }); }));
        const dialog = await openReport();

        await userEvent.click(within(dialog).getByRole("button", { name: "Send report" }));
        expect(within(dialog).getByText("Say in a few words what went wrong.")).toBeInTheDocument();
        expect(within(dialog).getByText("Describe what happened.")).toBeInTheDocument();
        expect(sent).toHaveLength(0);

        await userEvent.type(within(dialog).getByLabelText("What went wrong"), "The timer stopped");
        await userEvent.type(within(dialog).getByLabelText("What happened"), "I changed page and it stopped.");
        await userEvent.click(within(dialog).getByRole("button", { name: "Send report" }));
        await waitFor(() => expect(sent).toEqual([{ title: "The timer stopped", description: "I changed page and it stopped.", steps: null, page: "/design/projects" }]));
        expect(await screen.findByText("Thanks - your report was sent")).toBeInTheDocument();
    });

    it("says why a report wasn't sent, and keeps what was written", async () => {
        renderApp("/design/projects", personas.designEmployee, ...workHandlers,
            http.post("/api/bug-reports", () => HttpResponse.json(
                { type: "rate_limited", code: "too_many_requests", message: "Too many requests. Please wait a minute and try again." }, { status: 429 })));
        const dialog = await openReport();
        await userEvent.type(within(dialog).getByLabelText("What went wrong"), "Again");
        await userEvent.type(within(dialog).getByLabelText("What happened"), "Still broken.");
        await userEvent.click(within(dialog).getByRole("button", { name: "Send report" }));
        expect(await within(dialog).findByText("Too many requests. Please wait a minute and try again.")).toBeInTheDocument();
        expect(within(dialog).getByLabelText("What went wrong")).toHaveValue("Again");
    });

    it("offers WhatsApp and email instead, carrying what was typed and the page", async () => {
        renderApp("/design/projects", personas.designEmployee, ...workHandlers);
        const dialog = await openReport();
        await userEvent.type(within(dialog).getByLabelText("What went wrong"), "Save does nothing");

        const whatsapp = within(dialog).getByRole("link", { name: "WhatsApp" }).getAttribute("href")!;
        expect(whatsapp.startsWith("https://wa.me/96171317958?text=")).toBe(true);
        expect(decodeURIComponent(whatsapp.split("text=")[1])).toBe("Bug report (ID InDetails)\n\nSave does nothing\n\nPage: /design/projects");

        const email = within(dialog).getByRole("link", { name: "Email" }).getAttribute("href")!;
        expect(email.startsWith("mailto:mohammadrstm2004@gmail.com?subject=Bug%20report%3A%20Save%20does%20nothing&body=")).toBe(true);
    });
});
