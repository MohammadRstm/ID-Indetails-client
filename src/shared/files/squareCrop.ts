/*
 * A picture shown through a square window, moved and zoomed by hand until the face sits where it should, and then cut to
 * that square. The picture fills the window at zoom 1 (its shorter side as wide as the window) and never leaves a gap at an
 * edge. `x` and `y` are where the picture's top-left corner is, in the window's own pixels (0 or less).
 */

export type Placement = { zoom: number; x: number; y: number };
export type PictureSize = { width: number; height: number };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The picture as drawn in a window `side` px wide: its scale and size in window pixels. */
export function shownSize(size: PictureSize, side: number, zoom: number) {
    const scale = (side / Math.min(size.width, size.height)) * zoom;
    return { scale, width: size.width * scale, height: size.height * scale };
}

/** Moves a placement back inside what the picture covers: zoom between its limits, and no gap at any edge. */
export function clampPlacement(placement: Placement, size: PictureSize, side: number): Placement {
    const zoom = clamp(placement.zoom, MIN_ZOOM, MAX_ZOOM);
    const shown = shownSize(size, side, zoom);
    return { zoom, x: clamp(placement.x, side - shown.width, 0), y: clamp(placement.y, side - shown.height, 0) };
}

/** The picture's middle in the middle of the window: where it starts, and what "Center" goes back to. */
export function centered(size: PictureSize, side: number, zoom = MIN_ZOOM): Placement {
    const shown = shownSize(size, side, clamp(zoom, MIN_ZOOM, MAX_ZOOM));
    return clampPlacement({ zoom, x: (side - shown.width) / 2, y: (side - shown.height) / 2 }, size, side);
}

/** A new zoom that keeps whatever is in the middle of the window in the middle of it. */
export function zoomTo(placement: Placement, zoom: number, size: PictureSize, side: number): Placement {
    const before = shownSize(size, side, placement.zoom).scale;
    const after = shownSize(size, side, clamp(zoom, MIN_ZOOM, MAX_ZOOM)).scale;
    const middleX = (side / 2 - placement.x) / before;
    const middleY = (side / 2 - placement.y) / before;
    return clampPlacement({ zoom, x: side / 2 - middleX * after, y: side / 2 - middleY * after }, size, side);
}

/** Which square of the picture, in its own pixels, the window shows. */
export function sourceSquare(placement: Placement, size: PictureSize, side: number) {
    const { scale } = shownSize(size, side, placement.zoom);
    // (0 - x, not -x: a picture at the very edge is 0, never -0)
    return { x: (0 - placement.x) / scale, y: (0 - placement.y) / scale, side: side / scale };
}

/** The window's picture cut out as a square `edge` px wide, as a WebP file; null where the browser can't draw or write one. */
export async function cropToSquare(source: CanvasImageSource, square: { x: number; y: number; side: number }, edge: number): Promise<File | null> {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = edge;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, square.x, square.y, square.side, square.side, 0, 0, edge, edge);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/webp", 0.85));
    // an older Safari can't write WebP and gives a PNG: still a square, so it goes
    if (!blob) return null;
    return new File([blob], blob.type === "image/webp" ? "photo.webp" : "photo.png", { type: blob.type });
}

/** What the browser can open to place: the photos the API takes, but HEIC (most browsers can't read it). */
const OPENABLE = ["image/jpeg", "image/png", "image/webp"];

/** A picked file opened for placing (turned upright as the camera held it), or null where the browser can't open it. */
export async function openPicture(file: File): Promise<ImageBitmap | null> {
    if (!OPENABLE.includes(file.type) || typeof createImageBitmap !== "function") return null;
    try {
        return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
        return null;
    }
}
