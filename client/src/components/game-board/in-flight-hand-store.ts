/**
 * Tracks which hand-card ids are currently mid-flight (animating from
 * backpack/equipment/etc. into hand). Implemented as an external store with
 * the `useSyncExternalStore` contract so consumers (HandDisplay) read it in
 * the same render pass as the engine snapshot — guaranteeing the freshly
 * drawn card is rendered as `opacity: 0` from its very first paint, rather
 * than briefly flashing visible while a separate `useState` update is queued.
 *
 * Producers (GameBoard) call `add` synchronously *inside* the side-effect
 * listener that creates the flight, so by the time the engine's `_notify()`
 * fires (causing React to re-render with the new `handCards`), this store
 * already contains the matching id.
 */
type Listener = () => void;

class InFlightHandStore {
  private ids = new Set<string>();
  private listeners = new Set<Listener>();
  // Frozen snapshot reference — only swapped when contents change so that
  // `useSyncExternalStore` sees a stable reference and doesn't re-render
  // unnecessarily on unrelated subscribe churn.
  private snapshot: ReadonlySet<string> = new Set();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ReadonlySet<string> => this.snapshot;

  add(id: string): void {
    if (this.ids.has(id)) return;
    this.ids.add(id);
    this.snapshot = new Set(this.ids);
    this.listeners.forEach(l => l());
  }

  remove(id: string): void {
    if (!this.ids.has(id)) return;
    this.ids.delete(id);
    this.snapshot = new Set(this.ids);
    this.listeners.forEach(l => l());
  }

  clear(): void {
    if (this.ids.size === 0) return;
    this.ids.clear();
    this.snapshot = new Set();
    this.listeners.forEach(l => l());
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }
}

export const inFlightHandStore = new InFlightHandStore();
