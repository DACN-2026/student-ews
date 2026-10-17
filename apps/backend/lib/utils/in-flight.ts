/** Share only ongoing work. Settled values and failures are never retained. */
export class InFlightRequests<T> {
  private pending = new Map<string, Promise<T>>();

  run(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing;
    const request = Promise.resolve().then(load);
    this.pending.set(key, request);
    const release = () => { if (this.pending.get(key) === request) this.pending.delete(key); };
    void request.then(release, release);
    return request;
  }
}
