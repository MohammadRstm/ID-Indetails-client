import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import { getContentLink, type PortalContentItem } from "./contentApi";

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
export function downloadItem(projectId: number, item: PortalContentItem): Promise<void> {
    return getContentLink(projectId, item.id, false)
        .then(({ url }) => follow(url, { download: item.file.name }))
        .catch(failed("The file wasn't downloaded"));
}

/** Shows the file in a new tab, which has no way back to this page. */
export function openItemInTab(projectId: number, item: PortalContentItem): Promise<void> {
    return getContentLink(projectId, item.id, true)
        .then(({ url }) => follow(url, { newTab: true }))
        .catch(failed("The file couldn't be opened"));
}
