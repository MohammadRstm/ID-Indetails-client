import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import type { GetLink, PortalPresentation, PresentationItem } from "./presentationTypes";

/*
 * Links to the files of a presentation. The images and videos come with signed links that change with every answer, and
 * a new link is a new address for the browser: each image would load again. A file therefore keeps the link it was first
 * shown with while more than 10 minutes of it remain. The key is the link without its query string, which is the same
 * for the same stored file.
 */

const KEEP_MS = 10 * 60_000;
const links = new Map<string, { url: string; expiresAt: number }>();

const keyOf = (url: string) => url.split(/[?#]/)[0];

function steady(url: string, expiresAt: string): { url: string; expiresAt: string } {
    const key = keyOf(url);
    const kept = links.get(key);
    if (kept && kept.expiresAt - Date.now() > KEEP_MS) return { url: kept.url, expiresAt: new Date(kept.expiresAt).toISOString() };
    links.set(key, { url, expiresAt: Date.parse(expiresAt) });
    return { url, expiresAt };
}

function steadyItem(item: PresentationItem): PresentationItem {
    if (!item.previewUrl || !item.previewUrlExpiresAt) return item;
    const { url, expiresAt } = steady(item.previewUrl, item.previewUrlExpiresAt);
    return { ...item, previewUrl: url, previewUrlExpiresAt: expiresAt };
}

function steadyHero(hero: NonNullable<PortalPresentation["hero"]>): NonNullable<PortalPresentation["hero"]> {
    const { url, expiresAt } = steady(hero.url, hero.urlExpiresAt);
    return { ...hero, url, urlExpiresAt: expiresAt };
}

/** The presentation with the links its files had before, so loading it again doesn't reload every image. */
export function steadyPresentation(presentation: PortalPresentation): PortalPresentation {
    const now = Date.now();
    for (const [key, link] of links) if (link.expiresAt <= now) links.delete(key);
    return {
        ...presentation,
        hero: presentation.hero && steadyHero(presentation.hero),
        sections: presentation.sections.map((s) => ({ ...s, items: s.items.map(steadyItem) })),
    };
}

/** A link that didn't load (it may have expired): the next answer brings a new one. */
export function forgetLink(url: string) {
    links.delete(keyOf(url));
}

/** Forgets every link; for tests. */
export function resetLinks() {
    links.clear();
}

// ---- opening and saving files ----

/** A hidden link, followed. */
function follow(url: string, options: { download?: string; newTab?: boolean }) {
    const a = document.createElement("a");
    a.href = url;
    a.style.display = "none";
    if (options.newTab) {
        a.target = "_blank";
        a.rel = "noopener";
    }
    if (options.download) a.download = options.download;
    document.body.append(a);
    a.click();
    a.remove();
}

const failed = (text: string) => (error: unknown) => {
    toast({ text, sub: errorMessage(error), icon: "alert" });
};

/** Saves the file: its link is a download, not a page. */
export function downloadItem(getLink: GetLink, item: PresentationItem): Promise<void> {
    return getLink(item.id, false)
        .then(({ url }) => follow(url, { download: item.name }))
        .catch(failed("The file wasn't downloaded"));
}

/** Shows the file in a new tab, which has no way back to this page. */
export function openItem(getLink: GetLink, item: PresentationItem): Promise<void> {
    return getLink(item.id, true)
        .then(({ url }) => follow(url, { newTab: true }))
        .catch(failed("The file couldn't be opened"));
}
