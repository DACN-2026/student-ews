import { useState, useCallback } from 'react';
import { apiFetch } from "@/lib/api-client";

// Stub for the warnings API call
export function useWarnings() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fetchWarnings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/v1/academic-warnings');
      if (!res.ok) return [];
      const data = await res.json();
      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch warnings';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { fetchWarnings, loading, error };
}
