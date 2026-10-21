import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { P } from "@/app/permissions/codes";
import { personas, withPermissions } from "@/test/personas";
import { renderApp } from "@/test/renderApp";
import type { WebsiteContent, WebsiteProject, WebsiteProjects } from "./websiteApi";
import { missingToPublish, placeError, slugOf, splitPosition, yearError } from "./websiteRules";

const rana = personas.superAdmin;

function project(id: number, title: string, change: Partial<WebsiteProject> = {}): WebsiteProject {
    return {
        id, slug: slugOf(title), title, type: "villa", status: "completed", year: 2022, shownStatus: "completed", shownYear: 2022,
        client: "The Rizk family", city: "Beirut", country: "Lebanon", countryCode: "LB", latitude: 33.8938, longitude: 35.5018, positionApproximate: false, description: "A villa.",
        thumbnailFileId: null, heroFileId: null, heroAlt: null, linkedProject: null, published: true, conveyorOrder: null,
        gallery: [], missingToPublish: [], createdAt: "2026-10-01T09:00:00Z", updatedAt: null,
        ...change,
    };
}

const villa = project(1, "Villa Rizk", { conveyorOrder: 1 });
const hotel = project(2, "Hotel Le Gray", { type: "hotel", conveyorOrder: 2 });
const draft = project(3, "Batroun House", { published: false, status: "in_progress", shownStatus: "in_progress", missingToPublish: ["a card picture", "a page picture"] });
const list = (canManage = true, projects = [villa, hotel, draft]): WebsiteProjects => ({ projects, conveyorLimit: 20, canManage });

const content = (change: Partial<WebsiteContent> = {}): WebsiteContent => ({
    services: [{ id: 1, title: "Architecture", description: "Buildings from the first sketch." }, { id: 2, title: "Interiors", description: "Whole homes." }],
    locations: [{ id: 1, city: "Beirut", country: "Lebanon", countryCode: "LB", latitude: 33.8938, longitude: 35.5018, positionApproximate: true, address: "Gemmayze", phone: "+961 1 234 567" }],
    socialLinks: [{ id: 1, label: "Instagram", url: "https://instagram.com/indetails" }],
    contactEmail: "hello@indetails.com", faviconFileId: null, underConstructionSince: null, canManage: true,
    ...change,
});

const handlers = (projects = list(), c = content()) => [
    http.get("/api/website/projects", () => HttpResponse.json(projects)),
    http.get("/api/website/content", () => HttpResponse.json(c)),
    http.get("/api/website/places/countries", () => HttpResponse.json([{ code: "FR", name: "France" }, { code: "LB", name: "Lebanon" }])),
    http.get("/api/website/places/cities", ({ request }) => {
        const q = new URL(request.url).searchParams;
        const all = q.get("country") === "LB"
            ? [{ name: "Beirut", latitude: 33.88894, longitude: 35.49442, population: 1916100 }, { name: "Jbeil", latitude: 34.12111, longitude: 35.64806, population: 40000 }]
            : [];
        const search = (q.get("search") ?? "").toLowerCase();
        return HttpResponse.json(all.filter((c) => c.name.toLowerCase().includes(search)));
    }),
];

describe("the Website page", () => {
    it("is the super admins', in the Website area, and out of reach for an admin", async () => {
        renderApp("/website/projects", rana, ...handlers());
        expect(await screen.findByRole("heading", { name: "Projects" })).toBeInTheDocument();
        expect(await screen.findByRole("list", { name: "Moving strip" })).toHaveTextContent("Villa Rizk");
        expect(screen.getByLabelText("Projects in the strip")).toHaveTextContent("2 / 20");
        const draftRow = screen.getByText("Batroun House").closest("tr") as HTMLElement;
        expect(within(draftRow).getByText(/Draft · 2 to add/)).toBeInTheDocument();
        expect(screen.getByText("Villa Rizk", { selector: "tr div" }).closest("tr")).toHaveTextContent("Published · strip #1");
    });

    it("isn't open to a Design admin", async () => {
        const asked: string[] = [];
        renderApp("/website/projects", personas.designAdmin, http.get("/api/website/projects", () => { asked.push("projects"); return HttpResponse.json(list()); }));
        await waitFor(() => expect(window.location.pathname).toBe("/design/overview"));
        expect(asked).toEqual([]);
    });

    it("is the whole app for the website's staff", async () => {
        renderApp("/website/projects", personas.websiteAdmin, ...handlers());
        expect(await screen.findByRole("list", { name: "Moving strip" })).toHaveTextContent("Villa Rizk");
        expect(screen.getByRole("button", { name: /New project/ })).toBeInTheDocument();
        expect(within(screen.getByRole("navigation")).queryByText("All areas")).not.toBeInTheDocument();
    });

    it("lets someone with website:view alone look without changing anything", async () => {
        const viewer = withPermissions(rana, { revoke: [P.WEBSITE_MANAGE] });
        renderApp("/website/projects", viewer, ...handlers(list(false), content({ canManage: false })));
        await screen.findByRole("list", { name: "Moving strip" });
        expect(screen.queryByRole("button", { name: /New project/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Move Villa Rizk down/ })).not.toBeInTheDocument();
        await userEvent.click(within(screen.getByRole("navigation")).getByText("Services"));
        expect(await screen.findByText("Interiors")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Add service/ })).not.toBeInTheDocument();
    });

    it("adds a project, saying what's wrong as it is typed and what publishing still needs", async () => {
        const sent: unknown[] = [];
        renderApp("/website/projects", rana, ...handlers(),
            http.post("/api/website/projects", async ({ request }) => {
                const body = await request.json();
                sent.push(body);
                return HttpResponse.json(project(9, "Saifi Loft", { published: false }), { status: 201 });
            }));
        await userEvent.click(await screen.findByRole("button", { name: /New project/ }));
        await userEvent.click(screen.getByRole("button", { name: "Add project" }));
        expect(await screen.findByText("Give the project a title.")).toBeInTheDocument();
        expect(screen.getByText("Choose a status, or link a system project to follow its status.")).toBeInTheDocument();
        expect(sent).toHaveLength(0);

        await userEvent.type(screen.getByLabelText(/^Title/), "Saifi Loft");
        expect(screen.getByText(/Page address: \/projects\/saifi-loft/)).toBeInTheDocument();
        expect(screen.queryByLabelText("Page address")).not.toBeInTheDocument();
        await userEvent.click(screen.getByLabelText(/^Status/));
        await userEvent.click(screen.getByRole("option", { name: "Completed" }));
        await userEvent.type(screen.getByLabelText(/^Year/), "2021");
        await userEvent.type(screen.getByLabelText("Latitude"), "95");
        expect(await screen.findByText("Give both the latitude and the longitude, or neither.")).toBeInTheDocument();
        // a position pasted from a map fills both
        await userEvent.clear(screen.getByLabelText("Latitude"));
        await userEvent.click(screen.getByLabelText("Latitude"));
        await userEvent.paste("33.8955, 35.5125");
        expect(screen.getByLabelText("Longitude")).toHaveValue("35.5125");

        await userEvent.click(screen.getByRole("switch", { name: "Published" }));
        expect(await screen.findByText(/To publish it, add a description, a card picture, a page picture\./)).toBeInTheDocument();
        await userEvent.click(screen.getByRole("switch", { name: "Published" }));

        await userEvent.click(screen.getByRole("button", { name: "Add project" }));
        await waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0]).toMatchObject({ title: "Saifi Loft", type: "villa", status: "completed", year: 2021, latitude: 33.8955, longitude: 35.5125, projectId: null, published: false });
        // a new project stays open for its gallery
        expect(await screen.findByRole("button", { name: /Add pictures/ })).toBeInTheDocument();
    });

    it("links a system project: the form fills in, and its status and year follow it", async () => {
        const sent: unknown[] = [];
        renderApp("/website/projects", rana, ...handlers(),
            http.get("/api/website/link-candidates", () => HttpResponse.json([
                { id: 40, title: "Villa Achrafieh", domainCode: "design", status: "in_progress", year: 2027, client: "Mr Haddad", description: "Three floors.", websiteProjectId: null },
                { id: 41, title: "Villa Rizk", domainCode: "design", status: "completed", year: 2022, client: null, description: null, websiteProjectId: 1 },
            ])),
            http.post("/api/website/projects", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(project(10, "Villa Achrafieh"), { status: 201 }); }));
        await userEvent.click(await screen.findByRole("button", { name: /New project/ }));
        await userEvent.click(screen.getByRole("button", { name: /Link a system project/ }));
        expect(await screen.findByRole("option", { name: /Villa Rizk.*already on the website/ })).toBeDisabled();
        await userEvent.click(screen.getByRole("option", { name: /Villa Achrafieh/ }));

        expect(screen.getByLabelText(/^Title/)).toHaveValue("Villa Achrafieh");
        expect(screen.getByLabelText("Client")).toHaveValue("Mr Haddad");
        expect(screen.getByText("Follows the project: 2027")).toBeInTheDocument();
        expect(screen.getByLabelText(/^Status/)).toHaveTextContent("Follow the project (In progress)");

        await userEvent.click(screen.getByRole("button", { name: "Add project" }));
        await waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0]).toMatchObject({ projectId: 40, status: null, year: null, description: "Three floors." });
    });

    it("keeps the moving strip in order: moved, taken out and added", async () => {
        const strips: number[][] = [];
        renderApp("/website/projects", rana, ...handlers(),
            http.put("/api/website/conveyor", async ({ request }) => {
                const { projectIds } = await request.json() as { projectIds: number[] };
                strips.push(projectIds);
                return HttpResponse.json(list(true, [villa, hotel, draft].map((p) => ({ ...p, conveyorOrder: projectIds.includes(p.id) ? projectIds.indexOf(p.id) + 1 : null }))));
            }));
        await userEvent.click(await screen.findByRole("button", { name: "Move Villa Rizk down" }));
        await waitFor(() => expect(strips.at(-1)).toEqual([2, 1]));
        await userEvent.click(within(screen.getByRole("list", { name: "Moving strip" })).getAllByRole("button", { name: "Take out" })[0]);
        await waitFor(() => expect(strips.at(-1)).toEqual([1]));
        // only published projects can join it: the draft isn't offered
        await userEvent.click(screen.getByLabelText("Add to the strip"));
        expect(screen.queryByRole("option", { name: "Batroun House" })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("option", { name: "Hotel Le Gray" }));
        await waitFor(() => expect(strips.at(-1)).toEqual([1, 2]));
    });

    it("says the strip is full at 20", async () => {
        const many = Array.from({ length: 21 }, (_, i) => project(100 + i, `Project ${i + 1}`, { conveyorOrder: i < 20 ? i + 1 : null }));
        renderApp("/website/projects", rana, ...handlers(list(true, many)));
        expect(await screen.findByText("The strip is full. Take one out to add another.")).toBeInTheDocument();
        expect(screen.getByLabelText("Projects in the strip")).toHaveTextContent("20 / 20");
    });

    it("adds and orders services, with errors shown as they're typed", async () => {
        const added: unknown[] = [];
        const orders: number[][] = [];
        renderApp("/website/services", rana, ...handlers(),
            http.post("/api/website/services", async ({ request }) => { added.push(await request.json()); return HttpResponse.json(content()); }),
            http.put("/api/website/services/order", async ({ request }) => { orders.push(((await request.json()) as { ids: number[] }).ids); return HttpResponse.json(content()); }));
        await userEvent.click(await screen.findByRole("button", { name: /Add service/ }));
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Name the service.")).toBeInTheDocument();
        expect(screen.getByText("Describe the service.")).toBeInTheDocument();
        await userEvent.type(screen.getByLabelText("Service"), "  Landscape ");
        await userEvent.type(screen.getByLabelText("Description"), "Gardens and terraces.");
        expect(screen.queryByText("Name the service.")).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(added).toEqual([{ title: "Landscape", description: "Gardens and terraces." }]));

        await userEvent.click(screen.getAllByRole("button", { name: "Move service down" })[0]);
        await waitFor(() => expect(orders).toEqual([[2, 1]]));
    });

    it("puts the website under construction after asking, and says so on every page", async () => {
        const sent: unknown[] = [];
        let current = content();
        renderApp("/website/site", rana, ...handlers(list(), current),
            http.put("/api/website/under-construction", async ({ request }) => {
                const body = (await request.json()) as { underConstruction: boolean };
                sent.push(body);
                current = content({ underConstructionSince: body.underConstruction ? "2026-10-21T09:30:00Z" : null });
                return HttpResponse.json(current);
            }));
        expect(await screen.findByText("Live")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Put the website under construction" }));
        const dialog = await screen.findByRole("dialog", { name: "Put the website under construction?" });
        // nothing changes until it is confirmed
        expect(sent).toEqual([]);
        await userEvent.click(within(dialog).getByRole("button", { name: "Put it under construction" }));
        await waitFor(() => expect(sent).toEqual([{ underConstruction: true }]));
        expect(await screen.findByText(/^Under construction since/)).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        // the same button brings it back, after asking again
        await userEvent.click(screen.getByRole("button", { name: "Bring the website back" }));
        await userEvent.click(within(await screen.findByRole("dialog", { name: "Bring the website back?" })).getByRole("button", { name: "Bring it back" }));
        await waitFor(() => expect(sent).toEqual([{ underConstruction: true }, { underConstruction: false }]));
        expect(await screen.findByText("Live")).toBeInTheDocument();
    });

    it("reminds everyone on the other Website pages while it is under construction, and lets a viewer only look", async () => {
        const viewer = withPermissions(rana, { revoke: [P.WEBSITE_MANAGE] });
        const down = content({ underConstructionSince: "2026-10-21T09:30:00Z", canManage: false });
        renderApp("/website/services", viewer, ...handlers(list(false), down));
        const notice = await screen.findByRole("status");
        expect(notice).toHaveTextContent(/The website is under construction since/);
        await userEvent.click(within(notice).getByRole("link", { name: "Open Site" }));
        expect(await screen.findByText(/^Under construction since/)).toBeInTheDocument();
        // a viewer sees where things stand, with nothing to switch
        expect(screen.queryByRole("button", { name: "Bring the website back" })).not.toBeInTheDocument();
        expect(screen.getByText("Under construction", { selector: ".badge" })).toBeInTheDocument();
        // the Site page's own panel says it, so the notice isn't repeated there
        expect(screen.queryByText(/The website is under construction since/)).not.toBeInTheDocument();
    });

    it("checks whether a picture found elsewhere is one of the website's", async () => {
        renderApp("/website/site", rana, ...handlers(),
            http.post("/api/website/watermark-check", () => HttpResponse.json({ found: true, fileId: 40, projectTitle: "Villa Rizk", confidence: 0.93 })));
        await userEvent.upload(await screen.findByLabelText("Picture to check"), new File(["data"], "found.webp", { type: "image/webp" }));
        expect(await screen.findByRole("status")).toHaveTextContent("It's ours: a picture of Villa Rizk (picture 40). The mark reads clearly in 93% of the picture.");
    });

    it("saves the contact email, checking it first", async () => {
        const sent: unknown[] = [];
        renderApp("/website/contact", rana, ...handlers(),
            http.put("/api/company/contact-email", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json({}); }));
        const email = await screen.findByLabelText("Contact email");
        await userEvent.clear(email);
        await userEvent.type(email, "studio@indetails");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Enter an email like hello@company.com.")).toBeInTheDocument();
        expect(sent).toHaveLength(0);
        await userEvent.type(email, ".com");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(sent).toEqual([{ email: "studio@indetails.com" }]));
    });

    it("adds a footer link only with a full https address", async () => {
        const added: unknown[] = [];
        renderApp("/website/contact", rana, ...handlers(),
            http.post("/api/website/social-links", async ({ request }) => { added.push(await request.json()); return HttpResponse.json(content()); }));
        await userEvent.click(await screen.findByRole("button", { name: /Add link/ }));
        await userEvent.type(screen.getByLabelText("Name"), "LinkedIn");
        await userEvent.type(screen.getByLabelText("Link"), "http://linkedin.com/company/indetails");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("The link must be a full https:// address.")).toBeInTheDocument();
        await userEvent.clear(screen.getByLabelText("Link"));
        await userEvent.type(screen.getByLabelText("Link"), "https://linkedin.com/company/indetails");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(added).toEqual([{ label: "LinkedIn", url: "https://linkedin.com/company/indetails" }]));
    });
});

describe("places on the Website page", () => {
    it("adds an office from its city alone, and says when its point was picked in the city", async () => {
        const added: unknown[] = [];
        renderApp("/website/locations", rana, ...handlers(),
            http.post("/api/website/locations", async ({ request }) => { added.push(await request.json()); return HttpResponse.json(content()); }));
        // the office already there shows its point was picked in Beirut
        expect(await screen.findByText(/a point picked in Beirut/)).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: /Add office/ }));
        await userEvent.type(screen.getByLabelText("Address"), "Old souks");
        await userEvent.type(screen.getByLabelText("Phone"), "+961 9 540 000");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("Choose the office's country and city, or type its coordinates.")).toBeInTheDocument();
        // the city waits for the country, and comes from its list
        expect(screen.getByLabelText("City")).toBeDisabled();
        await userEvent.click(screen.getByLabelText("Country"));
        await userEvent.click(await screen.findByRole("option", { name: "Lebanon" }));
        await userEvent.type(screen.getByLabelText("City"), "jb");
        await userEvent.click(await screen.findByRole("option", { name: /Jbeil/ }));
        expect(screen.getByLabelText("City")).toHaveValue("Jbeil");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(added).toEqual([{ city: "Jbeil", country: "Lebanon", latitude: null, longitude: null, address: "Old souks", phone: "+961 9 540 000" }]));
    });

    it("explains a project's random point, and takes typed coordinates as exact", async () => {
        const sent: unknown[] = [];
        const picked = project(5, "Saifi Loft", { published: false, latitude: 33.8961, longitude: 35.5102, positionApproximate: true });
        renderApp("/website/projects", rana, ...handlers(list(true, [picked])),
            http.put("/api/website/projects/5", async ({ request }) => { sent.push(await request.json()); return HttpResponse.json(picked); }));
        await userEvent.click(await screen.findByText("Saifi Loft", { selector: "tr div" }));
        expect(await screen.findByText("A point picked near Beirut. Type the real coordinates for the exact spot.")).toBeInTheDocument();
        expect(screen.getByText("Card picture")).toBeInTheDocument();
        expect(screen.getByText("Page picture")).toBeInTheDocument();
        expect(screen.queryByLabelText("Photographer")).not.toBeInTheDocument();
        await userEvent.clear(screen.getByLabelText("Latitude"));
        await userEvent.click(screen.getByLabelText("Latitude"));
        await userEvent.paste("33.8970, 35.5110");
        expect(screen.queryByText(/A point picked near/)).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0]).toMatchObject({ latitude: 33.897, longitude: 35.511, city: "Beirut", country: "Lebanon" });
    });
});

describe("a project's gallery", () => {
    it("shows a picture as soon as it is added, without reopening the project", async () => {
        const added: unknown[] = [];
        // the server remembers the picture, as the real one does
        let gallery: WebsiteProject["gallery"] = [];
        renderApp("/website/projects", rana,
            // ahead of the usual handlers, so this list wins
            http.get("/api/website/projects", () => HttpResponse.json(list(true, [{ ...villa, gallery }, hotel, draft]))),
            ...handlers(),
            http.post("/api/files", () => HttpResponse.json({ id: 50, name: "pool.jpg", mimeType: "image/jpeg", kind: "image", sizeBytes: 10, createdAt: "2026-10-19T09:00:00Z" }, { status: 201 })),
            http.get("/api/files/50", () => new HttpResponse(new Blob(["x"], { type: "image/jpeg" }))),
            http.post("/api/website/projects/1/images", async ({ request }) => {
                added.push(await request.json());
                gallery = [{ id: 7, fileId: 50, alt: "Villa Rizk" }];
                return HttpResponse.json({ ...villa, gallery });
            }));
        await userEvent.click(await screen.findByText("Villa Rizk", { selector: "tr div" }));
        expect(await screen.findByText(/No gallery pictures yet/)).toBeInTheDocument();
        await userEvent.upload(screen.getByLabelText("Gallery pictures"), new File(["x"], "pool.jpg", { type: "image/jpeg" }));
        await waitFor(() => expect(added).toEqual([{ fileId: 50, alt: "Villa Rizk" }]));
        expect(await screen.findByLabelText("Description of picture 1")).toHaveValue("Villa Rizk");
        expect(screen.queryByText(/No gallery pictures yet/)).not.toBeInTheDocument();
    });
});

describe("the city picker", () => {
    it("never keeps a city typed but not picked", async () => {
        renderApp("/website/locations", rana, ...handlers());
        await userEvent.click(await screen.findByRole("button", { name: /Add office/ }));
        await userEvent.click(screen.getByLabelText("Country"));
        await userEvent.click(await screen.findByRole("option", { name: "Lebanon" }));
        await userEvent.type(screen.getByLabelText("City"), "Gotham");
        expect(await screen.findByText(/No city of that name/)).toBeInTheDocument();
        await userEvent.tab();
        expect(screen.getByLabelText("City")).toHaveValue("");
    });
});

describe("the website form's checks", () => {
    it("match the API's", () => {
        expect(slugOf("  Hôtel   Le Gray — Beirut! ")).toBe("hotel-le-gray-beirut");
        expect(slugOf("فيلا")).toBe("");
        // a country is enough to place a project
        expect(missingToPublish({ status: "completed", year: 2022, city: "", country: "Lebanon", latitude: "", longitude: "", description: "x", thumbnail: 1, hero: 2 })).toEqual([]);
        expect(yearError("", false)).toBeTruthy();
        expect(yearError("", true)).toBe(false);
        expect(yearError("1850", true)).toBeTruthy();
        expect(placeError("", "")).toBe(false);
        expect(placeError("33.9", "")).toBeTruthy();
        expect(placeError("33.9", "181")).toBeTruthy();
        expect(splitPosition("33.8938, 35.5018")).toEqual(["33.8938", "35.5018"]);
        expect(splitPosition("33.8938")).toBeNull();
        // coordinates are enough; without them, the city and country
        const place = { status: "completed", year: 2022, description: "x", thumbnail: 1, hero: 2 };
        expect(missingToPublish({ ...place, city: "", country: "", latitude: "34.12", longitude: "35.65" })).toEqual([]);
        expect(missingToPublish({ ...place, city: "Byblos", country: "", latitude: "", longitude: "" })).toEqual(["a country"]);
        expect(missingToPublish({ status: "completed", year: 2022, city: "Beirut", country: "Lebanon", latitude: "1", longitude: "2", description: "x", thumbnail: 1, hero: 2 })).toEqual([]);
    });
});
