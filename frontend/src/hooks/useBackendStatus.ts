import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

export type BackendConnectionState = 'connected' | 'disconnected' | 'connecting';

export interface BackendStatus {
  status: BackendConnectionState;
  pingMs: number;
  lastChecked: Date | null;
  error: string | null;
  recheck: () => Promise<void>;
}

export function useBackendStatus(pollIntervalMs = 3000): BackendStatus {
  const [status, setStatus] = useState<BackendConnectionState>('connecting');
  const [pingMs, setPingMs] = useState<number>(0);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isCheckingRef = useRef(false);

  const checkHealth = useCallback(async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    const start = performance.now();

    try {
      const data = await api.getHealth();
      const elapsed = Math.round(performance.now() - start);
      if (data && data.ok) {
        setStatus('connected');
        setPingMs(elapsed);
        setError(null);
      } else {
        setStatus('disconnected');
        setError('Health response invalid');
      }
    } catch (err: unknown) {
      setStatus('disconnected');
      setError(err instanceof Error ? err.message : 'Connection failed');
      setPingMs(0);
    } finally {
      setLastChecked(new Date());
      isCheckingRef.current = false;
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, pollIntervalMs);
    return () => clearInterval(interval);
  }, [checkHealth, pollIntervalMs]);

  return {
    status,
    pingMs,
    lastChecked,
    error,
    recheck: checkHealth,
  };
}

