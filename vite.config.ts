// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  // Render as a client-side SPA so the build emits a static shell that can be
  // served behind any domain (no SSR server needed for these missions).
  tanstackStart: {
    server: { entry: "server" },
    spa: { enabled: true },
  },
  // Allow the dev/preview server to be reached via any Host header, so it can
  // sit behind a custom subdomain in deployment.
  vite: {
    server: { allowedHosts: true },
    preview: { allowedHosts: true, host: true },
  },
});
