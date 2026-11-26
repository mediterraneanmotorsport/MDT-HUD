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
  const diskConfigPath = process.env.APPDATA ? path.join(process.env.APPDATA, "MDT-HUD", "config.json") : "";
  const roots = [appDataRoot, path.resolve("Perfil"), path.resolve("public", "Perfil")].filter(Boolean);
  let lastDiskConfigMtime = 0;
  let mobileState: {
    page: number;
    pageSeq: number;
    pages: string[] | null;
    mobileTheme: string | null;
    autoPopups: boolean;
    configSeq: number;
    appConfig: unknown;
    snap: unknown;
  } = {
    page: 0,
    pageSeq: 0,
    pages: null,
    mobileTheme: null,
    autoPopups: false,
    configSeq: 0,
    appConfig: null,
    snap: null,
  };

  function syncDiskConfig() {
    if (!diskConfigPath) return;
    try {
      const stat = fs.statSync(diskConfigPath);
      if (stat.mtimeMs !== lastDiskConfigMtime) {
        lastDiskConfigMtime = stat.mtimeMs;
        mobileState.appConfig = JSON.parse(fs.readFileSync(diskConfigPath, "utf8"));
        mobileState.configSeq += 1;
      }
    } catch {
      // ignore
    }
  }

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
  // Only crawl the actual app entrypoints (never VocesMDTQwen/.venv or audio folders)
  optimizeDeps: {
    entries: ["index.html", "src/main.ts"],
  },
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
      "/__mobile_stream": {
        target: "http://127.0.0.1:1422",
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
      "/__mobile_snap": {
        target: "http://127.0.0.1:1422",
        changeOrigin: true,
      },
      "/__mobile_state": {
        target: "http://127.0.0.1:1422",
        changeOrigin: true,
      },
      "/__mobile_info": {
        target: "http://127.0.0.1:1422",
        changeOrigin: true,
      },
      "/__mobile_track_map": {
        target: "http://127.0.0.1:1422",
        changeOrigin: true,
      },
      "/__mobile_focus": {
        target: "http://127.0.0.1:1422",
        changeOrigin: true,
      },
      "/__streamer_cmd": {
        target: "http://127.0.0.1:1422",
        changeOrigin: true,
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
      // 3. tell vite to ignore watching heavy non-frontend directories (Rust, Python ROCm venv, audio packs)
      ignored: [
        "**/src-tauri/**",
        "**/VocesMDTQwen/**",
        "**/.venv/**",
        "**/Perfil/**",
        "**/Sound/**",
        "**/public/Perfil/**",
        "**/public/Sound/**",
        "**/lmu-bridge/**",
        "**/dist/**",
      ],
    },
  },
});
