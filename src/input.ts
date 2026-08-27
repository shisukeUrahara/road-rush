// Keyboard + touch. Gameplay reads the held state; menus read the edge-triggered
// queue so a single tap moves the cursor exactly one step.

export type MenuKey = "up" | "down" | "left" | "right" | "confirm" | "back";

export interface HeldState {
  left: boolean;
  right: boolean;
  slow: boolean;
  fast: boolean;
}

export class Input {
  private keys = new Set<string>();
  private menuQueue: MenuKey[] = [];
  private touchLeft = false;
  private touchRight = false;
  private touchFast = false;
  private touchSlow = false;
  /** Set on any tap/keypress so menus can advance without a named key. */
  anyPress = false;
  /** Typed characters for the name-entry screen. */
  typedBuffer = "";
  typedBackspace = 0;
  touchActive = false;

  constructor(target: HTMLElement) {
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
    this.bindTouch(target);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.repeat) {
      // Held arrows still steer, but menus must not scroll on auto-repeat...
      if (e.key === "Backspace") this.typedBackspace++;
      return;
    }
    this.keys.add(e.code);
    this.anyPress = true;

    switch (e.code) {
      case "ArrowUp":
      case "KeyW":
        this.menuQueue.push("up");
        break;
      case "ArrowDown":
      case "KeyS":
        this.menuQueue.push("down");
        break;
      case "ArrowLeft":
      case "KeyA":
        this.menuQueue.push("left");
        break;
      case "ArrowRight":
      case "KeyD":
        this.menuQueue.push("right");
        break;
      case "Enter":
      case "Space":
      case "NumpadEnter":
        this.menuQueue.push("confirm");
        break;
      case "Escape":
        this.menuQueue.push("back");
        break;
    }

    if (e.key === "Backspace") this.typedBackspace++;
    else if (e.key.length === 1) this.typedBuffer += e.key;

    // Stop the page from scrolling / the space bar from clicking things.
    if (
      e.code.startsWith("Arrow") ||
      e.code === "Space" ||
      e.code === "Backspace" ||
      e.code === "Tab"
    ) {
      e.preventDefault();
    }
  }

  private bindTouch(target: HTMLElement): void {
    const update = (touches: TouchList): void => {
      this.touchLeft = false;
      this.touchRight = false;
      this.touchSlow = false;
      const rect = target.getBoundingClientRect();
      for (let i = 0; i < touches.length; i++) {
        const t = touches[i];
        const x = (t.clientX - rect.left) / rect.width;
        const y = (t.clientY - rect.top) / rect.height;
        // Bottom-right corner is the "low gear" pad; the rest steers.
        if (y > 0.82 && x > 0.78) this.touchSlow = true;
        else if (x < 0.5) this.touchLeft = true;
        else this.touchRight = true;
      }
      // On touch we always drive; the pad drops to the slow gear.
      this.touchFast = !this.touchSlow;
    };

    target.addEventListener(
      "touchstart",
      (e) => {
        this.touchActive = true;
        this.anyPress = true;
        this.menuQueue.push("confirm");
        update(e.touches);
        e.preventDefault();
      },
      { passive: false },
    );
    target.addEventListener(
      "touchmove",
      (e) => {
        update(e.touches);
        e.preventDefault();
      },
      { passive: false },
    );
    const end = (e: TouchEvent): void => {
      update(e.touches);
      if (e.touches.length === 0) {
        this.touchLeft = this.touchRight = this.touchFast = this.touchSlow = false;
      }
      e.preventDefault();
    };
    target.addEventListener("touchend", end, { passive: false });
    target.addEventListener("touchcancel", end, { passive: false });
    target.addEventListener("mousedown", () => {
      this.anyPress = true;
      this.menuQueue.push("confirm");
    });
  }

  held(): HeldState {
    return {
      left: this.keys.has("ArrowLeft") || this.keys.has("KeyA") || this.touchLeft,
      right: this.keys.has("ArrowRight") || this.keys.has("KeyD") || this.touchRight,
      slow: this.keys.has("KeyZ") || this.keys.has("ArrowDown") || this.touchSlow,
      fast:
        this.keys.has("KeyX") ||
        this.keys.has("ArrowUp") ||
        this.keys.has("Space") ||
        this.touchFast,
    };
  }

  /** Drain menu presses queued since the last call. */
  drainMenu(): MenuKey[] {
    const out = this.menuQueue;
    this.menuQueue = [];
    return out;
  }

  drainTyped(): { text: string; backspaces: number } {
    const out = { text: this.typedBuffer, backspaces: this.typedBackspace };
    this.typedBuffer = "";
    this.typedBackspace = 0;
    return out;
  }

  consumeAnyPress(): boolean {
    const v = this.anyPress;
    this.anyPress = false;
    return v;
  }
}
