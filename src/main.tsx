import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import "@/styles/hourline.css";
import "@/styles/fonts.css";
import "@/styles/client.css";
import { applyTheme } from "@/shared/theme";
import App from "./App";

// The production CSP allows no string evaluation: zod validates without compiling code (and stops probing for it).
z.config({ jitless: true });
applyTheme();

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
