/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// The API runs on https://localhost:7187 in development (its "https" launch profile). Proxying it makes the
// browser see one origin, so the refresh cookie (SameSite=Strict, Path=/api/auth) is sent.
const api = process.env.HOURLINE_API ?? "https://localhost:7187";

// The installable app (docs/deployment.md, "The installed app"). Its service worker (src/sw.ts) shows offline.html when a
// page can't be opened for want of a connection, and the API's pushes. It never serves the app itself or anything from
// the API, so a deploy shows at the next load as before, and nobody's data is ever kept in its cache.
const pwa = VitePWA({
    strategies: "injectManifest",
    srcDir: "src",
    filename: "sw.ts",
    // registered by src/app/pwa/serviceWorker.ts, in production builds only
    injectRegister: false,
    registerType: "autoUpdate",
    manifest: {
        id: "/",
        name: "ID-Indetails",
        short_name: "ID-Indetails",
        description: "Internal project and time-tracking platform",
        start_url: "/",
        scope: "/",
        display: "standalone",
        // the top bar's colour, and the boot screen's, so the splash screen leads into the app without a flash
        theme_color: "#FFFFFF",
        background_color: "#F2F5F4",
        icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
    },
    injectManifest: {
        // what the worker precaches: only the offline page and the install's own files (the manifest and its icons come
        // with it), never index.html or the app's code
        globPatterns: ["offline.html", "favicon.svg", "apple-touch-icon.png"],
        // one file, which nginx never lets the browser keep (deploy/nginx)
        rollupFormat: "iife",
        sourcemap: false,
    },
});

export default defineConfig({
    plugins: [react(), pwa],
    resolve: {
        alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: {
        port: 5173,
        strictPort: true,
        proxy: {
            "/api": { target: api, changeOrigin: true, secure: false },
            "/hubs": { target: api, changeOrigin: true, secure: false, ws: true },
            "/openapi": { target: api, changeOrigin: true, secure: false },
        },
    },
    test: {
        environment: "jsdom",
        setupFiles: ["./src/test/setup.ts"],
        css: false,
        // The development laptop crashes under heavy load: keep the test run small.
        maxWorkers: 2,
        // on two cores a file's first test also loads the whole app, which can take longer than the default 5s
        testTimeout: 15000,
        restoreMocks: true,
    },
});
