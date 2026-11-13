import { mount } from "svelte";
import "./app.css";
import Overlay from "./overlay/Overlay.svelte";
import Companion from "./companion/Companion.svelte";
import MobileDdu from "./mobile/MobileDdu.svelte";
import PitWall from "./mobile/PitWall.svelte";

// Outside Tauri (plain browser during development) fake the backend.
if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
  await (await import("./dev/mock")).install();
}

// `#overlay` = transparent desktop overlay; `#mobile` = smartphone DDU; `#pitwall` = 4-col tablet/monitor Pit Wall.
const isOverlay = location.hash.startsWith("#overlay");
const isMobile = location.hash.startsWith("#mobile");
const isPitWall = location.hash.startsWith("#pitwall");
document.body.classList.add(isOverlay ? "overlay" : "companion");
window.addEventListener("hashchange", () => location.reload());

const RootComponent = isOverlay ? Overlay : isMobile ? MobileDdu : isPitWall ? PitWall : Companion;

const app = mount(RootComponent, {
  target: document.getElementById("app")!,
});

export default app;
