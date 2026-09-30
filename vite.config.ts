/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API runs on https://localhost:7187 in development (its "https" launch profile). Proxying it makes the
// browser see one origin, so the refresh cookie (SameSite=Strict, Path=/api/auth) is sent.
const api = process.env.HOURLINE_API ?? "https://localhost:7187";

export default defineConfig({
    plugins: [react()],
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
        restoreMocks: true,
    },
});
