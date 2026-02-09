"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { MarketPrice } from "@/components/battle/mock-data";
import { MOCK_PRICES } from "@/components/battle/mock-data";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
const POLL_INTERVAL_MS = 30_000; // 30s to match backend cache TTL

export interface UseMarketPricesResult {
  prices: MarketPrice[];
  loading: boolean;
  error: string | null;
  /** ISO timestamp of last successful fetch */
  updatedAt: string | null;
  /** Map of asset → "up" | "down" | null, set briefly on price change */
  flashDirection: Record<string, "up" | "down" | null>;
}

/**
 * Hook that fetches live market prices from the /prices endpoint.
 * Polls every 30s. Falls back to mock data in development if API is unreachable.
 * Tracks price changes to trigger flash animations.
 */
export function useMarketPrices(): UseMarketPricesResult {
  const [prices, setPrices] = useState<MarketPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [flashDirection, setFlashDirection] = useState<
    Record<string, "up" | "down" | null>
  >({});

  const prevPricesRef = useRef<Map<string, number>>(new Map());
  const mountedRef = useRef(true);

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/prices`);

      if (!mountedRef.current) return;

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        prices: MarketPrice[];
        updatedAt: string;
      };

      if (!mountedRef.current) return;

      // Detect price direction changes for flash animations
      const newFlash: Record<string, "up" | "down" | null> = {};
      for (const p of data.prices) {
        const prev = prevPricesRef.current.get(p.asset);
        if (prev !== undefined && prev !== p.price) {
          newFlash[p.asset] = p.price > prev ? "up" : "down";
        }
      }

      // Update previous prices ref
      const newPrevMap = new Map<string, number>();
      for (const p of data.prices) {
        newPrevMap.set(p.asset, p.price);
      }
      prevPricesRef.current = newPrevMap;

      setPrices(data.prices);
      setUpdatedAt(data.updatedAt);
      setError(null);

      // Trigger flash animations
      if (Object.keys(newFlash).length > 0) {
        setFlashDirection(newFlash);
        // Clear flashes after animation duration (800ms)
        setTimeout(() => {
          if (mountedRef.current) {
            setFlashDirection({});
          }
        }, 800);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      // In dev mode, fall back to mock data if API is unreachable
      if (prices.length === 0 && process.env.NODE_ENV === "development") {
        setPrices(MOCK_PRICES);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [prices.length]);

  useEffect(() => {
    mountedRef.current = true;
    fetchPrices();

    const interval = setInterval(fetchPrices, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchPrices]);

  return { prices, loading, error, updatedAt, flashDirection };
}

export default useMarketPrices;
