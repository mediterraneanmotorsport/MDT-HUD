import { mount } from "svelte";
import "./app.css";
import Overlay from "./overlay/Overlay.svelte";
import Companion from "./companion/Companion.svelte";
import MobileDdu from "./mobile/MobileDdu.svelte";

// Outside Tauri (plain browser during development) fake the backend.
if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
  await (await import("./dev/mock")).install();
}

// `#overlay` = transparent desktop overlay; `#mobile` = smartphone/tablet DDU; default = companion app.
const isOverlay = location.hash.startsWith("#overlay");
const isMobile = location.hash.startsWith("#mobile");
document.body.classList.add(isOverlay ? "overlay" : "companion");
window.addEventListener("hashchange", () => location.reload());

const RootComponent = isOverlay ? Overlay : isMobile ? MobileDdu : Companion;

const app = mount(RootComponent, {
  target: document.getElementById("app")!,
});

export default app;
