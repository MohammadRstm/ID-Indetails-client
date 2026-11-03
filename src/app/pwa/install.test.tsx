import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const DAY = 24 * 60 * 60_000;
const BANNER = "Add ID-Indetails to your home screen, to open it like an app.";

/** The install state and its parts, fresh: the module remembers what the browser offered and what was put away. */
async function openApp() {
    vi.resetModules();
    const install = await import("./install");
    const { default: InstallBanner } = await import("./InstallBanner");
    const { default: InstallMenuItem } = await import("./InstallMenuItem");
    const { default: InstallSteps } = await import("./InstallSteps");
    install.catchInstallPrompt();
    const close = vi.fn();
    const view = render(<><InstallBanner /><InstallMenuItem close={close} /><InstallSteps /></>);
    return { close, view };
}

/** Chromium's offer to install, as it arrives on window. */
function offerPrompt() {
    const prompt = vi.fn(() => Promise.resolve());
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt });
    act(() => { window.dispatchEvent(event); });
    return { prompt, event };
}

function runningOn(agent: string, touchPoints = 0) {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(agent);
    // jsdom has no touch screen at all
    Object.defineProperty(navigator, "maxTouchPoints", { value: touchPoints, configurable: true });
}

describe("installing the app", () => {
    let standalone: boolean;

    beforeEach(() => {
        standalone = false;
        vi.stubGlobal("matchMedia", (query: string) => ({ matches: standalone && query.includes("display-mode: standalone") }));
        localStorage.clear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
        Reflect.deleteProperty(navigator, "maxTouchPoints");
    });

    it("uses the browser's own prompt where it has one, from the phone's banner or the account menu", async () => {
        const { close } = await openApp();
        expect(screen.queryByText(BANNER)).toBeNull();

        const { prompt, event } = offerPrompt();
        // the browser's own install bar stays away
        expect(event.defaultPrevented).toBe(true);
        expect(screen.getByText(BANNER)).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Install ID-Indetails" }));
        expect(close).toHaveBeenCalled();
        expect(prompt).toHaveBeenCalledTimes(1);
        // the prompt can be shown once: nothing offers it again until the browser does
        expect(screen.queryByText(BANNER)).toBeNull();
        expect(screen.queryByRole("button", { name: "Install ID-Indetails" })).toBeNull();
    });

    it("offers nothing once the app is installed, or when it was opened from its icon", async () => {
        const { view } = await openApp();
        offerPrompt();
        act(() => { window.dispatchEvent(new Event("appinstalled")); });
        expect(screen.queryByText(BANNER)).toBeNull();
        expect(screen.queryByRole("button", { name: "Install ID-Indetails" })).toBeNull();

        view.unmount();
        standalone = true;
        runningOn(IPHONE);
        await openApp();
        offerPrompt();
        expect(screen.queryByText(BANNER)).toBeNull();
        expect(screen.queryByRole("button", { name: "Install ID-Indetails" })).toBeNull();
    });

    it("shows iPhone and iPad users the Share menu's steps", async () => {
        runningOn(IPHONE);
        const { view } = await openApp();
        await userEvent.click(screen.getByRole("button", { name: "Install" }));
        const steps = screen.getByRole("dialog");
        expect(steps).toHaveTextContent("Install ID-Indetails");
        expect(steps).toHaveTextContent("Add to Home Screen");
        await userEvent.click(screen.getByRole("button", { name: "Done" }));
        expect(screen.queryByRole("dialog")).toBeNull();

        view.unmount();
        // an iPad says it is a Mac, with a touch screen
        runningOn(MAC, 5);
        await openApp();
        expect(screen.getByRole("button", { name: "Install ID-Indetails" })).toBeInTheDocument();
    });

    it("offers nothing in a browser that can't install it", async () => {
        runningOn(MAC);
        await openApp();
        expect(screen.queryByText(BANNER)).toBeNull();
        expect(screen.queryByRole("button", { name: "Install ID-Indetails" })).toBeNull();
    });

    it("keeps the banner away for a month once put away, while the account menu still offers installing", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        runningOn(IPHONE);
        const { view } = await openApp();
        await userEvent.click(screen.getByRole("button", { name: "Not now" }));
        expect(screen.queryByText(BANNER)).toBeNull();
        expect(screen.getByRole("button", { name: "Install ID-Indetails" })).toBeInTheDocument();

        view.unmount();
        vi.setSystemTime(Date.now() + 29 * DAY);
        const later = await openApp();
        expect(screen.queryByText(BANNER)).toBeNull();

        later.view.unmount();
        vi.setSystemTime(Date.now() + 2 * DAY);
        await openApp();
        expect(screen.getByText(BANNER)).toBeInTheDocument();
    });

    it("leaves the manifest out while the client portal is open, so the browser offers no install there", async () => {
        const manifest = document.createElement("link");
        manifest.rel = "manifest";
        manifest.href = "/manifest.webmanifest";
        document.head.append(manifest);
        const { useNoInstall } = await import("./install");
        function Portal() {
            useNoInstall();
            return null;
        }

        const portal = render(<Portal />);
        expect(document.querySelector('link[rel="manifest"]')).toBeNull();
        portal.unmount();
        expect(document.querySelector('link[rel="manifest"]')).not.toBeNull();
        manifest.remove();
    });
});
