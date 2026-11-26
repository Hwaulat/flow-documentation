// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

function cleanEnvValue(value: string | undefined): string {
  if (!value) return "";
  return value.trim().replace(/^(['"])(.*)\1$/, "$2").trim();
}

function readFirstEnv(
  names: readonly string[],
  sources: readonly Record<string, string | undefined>[],
): string {
  for (const name of names) {
    for (const source of sources) {
      const cleaned = cleanEnvValue(source[name]);
      if (cleaned) return cleaned;
    }
  }
  return "";
}

const cliModeIndex = process.argv.findIndex((arg) => arg === "--mode" || arg === "-m");
const cliMode = cliModeIndex >= 0 ? process.argv[cliModeIndex + 1] : undefined;
const activeMode = cliMode ?? process.env["NODE_ENV"] ?? "development";

const modeEnv = loadEnv(activeMode, process.cwd(), "");
const prodEnv = loadEnv("production", process.cwd(), "");
const devEnv = loadEnv("development", process.cwd(), "");
const envSources = [process.env, modeEnv, prodEnv, devEnv] as const;

const fallbackSupabaseUrl = readFirstEnv(
  ["VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"],
  envSources,
);
const fallbackSupabaseKey = readFirstEnv(
  [
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
  ],
  envSources,
);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(fallbackSupabaseUrl),
      "import.meta.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(fallbackSupabaseUrl),
      "import.meta.env.SUPABASE_URL": JSON.stringify(fallbackSupabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(fallbackSupabaseKey),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(fallbackSupabaseKey),
      "import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(fallbackSupabaseKey),
      "import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": JSON.stringify(fallbackSupabaseKey),
      "import.meta.env.SUPABASE_PUBLISHABLE_KEY": JSON.stringify(fallbackSupabaseKey),
      "import.meta.env.SUPABASE_ANON_KEY": JSON.stringify(fallbackSupabaseKey),
    },
  },
});
