import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { renderApp } from "@/test/renderApp";
import type { PortalAuthResponse } from "../portalApi";
import { resetLinks } from "../presentation/presentationLinks";
import type { PortalPresentation, PresentationItem } from "../presentation/presentationTypes";
import {
    CLIENT_BASE, commentOf, messageOf, mockDiscussion, nadia, sarah, summaryOf, threadOf, threadSummaryOf, youAre,
    type MockDiscussion,
} from "./discussionTestKit";

/*
 * The client's side of a project's discussion: the project chat in the page's drawer, @mentions, and the comments on
 * files (on the cards and in the lightbox). The mock API keeps the messages and the threads and writes down what it is asked.
 */

const MB = 1024 * 1024;
const auth: PortalAuthResponse = {
    accessToken: "portal-token",
    accessTokenExpiresAt: "2030-01-01T00:00:00Z",
    account: { id: 7, email: "rania@client.test", firstName: "Rania", lastName: "Aoun", projects: [{ id: 2, title: "Villa Mounir interiors", status: "active", unread: 0 }] },
};
const signedIn = http.post("/api/portal/auth/refresh", () => HttpResponse.json(auth));

const imageOf = (id: number, title: string): PresentationItem => ({
    id, title, name: `${title}.jpg`, contentType: "image/jpeg", preview: "image", sizeBytes: 2 * MB,
    previewUrl: `/api/content-store/previews/${id}?sig=a`, previewUrlExpiresAt: "2030-01-01T00:00:00Z",
});
const living = imageOf(11, "Living room");
const kitchen = imageOf(12, "Kitchen");
const brochure: PresentationItem = {
    id: 14, title: "Brochure", name: "brochure.pdf", contentType: "application/pdf", preview: "pdf", sizeBytes: 3 * MB, previewUrl: null, previewUrlExpiresAt: null,
};
const published: PortalPresentation = {
    projectId: 2, title: "Villa Mounir interiors", status: "active", summary: null, isPublished: true, publishedAt: "2026-10-01T09:00:00Z", hero: null,
    sections: [
        { section: "presentation", items: [living, kitchen, brochure] },
        { section: "model", items: [] },
        { section: "drawing", items: [] },
    ],
};
const presented = http.get("/api/portal/projects/:id", () => HttpResponse.json(published));

/** Rania, the client, signed in. */
const me = youAre("c7");

type Init = Partial<Pick<MockDiscussion, "summary" | "messages" | "threads">>;

/** Opens the client's page at `path` with the mock discussion holding `init`. */
function open(path: string, init: Init = {}) {
    const { box, handlers } = mockDiscussion(CLIENT_BASE, { viewer: "c7", ...init });
    renderApp(path, null, signedIn, presented, ...handlers);
    return box;
}

const chat = () => screen.findByRole("dialog", { name: "Messages" });
/** The texts of the chat's messages, in the order they are shown. */
const texts = () => within(screen.getByRole("log", { name: "Messages" })).getAllByRole("listitem").map((li) => li.querySelector(".dp-text")?.textContent);
const messageBox = (dialog: HTMLElement) => within(dialog).getByRole("textbox", { name: "Message" });
const token = /^[0-9a-f-]{36}$/;

beforeEach(resetLinks);

describe("the project chat on the client's page", () => {
    it("opens from the link with the messages oldest first, and loads earlier ones with before", async () => {
        const messages = Array.from({ length: 35 }, (_, i) => messageOf(i + 1, i % 2 ? nadia : me, `Message ${i + 1}`));
        const box = open("/portal/projects/2?chat=1", { messages });

        const dialog = await chat();
        expect(await within(dialog).findByText("Message 35")).toBeInTheDocument();
        // the newest page: 30 messages, the oldest of them first
        expect(texts()).toHaveLength(30);
        expect(texts()[0]).toBe("Message 6");
        expect(texts()[29]).toBe("Message 35");

        await userEvent.click(within(dialog).getByRole("button", { name: "Load earlier messages" }));
        expect(await within(dialog).findByText("Message 1")).toBeInTheDocument();
        expect(texts()).toHaveLength(35);
        expect(texts()[0]).toBe("Message 1");
        expect(texts()[34]).toBe("Message 35");
        // the first page was asked for without before, the second from the oldest message it had
        expect(box.called("GET", "/messages").map((c) => new URLSearchParams(c.search).get("before"))).toEqual([null, "6"]);
        expect(within(dialog).queryByRole("button", { name: "Load earlier messages" })).toBeNull();
    });

    it("shows who wrote each message, from which side, when it was edited, and an empty chat's invitation to say hello", async () => {
        const box = open("/portal/projects/2?chat=1", {
            messages: [messageOf(1, nadia, "Welcome Rania"), messageOf(2, me, "Thank you", { editedAt: "2026-10-14T09:30:00Z" })],
        });
        const dialog = await chat();
        const first = (await within(dialog).findByText("Welcome Rania")).closest("li") as HTMLElement;
        expect(within(first).getByText("Nadia Karam")).toBeInTheDocument();
        expect(within(first).getByText("Team")).toBeInTheDocument();
        expect(within(first).queryByText("(edited)")).toBeNull();
        const second = within(dialog).getByText("Thank you").closest("li") as HTMLElement;
        expect(within(second).getByText("Client")).toBeInTheDocument();
        expect(within(second).getByText("(edited)")).toBeInTheDocument();
        expect(box.called("GET", "/messages")).toHaveLength(1);
    });

    it("tells a client with no messages to say hello", async () => {
        open("/portal/projects/2?chat=1");
        const dialog = await chat();
        expect(await within(dialog).findByText("No messages yet. Say hello to your project team.")).toBeInTheDocument();
    });

    it("is opened by the Messages button, which counts what is new, and closed again", async () => {
        open("/portal/projects/2", { summary: summaryOf("c7", { unreadMessages: 3, unreadComments: 1 }) });

        const button = await screen.findByRole("button", { name: "Messages 3 unread" });
        expect(screen.getByRole("button", { name: "Comments 1 unread" })).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).toBeNull();
        await userEvent.click(button);
        const dialog = await chat();
        expect(window.location.search).toBe("?chat=1");

        await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(window.location.search).toBe("");
    });

    it("sends the text with a clientToken and the keys of the people mentioned", async () => {
        const box = open("/portal/projects/2?chat=1", { messages: [messageOf(1, nadia, "Welcome Rania")] });
        const dialog = await chat();
        await within(dialog).findByText("Welcome Rania");

        await userEvent.type(messageBox(dialog), "Hello team");
        await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));

        expect(await within(dialog).findByText("Hello team")).toBeInTheDocument();
        expect(box.called("POST", "/messages").map((c) => c.body)).toEqual([{ body: "Hello team", mentions: [], clientToken: expect.stringMatching(token) }]);
        expect(messageBox(dialog)).toHaveValue("");
    });

    it("sends with Enter and starts a new line with Shift+Enter", async () => {
        const box = open("/portal/projects/2?chat=1");
        const dialog = await chat();
        await userEvent.type(await within(dialog).findByRole("textbox", { name: "Message" }), "Line one{Shift>}{Enter}{/Shift}Line two{Enter}");

        await waitFor(() => expect(box.called("POST", "/messages")).toHaveLength(1));
        expect(box.called("POST", "/messages")[0].body).toMatchObject({ body: "Line one\nLine two" });
    });

    it("keeps the text of a send that failed, says why, and Retry sends the same message again", async () => {
        const box = open("/portal/projects/2?chat=1");
        box.failSends = 1;
        const dialog = await chat();
        await within(dialog).findByText("No messages yet. Say hello to your project team.");
        await userEvent.type(messageBox(dialog), "Please keep this");
        await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));

        const alert = await within(dialog).findByRole("alert");
        expect(alert).toHaveTextContent("The message couldn't be sent. Try again.");
        expect(messageBox(dialog)).toHaveValue("Please keep this");
        expect(box.called("POST", "/messages")).toHaveLength(1);

        await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));
        expect(await within(dialog).findByText("Please keep this")).toBeInTheDocument();
        expect(messageBox(dialog)).toHaveValue("");
        const sent = box.called("POST", "/messages").map((c) => c.body as { clientToken: string });
        expect(sent).toHaveLength(2);
        // the same message: the same token
        expect(sent[1].clientToken).toBe(sent[0].clientToken);
        expect(sent[0].clientToken).toMatch(token);
        // and it is in the chat once
        expect(box.messages).toHaveLength(1);
        expect(texts()).toEqual(["Please keep this"]);
    });

    it("counts the characters against the limit and says what is wrong as it happens", async () => {
        const box = open("/portal/projects/2?chat=1");
        const dialog = await chat();
        const field = await within(dialog).findByRole("textbox", { name: "Message" });
        expect(within(dialog).getByText("0 / 4000")).toBeInTheDocument();

        // nothing to send: the box says so, next to itself
        await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));
        expect(within(dialog).getByRole("alert")).toHaveTextContent("Write something to send.");
        await userEvent.type(field, "Hi");
        expect(within(dialog).queryByRole("alert")).toBeNull();
        expect(within(dialog).getByText("2 / 4000")).toBeInTheDocument();

        await userEvent.clear(field);
        await userEvent.click(field);
        await userEvent.paste("x".repeat(4001));
        expect(within(dialog).getByText("4001 / 4000")).toBeInTheDocument();
        expect(within(dialog).getByRole("alert")).toHaveTextContent("Too long by 1 character. Shorten it to send.");
        await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));
        expect(box.called("POST", "/messages")).toHaveLength(0);
    });

    it("lets people edit their own messages with a PUT, and offers nobody else's an Edit", async () => {
        const box = open("/portal/projects/2?chat=1", { messages: [messageOf(1, nadia, "Welcome Rania"), messageOf(2, me, "Draft plan please")] });
        const dialog = await chat();

        const theirs = (await within(dialog).findByText("Welcome Rania")).closest("li") as HTMLElement;
        expect(within(theirs).queryByRole("button", { name: "Edit" })).toBeNull();
        expect(within(dialog).getAllByRole("button", { name: "Edit" })).toHaveLength(1);

        const mine = within(dialog).getByText("Draft plan please").closest("li") as HTMLElement;
        await userEvent.click(within(mine).getByRole("button", { name: "Edit" }));
        const field = within(mine).getByRole("textbox", { name: "Edit message" });
        expect(field).toHaveValue("Draft plan please");
        await userEvent.clear(field);
        await userEvent.type(field, "Draft plan, please");
        await userEvent.click(within(mine).getByRole("button", { name: "Save" }));

        expect(await within(dialog).findByText("Draft plan, please")).toBeInTheDocument();
        expect(within(mine).getByText("(edited)")).toBeInTheDocument();
        expect(box.called("PUT", "/messages/2").map((c) => c.body)).toEqual([{ body: "Draft plan, please", mentions: [] }]);
        // the editing box is gone, the composer stays
        expect(within(dialog).queryByRole("textbox", { name: "Edit message" })).toBeNull();
    });

    it("can give up an edit with Cancel, and sends nothing", async () => {
        const box = open("/portal/projects/2?chat=1", { messages: [messageOf(1, me, "As it was")] });
        const dialog = await chat();
        await userEvent.click(await within(dialog).findByRole("button", { name: "Edit" }));
        await userEvent.type(within(dialog).getByRole("textbox", { name: "Edit message" }), " and more");
        await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

        expect(within(dialog).getByText("As it was")).toBeInTheDocument();
        expect(box.called("PUT", "/messages/1")).toHaveLength(0);
    });

    it("shows an archived project's messages with the reason and no composer", async () => {
        const reason = "This project is archived. You can read the messages but not add to them.";
        open("/portal/projects/2?chat=1", {
            summary: summaryOf("c7", { canWrite: false, closedReason: reason }),
            messages: [messageOf(1, nadia, "Handover is done"), messageOf(2, me, "Thank you all", { canEdit: false })],
        });
        const dialog = await chat();

        expect(await within(dialog).findByText("Handover is done")).toBeInTheDocument();
        expect(within(dialog).getByText(reason)).toBeInTheDocument();
        expect(within(dialog).queryByRole("textbox")).toBeNull();
        expect(within(dialog).queryByRole("button", { name: "Send" })).toBeNull();
        expect(within(dialog).queryByRole("button", { name: "Edit" })).toBeNull();
    });

    it("marks the chat read, up to its newest message, once that is on screen", async () => {
        const box = open("/portal/projects/2?chat=1", {
            summary: summaryOf("c7", { unreadMessages: 2, lastMessageId: 3 }),
            messages: [messageOf(1, nadia, "One"), messageOf(2, nadia, "Two"), messageOf(3, nadia, "Three")],
        });
        const dialog = await chat();
        await within(dialog).findByText("Three");

        await waitFor(() => expect(box.called("POST", "/read")).toHaveLength(1));
        expect(box.called("POST", "/read")[0].body).toEqual({ lastMessageId: 3 });
        // the answer is the new summary: nothing is new any more
        expect(await screen.findByRole("button", { name: "Messages" })).toBeInTheDocument();
    });

    it("shows a failed load with a way to try again", async () => {
        const { handlers } = mockDiscussion(CLIENT_BASE, { viewer: "c7" });
        let failing = true;
        renderApp("/portal/projects/2?chat=1", null, signedIn, presented,
            http.get(`${CLIENT_BASE}/messages`, () => failing
                ? HttpResponse.json({ type: "forbidden", code: "forbidden", message: "The chat is resting." }, { status: 403 })
                : HttpResponse.json({ messages: [messageOf(1, nadia, "Back again")], hasMore: false })),
            ...handlers);

        const dialog = await chat();
        const alert = await within(dialog).findByRole("alert");
        expect(alert).toHaveTextContent("The chat is resting.");
        failing = false;
        await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));
        expect(await within(dialog).findByText("Back again")).toBeInTheDocument();
    });
});

describe("mentions", () => {
    it("offers the people who take part when @ and letters are typed, and puts the choice in the text and the keys", async () => {
        const box = open("/portal/projects/2?chat=1");
        const dialog = await chat();
        const field = await within(dialog).findByRole("textbox", { name: "Message" });

        await userEvent.type(field, "Hi @Na");
        const list = await within(dialog).findByRole("listbox", { name: "Mention someone" });
        // only the people whose name has the letters, and never you
        expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual(["Nadia KaramTeam"]);
        await userEvent.click(within(list).getByRole("option", { name: "Nadia Karam" }));

        expect(field).toHaveValue("Hi @Nadia Karam ");
        expect(within(dialog).queryByRole("listbox")).toBeNull();
        await userEvent.type(field, "please look");
        await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));

        await waitFor(() => expect(box.called("POST", "/messages")).toHaveLength(1));
        expect(box.called("POST", "/messages")[0].body).toMatchObject({ body: "Hi @Nadia Karam please look", mentions: ["u2"] });
        // the sent message shows the name as a pill
        expect(await within(dialog).findByText("@Nadia Karam")).toHaveClass("dp-mention");
    });

    it("works from the keyboard: the arrows choose, Enter picks and Escape closes the list", async () => {
        const box = open("/portal/projects/2?chat=1");
        const dialog = await chat();
        const field = await within(dialog).findByRole("textbox", { name: "Message" });

        await userEvent.type(field, "@");
        const options = await within(dialog).findAllByRole("option");
        expect(options.map((o) => o.getAttribute("aria-selected"))).toEqual(["true", "false"]);
        await userEvent.keyboard("{ArrowDown}");
        expect(within(dialog).getAllByRole("option").map((o) => o.getAttribute("aria-selected"))).toEqual(["false", "true"]);
        await userEvent.keyboard("{Enter}");
        expect(field).toHaveValue("@Sarah Haddad ");
        // Enter picked: nothing was sent
        expect(box.called("POST", "/messages")).toHaveLength(0);

        await userEvent.type(field, "and @Na");
        expect(await within(dialog).findByRole("listbox")).toBeInTheDocument();
        await userEvent.keyboard("{Escape}");
        expect(within(dialog).queryByRole("listbox")).toBeNull();
        // Escape closed the list only: the drawer is still there, and so is the text
        expect(screen.getByRole("dialog", { name: "Messages" })).toBeInTheDocument();
        expect(field).toHaveValue("@Sarah Haddad and @Na");
    });

    it("sends only the people whose @Name is still in the text", async () => {
        const box = open("/portal/projects/2?chat=1");
        const dialog = await chat();
        const field = await within(dialog).findByRole("textbox", { name: "Message" });

        await userEvent.type(field, "@Sa");
        await userEvent.click(await within(dialog).findByRole("option", { name: "Sarah Haddad" }));
        await userEvent.type(field, "and @Na");
        await userEvent.click(await within(dialog).findByRole("option", { name: "Nadia Karam" }));
        // Sarah's name is taken out again
        await userEvent.clear(field);
        await userEvent.type(field, "Just @Nadia Karam now");
        await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));

        await waitFor(() => expect(box.called("POST", "/messages")).toHaveLength(1));
        expect(box.called("POST", "/messages")[0].body).toMatchObject({ body: "Just @Nadia Karam now", mentions: ["u2"] });
    });

    it("highlights the people a message names, and writes anyone else's @ as it is", async () => {
        open("/portal/projects/2?chat=1", { messages: [messageOf(1, sarah, "Thanks @Nadia Karam and @Someone", { mentions: ["u2"] })] });
        const dialog = await chat();

        expect(await within(dialog).findByText("@Nadia Karam")).toHaveClass("dp-mention");
        expect(within(dialog).queryByText("@Someone")).toBeNull();
        expect(within(dialog).getByText(/and @Someone/)).toBeInTheDocument();
    });
});

describe("text in the discussion is plain text", () => {
    it("draws markup as the characters it is, and links only https: addresses", async () => {
        open("/portal/projects/2?chat=1", {
            messages: [
                messageOf(1, nadia, "<img src=x onerror=alert(1)>"),
                messageOf(2, nadia, "Plan: https://example.com/plan. And <b>this</b>"),
                messageOf(3, nadia, "Do not open javascript:alert(1) or http://example.com/old"),
            ],
        });
        const dialog = await chat();

        expect(await within(dialog).findByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
        expect(document.querySelector(".dp-text img")).toBeNull();
        expect(document.querySelector("img[src='x']")).toBeNull();
        expect(within(dialog).getByText(/And <b>this<\/b>/)).toBeInTheDocument();
        expect(document.querySelector(".dp-text b")).toBeNull();

        // the full stop that ends the sentence is not part of the link
        const link = within(dialog).getByRole("link", { name: "https://example.com/plan" });
        expect(link).toHaveAttribute("href", "https://example.com/plan");
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener noreferrer");
        // the other addresses stay text
        const third = within(dialog).getByText(/Do not open/).closest("li") as HTMLElement;
        expect(within(third).queryAllByRole("link")).toHaveLength(0);
        expect(within(dialog).getAllByRole("link")).toHaveLength(1);
    });
});

describe("comments on files", () => {
    const thread = (over: Partial<ReturnType<typeof threadOf>> = {}) =>
        threadOf(11, "Living room", [
            commentOf(1, 11, nadia, "Do you prefer the oak?", { onEarlierVersion: true, fileName: "Living room v1.jpg" }),
            commentOf(2, 11, me, "Yes, oak please"),
        ], over);
    const init = (): Init => ({
        summary: summaryOf("c7", { unreadComments: 1, lastCommentId: 2, threads: [threadSummaryOf(11, "Living room", { count: 2, unread: 1 })] }),
        threads: { 11: thread() },
    });

    it("shows on each card how many comments its file has, and whether some are new", async () => {
        open("/portal/projects/2", init());

        const card = within(await screen.findByRole("article", { name: "Living room" }));
        const chip = await card.findByRole("button", { name: "Comments on Living room: 2, some new" });
        expect(chip).toHaveTextContent("2");
        // a file nobody has commented on offers the first comment
        const other = within(screen.getByRole("article", { name: "Kitchen" }));
        expect(other.getByRole("button", { name: "Comments on Kitchen" })).toHaveTextContent("Comment");
        // and so does a PDF, next to Open and Download
        expect(within(screen.getByRole("article", { name: "Brochure" })).getByRole("button", { name: "Comments on Brochure" })).toBeInTheDocument();
    });

    it("opens a picture's comments beside it in the lightbox, and posts a comment on that file", async () => {
        const box = open("/portal/projects/2", init());
        // the cards have their comments once the discussion has been loaded
        await screen.findByRole("button", { name: /^Comments on Living room/ });
        await userEvent.click(screen.getByRole("button", { name: "View Living room" }));
        const dialog = await screen.findByRole("dialog", { name: "Living room" });
        expect(within(dialog).queryByRole("complementary")).toBeNull();

        await userEvent.click(await within(dialog).findByRole("button", { name: "Comments, 2, some new" }));
        const panel = await within(dialog).findByRole("complementary", { name: "Comments" });
        // opening a file's comments puts it in the link
        expect(window.location.search).toBe("?item=11");
        expect(await within(panel).findByText("Do you prefer the oak?")).toBeInTheDocument();
        expect(within(panel).getByText("Yes, oak please")).toBeInTheDocument();
        expect(within(panel).getByText("Living room.jpg")).toBeInTheDocument();
        // the comment written about an older version of the file says so
        expect(within(panel).getByText("On an earlier version (Living room v1.jpg)")).toBeInTheDocument();
        expect(within(within(panel).getByText("Yes, oak please").closest("li") as HTMLElement).queryByText(/earlier version/)).toBeNull();

        await userEvent.type(within(panel).getByRole("textbox", { name: "Comment" }), "Oak, then. Thank you!");
        await userEvent.click(within(panel).getByRole("button", { name: "Send" }));
        expect(await within(panel).findByText("Oak, then. Thank you!")).toBeInTheDocument();
        expect(box.called("POST", "/comments").map((c) => c.body)).toEqual([
            { itemId: 11, body: "Oak, then. Thank you!", mentions: [], clientToken: expect.stringMatching(token) },
        ]);

        // hiding the panel takes it out of the link; so does closing the lightbox
        await userEvent.click(within(dialog).getByRole("button", { name: /^Comments/ }));
        expect(within(dialog).queryByRole("complementary")).toBeNull();
        expect(window.location.search).toBe("");
        await userEvent.click(within(dialog).getByRole("button", { name: /^Comments/ }));
        await within(dialog).findByRole("complementary", { name: "Comments" });
        await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(window.location.search).toBe("");
    });

    it("opens a card's comments in the lightbox with its panel, and the link ?item= does the same", async () => {
        open("/portal/projects/2?item=11", init());

        const dialog = await screen.findByRole("dialog", { name: "Living room" });
        const panel = await within(dialog).findByRole("complementary", { name: "Comments" });
        expect(await within(panel).findByText("Do you prefer the oak?")).toBeInTheDocument();
        // moving to the next picture takes the panel along, and the link
        await userEvent.click(within(dialog).getByRole("button", { name: "Next" }));
        expect(window.location.search).toBe("?item=12");
        expect(within(dialog).getByRole("complementary", { name: "Comments" })).toBeInTheDocument();
    });

    it("opens the comments of a file that is not a picture in the drawer, with a way back to all comments", async () => {
        open("/portal/projects/2", init());

        await userEvent.click(await screen.findByRole("button", { name: "Comments on Brochure" }));
        const dialog = await screen.findByRole("dialog", { name: "Comments" });
        expect(window.location.search).toBe("?item=14");
        // nobody has commented on it yet: the title and file name are the page's own
        expect(await within(dialog).findByText("Brochure")).toBeInTheDocument();
        expect(within(dialog).getByText("brochure.pdf")).toBeInTheDocument();
        expect(within(dialog).getByText("No comments yet.")).toBeInTheDocument();
        expect(within(dialog).getByRole("textbox", { name: "Comment" })).toBeInTheDocument();

        await userEvent.click(within(dialog).getByRole("button", { name: "All comments" }));
        // the list is another drawer
        const list = await screen.findByRole("dialog", { name: "Comments" });
        expect(await within(list).findByRole("button", { name: /Living room/ })).toBeInTheDocument();
        expect(window.location.search).toBe("?comments=1");
    });

    it("asks before deleting your own comment, then shows it as deleted", async () => {
        const box = open("/portal/projects/2?item=11", init());
        const dialog = await screen.findByRole("dialog", { name: "Living room" });
        const panel = await within(dialog).findByRole("complementary", { name: "Comments" });
        const theirs = (await within(panel).findByText("Do you prefer the oak?")).closest("li") as HTMLElement;
        const mine = within(panel).getByText("Yes, oak please").closest("li") as HTMLElement;
        // nobody else's comment can be edited or deleted
        expect(within(theirs).queryByRole("button", { name: "Delete" })).toBeNull();
        expect(within(theirs).queryByRole("button", { name: "Edit" })).toBeNull();

        await userEvent.click(within(mine).getByRole("button", { name: "Delete" }));
        expect(within(mine).getByRole("group", { name: "Delete this comment?" })).toBeInTheDocument();
        expect(box.called("DELETE", "/comments/2")).toHaveLength(0);

        // changing one's mind costs nothing
        await userEvent.click(within(mine).getByRole("button", { name: "Cancel" }));
        expect(within(mine).queryByRole("group")).toBeNull();
        expect(within(mine).getByText("Yes, oak please")).toBeInTheDocument();

        await userEvent.click(within(mine).getByRole("button", { name: "Delete" }));
        await userEvent.click(within(mine).getByRole("button", { name: "Delete comment" }));
        expect(await within(panel).findByText("Comment deleted")).toBeInTheDocument();
        expect(within(panel).queryByText("Yes, oak please")).toBeNull();
        expect(box.called("DELETE", "/comments/2")).toHaveLength(1);
    });

    it("edits your own comment with a PUT", async () => {
        const box = open("/portal/projects/2?item=11", init());
        const panel = await within(await screen.findByRole("dialog", { name: "Living room" })).findByRole("complementary", { name: "Comments" });
        const mine = (await within(panel).findByText("Yes, oak please")).closest("li") as HTMLElement;

        await userEvent.click(within(mine).getByRole("button", { name: "Edit" }));
        const field = within(mine).getByRole("textbox", { name: "Edit comment" });
        await userEvent.clear(field);
        await userEvent.type(field, "Yes, light oak please");
        await userEvent.click(within(mine).getByRole("button", { name: "Save" }));

        expect(await within(panel).findByText("Yes, light oak please")).toBeInTheDocument();
        expect(within(mine).getByText("(edited)")).toBeInTheDocument();
        expect(box.called("PUT", "/comments/2").map((c) => c.body)).toEqual([{ body: "Yes, light oak please", mentions: [] }]);
    });

    it("lists the files that have comments, and shows one no longer shared as read-only", async () => {
        open("/portal/projects/2?comments=1", {
            summary: summaryOf("c7", {
                threads: [
                    threadSummaryOf(11, "Living room", { count: 2, unread: 1 }),
                    threadSummaryOf(99, "Old sketch", { available: false, count: 1 }),
                ],
            }),
            threads: {
                11: thread(),
                99: threadOf(99, "Old sketch", [commentOf(5, 99, nadia, "Superseded by the new plan")], { available: false }),
            },
        });
        const dialog = await screen.findByRole("dialog", { name: "Comments" });

        const living = await within(dialog).findByRole("button", { name: /Living room/ });
        expect(within(living).getByText("2")).toBeInTheDocument();
        expect(within(living).getByText("1 new")).toBeInTheDocument();
        const old = within(dialog).getByRole("button", { name: /Old sketch/ });
        expect(within(old).getByText("No longer shared")).toBeInTheDocument();

        await userEvent.click(old);
        expect(window.location.search).toBe("?item=99");
        // the file's own comments are another drawer
        const opened = await screen.findByRole("dialog", { name: "Comments" });
        expect(await within(opened).findByText("Superseded by the new plan")).toBeInTheDocument();
        // read-only: the reason where the composer would be
        expect(within(opened).getByText("This file is no longer shared")).toBeInTheDocument();
        expect(within(opened).queryByRole("textbox")).toBeNull();
    });

    it("marks the comments read when a file's comments are on screen", async () => {
        const box = open("/portal/projects/2?item=11", init());
        const panel = await within(await screen.findByRole("dialog", { name: "Living room" })).findByRole("complementary", { name: "Comments" });
        await within(panel).findByText("Yes, oak please");

        await waitFor(() => expect(box.called("POST", "/read")).toHaveLength(1));
        // up to the newest comment of this file, and of this file only
        expect(box.called("POST", "/read")[0].body).toEqual({ itemId: 11, lastCommentId: 2 });
    });

    it("shows an archived project's comments with the reason and no composer", async () => {
        const reason = "This project is archived. You can read the comments but not add to them.";
        open("/portal/projects/2?item=11", {
            ...init(),
            summary: summaryOf("c7", { canWrite: false, closedReason: reason, threads: [threadSummaryOf(11, "Living room", { count: 2 })] }),
        });
        const panel = await within(await screen.findByRole("dialog", { name: "Living room" })).findByRole("complementary", { name: "Comments" });

        expect(await within(panel).findByText("Do you prefer the oak?")).toBeInTheDocument();
        expect(within(panel).getByText(reason)).toBeInTheDocument();
        expect(within(panel).queryByRole("textbox")).toBeNull();
    });
});
