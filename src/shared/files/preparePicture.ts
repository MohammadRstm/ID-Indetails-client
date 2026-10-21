/** What the browser can redraw: the photos the API takes, but HEIC (most browsers can't open it; the API keeps it). */
const SHRINKABLE = ["image/jpeg", "image/png", "image/webp"];

/** WebP at 75 looks the same as the original on screen at a fraction of its size, as the API stores it. */
const QUALITY = 0.75;

/**
 * A photo made small before it is sent: turned upright as the camera held it, at most `maxEdge` px on its longest side
 * (never cropped), as WebP. A phone photo of several MB goes up as a few hundred KB, so uploads are quick; the API
 * does the same again for anything that didn't (docs/files.md). Anything else, or a photo that wouldn't get smaller,
 * goes as it is.
 */
export async function preparePicture(file: File, maxEdge = 1920): Promise<File> {
    if (!SHRINKABLE.includes(file.type) || typeof createImageBitmap !== "function") return file;
    try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) return file;
        context.imageSmoothingQuality = "high";
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();

        const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/webp", QUALITY));
        // an older Safari can't write WebP and gives a PNG, often bigger: the original goes then
        if (!blob || blob.size >= file.size) return file;
        const extension = blob.type === "image/webp" ? ".webp" : ".png";
        return new File([blob], file.name.replace(/\.[^./\\]*$/, "") + extension, { type: blob.type });
    } catch {
        return file;
    }
}
