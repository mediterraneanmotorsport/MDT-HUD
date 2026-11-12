import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

function spotterAudioPlugin(): Plugin {
  const roots = [path.resolve("Perfil"), path.resolve("public", "Perfil")];

  function scanManifest() {
    const manifest: Record<string, Record<string, string[]>> = {};
    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      for (const profileEntry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!profileEntry.isDirectory()) continue;
        const profile = profileEntry.name;
        manifest[profile] ??= {};
        const profileDir = path.join(root, profile);
        for (const eventEntry of fs.readdirSync(profileDir, { withFileTypes: true })) {
          if (!eventEntry.isDirectory()) continue;
          const eventName = eventEntry.name;
          manifest[profile][eventName] ??= [];
          const eventDir = path.join(profileDir, eventName);
          for (const fileEntry of fs.readdirSync(eventDir, { withFileTypes: true })) {
            if (!fileEntry.isFile()) continue;
            if (!/\.(wav|mp3|ogg)$/i.test(fileEntry.name)) continue;
            const url = `/Perfil/${encodeURIComponent(profile)}/${encodeURIComponent(eventName)}/${encodeURIComponent(fileEntry.name)}`;
            if (!manifest[profile][eventName].includes(url)) {
              manifest[profile][eventName].push(url);
            }
          }
        }
      }
    }
    return manifest;
  }

  return {
    name: "mdt-spotter-audio",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        const cleanUrl = req.url.split("?")[0];
        if (cleanUrl === "/__spotter_files") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(scanManifest()));
          return;
        }
        if (cleanUrl.startsWith("/Perfil/")) {
          const rel = decodeURIComponent(cleanUrl.slice("/Perfil/".length));
          for (const root of roots) {
            const full = path.join(root, rel);
            if (full.startsWith(root) && fs.existsSync(full) && fs.statSync(full).isFile()) {
              const ext = path.extname(full).toLowerCase();
              res.setHeader(
                "Content-Type",
                ext === ".mp3" ? "audio/mpeg" : ext === ".ogg" ? "audio/ogg" : "audio/wav",
              );
              fs.createReadStream(full).pipe(res);
              return;
            }
          }
        }
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte(), tailwindcss(), spotterAudioPlugin()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
});
