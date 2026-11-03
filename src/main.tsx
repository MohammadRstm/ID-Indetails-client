import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import "@/styles/hourline.css";
import "@/styles/fonts.css";
import "@/styles/client.css";
import "@/styles/portal.css";
import "@/styles/portal-notifications.css";
import { applyTheme } from "@/shared/theme";
import { catchInstallPrompt } from "@/app/pwa/install";
import { watchForNewVersion } from "@/app/pwa/newVersion";
import { registerServiceWorker } from "@/app/pwa/serviceWorker";
import App from "./App";

// The production CSP allows no string evaluation: zod validates without compiling code (and stops probing for it).
z.config({ jitless: true });
applyTheme();
registerServiceWorker();
watchForNewVersion();
// before React draws anything: the browser offers installing once, early
catchInstallPrompt();

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
