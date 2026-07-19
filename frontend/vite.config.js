import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server runs on port 3000 (matches the backend CORS + frontend_url config).
// /api and /uploads are proxied to the FastAPI backend so no CORS issues in dev.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on all interfaces (fixes IPv6/IPv4 localhost issues across browsers)
    port: 3000,
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/uploads": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
