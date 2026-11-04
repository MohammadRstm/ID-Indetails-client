import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopFieldZoomOnIos } from "./fieldZoom";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const START = "width=device-width, initial-scale=1.0, interactive-widget=resizes-content";

describe("zooming into a field on iOS", () => {
    let viewport: HTMLMetaElement;

    beforeEach(() => {
        viewport = document.createElement("meta");
        viewport.name = "viewport";
        viewport.content = START;
        document.head.append(viewport);
    });

    afterEach(() => viewport.remove());

    it("stops on iPhones and iPads, where pinching still zooms", () => {
        vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE);
        stopFieldZoomOnIos();
        stopFieldZoomOnIos();
        expect(viewport.content).toBe(`${START}, maximum-scale=1`);
    });

    it("is left alone elsewhere, where it would stop pinching too", () => {
        vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ANDROID);
        stopFieldZoomOnIos();
        expect(viewport.content).toBe(START);
    });
});
