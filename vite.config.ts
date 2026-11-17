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
  const appDataRoot = process.env.APPDATA ? path.join(process.env.APPDATA, "MDT-HUD", "Perfil") : "";
  const roots = [appDataRoot, path.resolve("Perfil"), path.resolve("public", "Perfil")].filter(Boolean);
  let mobileState: {
    page: number;
    pageSeq: number;
    pages: string[] | null;
    mobileTheme: string | null;
    autoPopups: boolean;
    configSeq: number;
    snap: unknown;
  } = {
    page: 0,
    pageSeq: 0,
    pages: null,
    mobileTheme: null,
    autoPopups: false,
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
            if (/^audio\d+/i.test(fileEntry.name)) continue;
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
        if (cleanUrl.startsWith("/__focus_vehicle")) {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Content-Type", "application/json");
          const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
          const slotId = urlObj.searchParams.get("slotId") || "0";
          import("node:http").then((http) => {
            const proxyReq = http.request(
              {
                hostname: "127.0.0.1",
                port: 6397,
                path: `/rest/watch/focus/${slotId}`,
                method: "PUT",
                headers: {
                  Accept: "application/json",
                  "Content-Length": 0,
                },
              },
              (lmuRes) => {
                res.statusCode = lmuRes.statusCode || 200;
                res.end(JSON.stringify({ ok: lmuRes.statusCode === 200 }));
              }
            );
            proxyReq.on("error", () => {
              res.statusCode = 502;
              res.end(JSON.stringify({ ok: false, error: "lmu_unavailable" }));
            });
            proxyReq.end();
          });
          return;
        }
        if (cleanUrl === "/__spotter_files") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(scanManifest()));
          return;
        }
        if (cleanUrl === "/__mobile_info" || cleanUrl === "/__mobile_state") {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          if (req.method === "OPTIONS") {
            res.statusCode = 204;
            res.end();
            return;
          }
        }
        if (cleanUrl === "/__mobile_info") {
          const ips = getLanIps();
          res.setHeader("Content-Type", "application/json");
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
                if (typeof parsed.autoPopups === "boolean") {
                  mobileState.autoPopups = parsed.autoPopups;
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
    proxy: {
      "/lmu-api": {
        target: "http://127.0.0.1:6397",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/lmu-api/, ""),
      },
    },
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
