import { mount } from "svelte";
import "./app.css";
import Overlay from "./overlay/Overlay.svelte";
import Companion from "./companion/Companion.svelte";
import MobileDdu from "./mobile/MobileDdu.svelte";
import PitWall from "./mobile/PitWall.svelte";
import StreamerDeck from "./mobile/StreamerDeck.svelte";

// Outside Tauri (plain browser on PC or Smartphone/Tablet) fake the Tauri IPC backend.
if (!("__TAURI_INTERNALS__" in window)) {
  await (await import("./dev/mock")).install();
}

// `#overlay` / `#broadcast` = transparent desktop overlay for OBS / monitors; `#mobile` / `/mobile` / `/dash` = Mobile DDU; `#pitwall` = Pit Wall.
const hash = location.hash.toLowerCase();
const path = location.pathname.toLowerCase();
const isPhoneBrowser = /android|iphone|ipod/i.test(navigator.userAgent);

const isOverlay =
  hash.startsWith("#overlay") ||
  hash.startsWith("#broadcast") ||
  path === "/overlay" ||
  path === "/broadcast";
const isPitWall = hash.startsWith("#pitwall") || path === "/pitwall";
const isStreamer =
  hash.startsWith("#streamer") ||
  hash.startsWith("#deck") ||
  path === "/streamer" ||
  new URLSearchParams(location.search).has("streamer");
const isMobile =
  hash.startsWith("#mobile") ||
  hash.startsWith("#dash") ||
  hash.startsWith("#ddu") ||
  path === "/mobile" ||
  path === "/dash" ||
  path === "/ddu" ||
  new URLSearchParams(location.search).has("mobile") ||
  (isPhoneBrowser && !isOverlay && !isPitWall && !isStreamer && !hash.startsWith("#pc") && !hash.startsWith("#companion"));

document.body.classList.add(isOverlay ? "overlay" : "companion");
window.addEventListener("hashchange", () => location.reload());

const RootComponent = isOverlay ? Overlay : isStreamer ? StreamerDeck : isMobile ? MobileDdu : isPitWall ? PitWall : Companion;

const app = mount(RootComponent, {
  target: document.getElementById("app")!,
});

export default app;
