import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/styles/hourline.css";
import "@/styles/fonts.css";
import "@/styles/client.css";
import { applyTheme } from "@/shared/theme";
import App from "./App";

applyTheme();

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
