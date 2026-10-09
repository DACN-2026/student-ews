let pending = 0;
const listeners = new Set<() => void>();
export const subscribeNetworkActivity = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getNetworkActivity = () => pending;
export const getServerNetworkActivity = () => 0;
export async function trackNetworkRequest<T>(request: () => Promise<T>): Promise<T> {
  pending += 1;
  listeners.forEach((listener) => listener());
  try { return await request(); }
  finally { pending -= 1; listeners.forEach((listener) => listener()); }
}
