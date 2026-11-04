import { isIos } from "./install";

/*
 * iOS zooms the page in when a field whose text is under 16px gets focus, and the app's fields are 13px (hourline.css),
 * so every tap on a field zoomed the page. maximum-scale=1 stops that, on iOS only: iOS still lets people pinch to zoom
 * whatever the page says, while Android's browsers would not, and they don't zoom on focus anyway.
 */
export function stopFieldZoomOnIos() {
    if (!isIos()) return;
    const viewport = document.querySelector('meta[name="viewport"]');
    const content = viewport?.getAttribute("content");
    if (viewport && content && !content.includes("maximum-scale")) viewport.setAttribute("content", `${content}, maximum-scale=1`);
}
