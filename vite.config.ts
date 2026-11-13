import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

function getLanIps(): string[] {
  const nets = os.networkInterfaces();
  const ips: string[] = [];
  for (const list of Object.values(nets)) {
    if (!list) continue;
    for (const net of list) {
      if (net.family === "IPv4" && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  // Prefer 192.168.x.x or 10.x.x.x first
  ips.sort((a, b) => (a.startsWith("192.168.") ? -1 : b.startsWith("192.168.") ? 1 : 0));
  return ips.length ? ips : ["localhost"];
}

function spotterAudioPlugin(): Plugin {
  const roots = [path.resolve("Perfil"), path.resolve("public", "Perfil")];
  let mobileState: {
    page: number;
    pageSeq: number;
    pages: string[] | null;
    mobileTheme: string | null;
    configSeq: number;
    snap: unknown;
  } = {
    page: 0,
    pageSeq: 0,
    pages: null,
    mobileTheme: null,
    configSeq: 0,
    snap: null,
  };

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
        if (cleanUrl === "/__mobile_info") {
          const ips = getLanIps();
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(
            JSON.stringify({
              ips,
              port: 1420,
              url: `http://${ips[0]}:1420/#mobile`,
            }),
          );
          return;
        }
        if (cleanUrl === "/__mobile_state") {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");
          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => (body += chunk));
            req.on("end", () => {
              try {
                const parsed = JSON.parse(body);
                if (typeof parsed.page === "number") {
                  mobileState.page = parsed.page;
                  mobileState.pageSeq += 1;
                }
                if (Array.isArray(parsed.pages)) {
                  mobileState.pages = parsed.pages;
                  mobileState.configSeq += 1;
                }
                if (typeof parsed.mobileTheme === "string") {
                  mobileState.mobileTheme = parsed.mobileTheme;
                  mobileState.configSeq += 1;
                }
                if (parsed.snap !== undefined) {
                  mobileState.snap = parsed.snap;
                }
              } catch {
                // ignore malformed JSON
              }
              res.end(
                JSON.stringify({
                  page: mobileState.page,
                  pageSeq: mobileState.pageSeq,
                  configSeq: mobileState.configSeq,
                }),
              );
            });
            return;
          }
          res.end(JSON.stringify(mobileState));
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
    host: host || true,
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
