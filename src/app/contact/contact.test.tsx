import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import type { PortalAuthResponse } from "@/portal/portalApi";
import { portalProjectOf } from "@/portal/portalTestKit";
import { FieldError } from "@/shared/components/Forms/Field";
import { workHandlers } from "@/test/fixtures/work";
import { personas } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import { closeContact, hostContact, openContact, useContact } from "./contact";

const traceId = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
const describeField = "What were you trying to do, and what happened?";

/** The Settings → Contact panel: its own Send, apart from any other on the page. */
const contactPanel = async () => (await screen.findByLabelText(describeField)).closest(".panel") as HTMLElement;

/** Whatever was posted to the path, in order, answered 204. */
function recorder(path: string) {
    const sent: Record<string, unknown>[] = [];
    const handler = http.post(path, async ({ request }) => {
        sent.push(await request.json() as Record<string, unknown>);
        return new HttpResponse(null, { status: 204 });
    });
    return { sent, handler };
}

afterEach(() => {
    act(() => closeContact());
    localStorage.clear();
});

describe("Contact the developer", () => {
    it("opens Settings → Contact from the account menu, for an employee too, and sends what they wrote with the page's path", async () => {
        const { sent, handler } = recorder("/api/bug-reports");
        renderApp("/design/projects", personas.designEmployee, ...workHandlers, handler);
        await userEvent.click(await screen.findByRole("button", { name: "Account" }));
        await userEvent.click(screen.getByRole("button", { name: "Contact the developer" }));

        const nav = await screen.findByRole("navigation", { name: "Settings" });
        expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(["Appearance", "Contact"]);
        const panel = await contactPanel();
        await userEvent.click(within(panel).getByRole("button", { name: "Send" }));
        expect(within(panel).getByText("Say what you were trying to do, and what happened.")).toBeInTheDocument();
        expect(sent).toHaveLength(0);

        await userEvent.type(within(panel).getByLabelText(describeField), "I tried to log an entry and it failed.");
        await userEvent.type(within(panel).getByLabelText("Anything else that helps"), "Twice today.");
        await userEvent.click(within(panel).getByRole("button", { name: "Send" }));
        await waitFor(() => expect(sent).toEqual([expect.objectContaining({
            description: "I tried to log an entry and it failed.", details: "Twice today.", page: "/design/settings", error: null,
        })]));
        expect(await screen.findByText("Thanks - your message was sent")).toBeInTheDocument();
        // a new, empty form for the next one
        expect(screen.getByLabelText(describeField)).toHaveValue("");
    });

    it("opens over the page about an error, with its reference and time, which can be left out", async () => {
        const { sent, handler } = recorder("/api/bug-reports");
        renderApp("/design/projects", personas.designEmployee, ...workHandlers, handler);
        await screen.findByRole("button", { name: "Account" });
        act(() => openContact({ ref: traceId, at: "2026-11-13T12:32:00Z", message: null }));

        const dialog = await screen.findByRole("dialog", { name: "Contact the developer" });
        expect(within(dialog).getByText(/Error ref 4bf92f35/)).toBeInTheDocument();
        await userEvent.type(within(dialog).getByLabelText(describeField), "Saving failed.");
        await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));
        await waitFor(() => expect(sent).toEqual([expect.objectContaining({
            page: "/design/projects", error: { ref: traceId, at: "2026-11-13T12:32:00Z", message: null },
        })]));

        act(() => openContact({ ref: traceId, at: "2026-11-13T12:32:00Z", message: null }));
        const again = await screen.findByRole("dialog", { name: "Contact the developer" });
        await userEvent.click(within(again).getByRole("button", { name: "Leave it out" }));
        expect(within(again).queryByText(/Error ref/)).not.toBeInTheDocument();
    });

    it("says why a message wasn't sent, and keeps what was written", async () => {
        renderApp("/design/settings?section=contact", personas.designEmployee, ...workHandlers,
            http.post("/api/bug-reports", () => HttpResponse.json(
                { type: "rate_limited", code: "too_many_requests", message: "Too many requests. Please wait a minute and try again." }, { status: 429 })));
        const panel = await contactPanel();
        await userEvent.type(within(panel).getByLabelText(describeField), "Still broken.");
        await userEvent.click(within(panel).getByRole("button", { name: "Send" }));
        expect(await within(panel).findByText("Too many requests. Please wait a minute and try again.")).toBeInTheDocument();
        expect(within(panel).getByLabelText(describeField)).toHaveValue("Still broken.");
    });

    it("offers WhatsApp instead, carrying what was typed and the page", async () => {
        renderApp("/design/settings?section=contact", personas.designEmployee, ...workHandlers);
        await userEvent.type(await screen.findByLabelText(describeField), "Save does nothing");
        const link = screen.getByRole("link", { name: "WhatsApp" }).getAttribute("href")!;
        expect(link.startsWith("https://wa.me/96171317958?text=")).toBe(true);
        expect(decodeURIComponent(link.split("text=")[1])).toBe("Contact the developer (ID InDetails)\n\nSave does nothing\n\nPage: /design/settings");
    });

    it("tells each person about it once on this device, until they open it or put it away", async () => {
        const first = renderApp("/design/projects", personas.designEmployee, ...workHandlers);
        expect(await screen.findByText(/You can now reach the developer from Settings → Contact/)).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Hide the Contact banner" }));
        expect(screen.queryByText(/You can now reach the developer/)).not.toBeInTheDocument();
        first.unmount();

        const second = renderApp("/design/projects", personas.designEmployee, ...workHandlers);
        await screen.findByRole("button", { name: "Account" });
        expect(screen.queryByText(/You can now reach the developer/)).not.toBeInTheDocument();
        second.unmount();

        // someone else on the same computer still sees it
        renderApp("/design/projects", { ...personas.designEmployee, id: 404 }, ...workHandlers);
        expect(await screen.findByText(/You can now reach the developer/)).toBeInTheDocument();
    });

    it("gives the Website area's staff Settings with the theme and Contact", async () => {
        renderApp("/website/settings?section=contact", personas.websiteAdmin);
        const nav = await screen.findByRole("navigation", { name: "Settings" });
        expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(["Appearance", "Contact"]);
        expect(await screen.findByLabelText(describeField)).toBeInTheDocument();
    });

    it("lets a client in the portal write to the developer from the top bar", async () => {
        const auth: PortalAuthResponse = {
            accessToken: "portal-token",
            accessTokenExpiresAt: "2030-01-01T00:00:00Z",
            account: { id: 7, email: "rania@client.test", firstName: "Rania", lastName: "Aoun", projects: [portalProjectOf(2, "Villa Mounir interiors")] },
        };
        const { sent, handler } = recorder("/api/portal/contact");
        renderApp("/portal", null, handler,
            http.post("/api/portal/auth/refresh", () => HttpResponse.json({ ...auth, account: { ...auth.account, projects: [] } })));
        await userEvent.click(await screen.findByRole("button", { name: /Contact/ }));
        const dialog = await screen.findByRole("dialog", { name: "Contact the developer" });
        await userEvent.type(within(dialog).getByLabelText(describeField), "A drawing won't open.");
        await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));
        await waitFor(() => expect(sent).toEqual([expect.objectContaining({ description: "A drawing won't open.", page: "/portal" })]));
    });

    it("shows the developer's WhatsApp on the sign-in page", async () => {
        renderApp("/login", null);
        const link = await screen.findByRole("link", { name: "WhatsApp the developer" });
        expect(link.getAttribute("href")!.startsWith("https://wa.me/96171317958")).toBe(true);
    });
});

describe("an error's Contact the developer link", () => {
    function Opened() {
        const open = useContact();
        return <output>{open ? `${open.about?.ref} at ${open.about?.at}` : "closed"}</output>;
    }

    it("comes only with an unexpected failure's reference, and opens the window about it", async () => {
        const undo = hostContact();
        render(<><FieldError message="Something went wrong on our side. Please try again later. (ref 4bf92f35)" /><FieldError message="Pick a project." /><Opened /></>);
        expect(screen.getAllByRole("button", { name: "Contact the developer" })).toHaveLength(1);

        await userEvent.click(screen.getByRole("button", { name: "Contact the developer" }));
        expect(screen.getByRole("status")).toHaveTextContent(/^4bf92f35 at \d{4}-/);
        undo();
    });
});
