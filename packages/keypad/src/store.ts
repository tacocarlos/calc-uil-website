type Listener<T> = (detail: T) => void;

/** Minimal typed event emitter. `on` returns an unsubscribe function. */
export class Emitter<Events extends object> {
  #listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(type: K, listener: Listener<Events[K]>): () => void {
    let set = this.#listeners.get(type);
    if (!set) this.#listeners.set(type, (set = new Set()));
    set.add(listener as Listener<never>);
    return () => set.delete(listener as Listener<never>);
  }

  protected emit<K extends keyof Events>(type: K, detail: Events[K]): void {
    for (const listener of this.#listeners.get(type) ?? []) {
      (listener as Listener<Events[K]>)(detail);
    }
  }
}

/**
 * An emitter that also holds an immutable snapshot of its state, compatible
 * with React's useSyncExternalStore (subscribe / getSnapshot are pre-bound).
 */
export class Store<State, Events extends object = object> extends Emitter<Events & { change: State }> {
  #state: State;

  constructor(initial: State) {
    super();
    this.#state = initial;
  }

  getSnapshot = (): State => this.#state;

  subscribe = (onChange: () => void): (() => void) =>
    this.on('change', onChange as Listener<(Events & { change: State })['change']>);

  protected setState(patch: Partial<State>): void {
    this.#state = { ...this.#state, ...patch };
    this.emit('change', this.#state as (Events & { change: State })['change']);
  }
}
