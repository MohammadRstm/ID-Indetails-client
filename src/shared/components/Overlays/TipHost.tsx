import { useEffect } from "react";
import { tip } from "./tip";

/**
 * The one tooltip element the charts write into (see tip.ts). Rendered once by the app.
 *
 * A press, a key, scrolling or leaving the window hides it. What was pointed at may have just opened a dialog
 * over itself, or been redrawn, so the mouseleave that would hide the tip never comes; the next mousemove over
 * something with a tip shows it again.
 */
export default function TipHost() {
    useEffect(() => {
        const hide = () => tip.hide();
        document.addEventListener("pointerdown", hide, true);
        document.addEventListener("keydown", hide, true);
        window.addEventListener("scroll", hide, true);
        window.addEventListener("blur", hide);
        return () => {
            document.removeEventListener("pointerdown", hide, true);
            document.removeEventListener("keydown", hide, true);
            window.removeEventListener("scroll", hide, true);
            window.removeEventListener("blur", hide);
        };
    }, []);
    return <div id="tip" className="tip" hidden />;
}
