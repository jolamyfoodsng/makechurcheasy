"use client";

import { useState, useCallback, useEffect } from "react";
import type { Countdown } from "./types";
import { DEFAULT_COUNTDOWN } from "./types";

const STORAGE_KEY = "mce_countdowns";

function generateId(): string {
  return `cd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function loadCountdowns(): Countdown[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Countdown[];
  } catch {
    return [];
  }
}

function saveCountdowns(countdowns: Countdown[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(countdowns));
}

export function useCountdownStore() {
  const [countdowns, setCountdowns] = useState<Countdown[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setCountdowns(loadCountdowns());
    setLoaded(true);
  }, []);

  const persist = useCallback((next: Countdown[]) => {
    setCountdowns(next);
    saveCountdowns(next);
  }, []);

  const createCountdown = useCallback(
    (overrides?: Partial<Countdown>): Countdown => {
      const now = new Date().toISOString();
      const cd: Countdown = {
        ...DEFAULT_COUNTDOWN,
        ...overrides,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
      };
      persist([cd, ...countdowns]);
      return cd;
    },
    [countdowns, persist],
  );

  const updateCountdown = useCallback(
    (id: string, updates: Partial<Countdown>) => {
      const next = countdowns.map((cd) =>
        cd.id === id ? { ...cd, ...updates, updatedAt: new Date().toISOString() } : cd,
      );
      persist(next);
    },
    [countdowns, persist],
  );

  const deleteCountdown = useCallback(
    (id: string) => {
      persist(countdowns.filter((cd) => cd.id !== id));
    },
    [countdowns, persist],
  );

  const duplicateCountdown = useCallback(
    (id: string): Countdown | null => {
      const original = countdowns.find((cd) => cd.id === id);
      if (!original) return null;
      const now = new Date().toISOString();
      const copy: Countdown = {
        ...structuredClone(original),
        id: generateId(),
        title: `${original.title} (Copy)`,
        createdAt: now,
        updatedAt: now,
        isRunning: false,
        startedAt: null,
      };
      persist([copy, ...countdowns]);
      return copy;
    },
    [countdowns, persist],
  );

  const exportCountdown = useCallback(
    (id: string): string | null => {
      const cd = countdowns.find((c) => c.id === id);
      if (!cd) return null;
      return JSON.stringify(cd, null, 2);
    },
    [countdowns],
  );

  const importCountdown = useCallback(
    (json: string): Countdown | null => {
      try {
        const data = JSON.parse(json) as Countdown;
        const now = new Date().toISOString();
        const cd: Countdown = {
          ...data,
          id: generateId(),
          createdAt: now,
          updatedAt: now,
          isRunning: false,
          startedAt: null,
        };
        persist([cd, ...countdowns]);
        return cd;
      } catch {
        return null;
      }
    },
    [countdowns, persist],
  );

  return {
    countdowns,
    loaded,
    createCountdown,
    updateCountdown,
    deleteCountdown,
    duplicateCountdown,
    exportCountdown,
    importCountdown,
  };
}
