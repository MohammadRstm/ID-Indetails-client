import { contentBase, type FileItem, type ItemState, type PortalContentItem } from "./contentApi";
import { filesBase, isPublished, type FileComments, type ProjectFile } from "./filesApi";

/*
 * The two tabs share their sections, grids and cards. The mode says which tab a card is in: the project's files
 * (everything, changed by its uploader or a manager, with its comments), or the files chosen for the client (read-only
 * cards, with where each stands against what clients see). Each answer is mapped to one card shape.
 */

export type CardMode = "files" | "portal";

/** Where the tab's files are on the API: their links are asked for there. */
export const baseOf = (mode: CardMode, projectId: number) => (mode === "files" ? filesBase(projectId) : contentBase(projectId));

/** One card, as either tab shows it. */
export type CardItem = FileItem & {
    /** Faded, last and out of the order: clients still see it until the next publish, though it was deleted or taken off their files. */
    removed: boolean;
    /** Clients see a version of it now: deleting it leaves it with them until the next publish. */
    published: boolean;
    /** Client portal: where it stands against what clients see (its badge). */
    state: ItemState | null;
    /** Project files: chosen for the client. */
    forClient: boolean;
    /** Project files: this person may rename, move, replace or delete it. */
    canEdit: boolean;
    /** Project files: its comments. */
    comments: FileComments | null;
};

export const fileCard = (item: ProjectFile): CardItem => ({ ...item, published: isPublished(item), state: null });

export const chosenCard = (item: PortalContentItem): CardItem => ({
    ...item, removed: item.state === "removed", published: item.state !== "new", forClient: true, canEdit: false, comments: null,
});
