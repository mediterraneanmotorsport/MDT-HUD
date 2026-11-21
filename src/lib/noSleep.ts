/**
 * Bulletproof Keep-Screen-Awake helper for Mobile DDU over LAN HTTP.
 *
 * Why this is needed:
 * `navigator.wakeLock` is disabled by browsers on non-HTTPS LAN URLs (http://192.168.x.x:41937).
 * Combining WakeLock (when available) with a tiny 1fps silent inline `<video>` driven by a
 * 16x16 canvas stream keeps both Android Chrome and iOS Safari awake indefinitely over plain HTTP.
 */

class MobileNoSleep {
  private wakeLock: any = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private drawTimer: ReturnType<typeof setInterval> | null = null;
  private active = false;

  get isActive(): boolean {
    return this.active;
  }

  async enable(): Promise<boolean> {
    let ok = false;

    // 1. Native Screen Wake Lock API (works on HTTPS / localhost)
    if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
      try {
        if (!this.wakeLock) {
          this.wakeLock = await (navigator as any).wakeLock.request("screen");
          this.wakeLock?.addEventListener?.("release", () => {
            this.wakeLock = null;
          });
        }
        if (this.wakeLock) ok = true;
      } catch {
        // Expected on plain HTTP LAN URLs
      }
    }

    // 2. Inline silent 1fps video stream fallback (works on Android Chrome & iOS Safari over plain HTTP)
    if (typeof document !== "undefined") {
      try {
        if (!this.video) {
          const canvas = document.createElement("canvas");
          canvas.width = 16;
          canvas.height = 16;
          const ctx = canvas.getContext("2d");
          let toggle = false;
          const draw = () => {
            if (!ctx) return;
            toggle = !toggle;
            ctx.fillStyle = toggle ? "#010101" : "#020202";
            ctx.fillRect(0, 0, 16, 16);
          };
          draw();
          this.canvas = canvas;
          this.drawTimer = setInterval(draw, 1000);

          const video = document.createElement("video");
          video.setAttribute("playsinline", "");
          video.setAttribute("webkit-playsinline", "");
          video.muted = true;
          video.loop = true;
          video.autoplay = true;
          // Must have non-zero rendered size & non-zero opacity so mobile OS keeps screen awake
          Object.assign(video.style, {
            position: "fixed",
            bottom: "0px",
            left: "0px",
            width: "4px",
            height: "4px",
            opacity: "0.01",
            pointerEvents: "none",
            zIndex: "0",
          });

          const stream = (canvas as any).captureStream?.(1);
          if (stream) {
            video.srcObject = stream;
          }
          document.body.appendChild(video);
          this.video = video;
        }

        if (this.video.paused) {
          await this.video.play();
        }
        if (!this.video.paused) {
          ok = true;
        }
      } catch {
        // Will succeed on next user gesture (touch/click)
      }
    }

    this.active = ok;
    return ok;
  }

  disable() {
    this.active = false;
    if (this.wakeLock) {
      try {
        this.wakeLock.release();
      } catch {}
      this.wakeLock = null;
    }
    if (this.drawTimer) {
      clearInterval(this.drawTimer);
      this.drawTimer = null;
    }
    if (this.video) {
      try {
        this.video.pause();
        const stream = this.video.srcObject as MediaStream | null;
        stream?.getTracks().forEach((t) => t.stop());
        this.video.srcObject = null;
        this.video.remove();
      } catch {}
      this.video = null;
    }
    this.canvas = null;
  }
}

export const mobileNoSleep = new MobileNoSleep();
