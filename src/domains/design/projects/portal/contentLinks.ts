import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import { getContentLink, type FileItem } from "./contentApi";

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

/** Saves the file: its link (asked for at the tab's address, `base`) is a download, not a page. */
export function downloadItem(base: string, item: FileItem): Promise<void> {
    return getContentLink(base, item.id, false)
        .then(({ url }) => follow(url, { download: item.file.name }))
        .catch(failed("The file wasn't downloaded"));
}

/** Shows the file in a new tab, which has no way back to this page. */
export function openItemInTab(base: string, item: FileItem): Promise<void> {
    return getContentLink(base, item.id, true)
        .then(({ url }) => follow(url, { newTab: true }))
        .catch(failed("The file couldn't be opened"));
}
