import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import OfflineBanner from "./OfflineBanner";

describe("the offline banner", () => {
    it("says the device is offline while it is, and goes away when the connection is back", () => {
        const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
        render(<OfflineBanner />);
        expect(screen.queryByRole("status")).toBeNull();

        online.mockReturnValue(false);
        act(() => { window.dispatchEvent(new Event("offline")); });
        expect(screen.getByRole("status")).toHaveTextContent("You're offline.");

        online.mockReturnValue(true);
        act(() => { window.dispatchEvent(new Event("online")); });
        expect(screen.queryByRole("status")).toBeNull();
    });
});
