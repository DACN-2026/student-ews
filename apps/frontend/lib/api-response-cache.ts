type StoredResponse = { body: string; status: number; statusText: string; headers: [string, string][]; expiresAt: number };
type PendingRequest = { controller: AbortController; promise: Promise<StoredResponse>; consumers: number };
const MAX_ENTRIES = 80;
const MAX_BODY_SIZE = 500_000;
export const API_CACHE_TTL = 60_000;

/** Memory only; never persists student data across browser sessions. */
export class ApiResponseCache {
  private entries = new Map<string, StoredResponse>();
  private pending = new Map<string, PendingRequest>();
  private tasks = new Map<string, { promise: Promise<unknown>; expiresAt: number }>();
  private generation = 0;
  private sessionGeneration = 0;
  private scope = "";

  setScope(scope: string) {
    if (this.scope === scope) return;
    this.scope = scope;
    this.clear();
    this.sessionGeneration += 1;
    this.tasks.clear();
  }
  clear() {
    this.generation += 1;
    this.entries.clear();
    this.pending.clear();
  }
  clearTasks() { this.tasks.clear(); }
  private read(key: string) {
    const entry = this.entries.get(key);
    if (!this.scope || !entry) return undefined;
    if (entry.expiresAt <= Date.now()) return undefined;
    return entry;
  }
  has(key: string) { return Boolean(this.read(key)); }
  peek<T>(key: string, allowStale = false): T | null {
    const entry = allowStale && this.scope ? this.entries.get(key) : this.read(key);
    if (!entry) return null;
    try { return JSON.parse(entry.body) as T; } catch { return null; }
  }
  hasTask(key: string) {
    const task = this.tasks.get(key);
    return Boolean(this.scope && task && task.expiresAt !== Infinity && task.expiresAt > Date.now());
  }
  runTask<T>(key: string, task: () => Promise<T>, ttl = 5 * 60_000): Promise<T> {
    const existing = this.tasks.get(key);
    if (this.scope && existing && existing.expiresAt > Date.now()) return existing.promise as Promise<T>;
    const session = this.sessionGeneration;
    const entry = { promise: Promise.resolve().then(task) as Promise<unknown>, expiresAt: Infinity };
    if (this.scope) this.tasks.set(key, entry);
    void entry.promise.then(() => {
      if (session === this.sessionGeneration) entry.expiresAt = Date.now() + ttl;
    }, () => { if (this.tasks.get(key) === entry) this.tasks.delete(key); });
    return entry.promise as Promise<T>;
  }
  async request(key: string, load: (signal: AbortSignal) => Promise<Response>, signal?: AbortSignal | null): Promise<Response> {
    signal?.throwIfAborted();
    const cached = this.read(key);
    if (cached) return this.response(cached);
    let request = this.pending.get(key);
    if (!request || request.controller.signal.aborted) {
      const controller = new AbortController();
      const generation = this.generation;
      const scope = this.scope;
      const promise = Promise.resolve().then(() => load(controller.signal)).then(async (response) => {
        const entry: StoredResponse = { body: await response.text(), status: response.status, statusText: response.statusText, headers: [...response.headers.entries()], expiresAt: Date.now() + API_CACHE_TTL };
        if (scope && scope === this.scope && generation === this.generation && !controller.signal.aborted && response.ok && response.headers.get("content-type")?.includes("application/json") && !response.headers.get("cache-control")?.includes("no-store") && entry.body.length <= MAX_BODY_SIZE) {
          if (!this.entries.has(key) && this.entries.size >= MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value!);
          this.entries.set(key, entry);
        }
        return entry;
      });
      request = { controller, promise, consumers: 0 };
      this.pending.set(key, request);
      const current = request;
      void promise.then(() => { if (this.pending.get(key) === current) this.pending.delete(key); }, () => { if (this.pending.get(key) === current) this.pending.delete(key); });
    }
    const current = request;
    current.consumers += 1;
    return new Promise<Response>((resolve, reject) => {
      let finished = false;
      const release = () => { finished = true; signal?.removeEventListener("abort", abort); current.consumers -= 1; };
      const abort = () => { if (finished) return; release(); if (current.consumers === 0) current.controller.abort(); reject(signal?.reason ?? new DOMException("Aborted", "AbortError")); };
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      void current.promise.then((entry) => { if (!finished) { release(); resolve(this.response(entry)); } }, (error) => { if (!finished) { release(); reject(error); } });
    });
  }
  private response(entry: StoredResponse) {
    return new Response([204, 205, 304].includes(entry.status) ? null : entry.body, { status: entry.status, statusText: entry.statusText, headers: entry.headers });
  }
}

export const apiResponseCache = new ApiResponseCache();
