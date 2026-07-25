"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Countdown } from "./types";

export interface TimerState {
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  progress: number; // 0-100
  isComplete: boolean;
  formatted: string;
}

function computeRemaining(cd: Countdown): number {
  if (!cd.isRunning || !cd.startedAt) return cd.remainingSeconds;
  const elapsed = Math.floor((Date.now() - new Date(cd.startedAt).getTime()) / 1000);
  const total = cd.timerMode === "fixed" ? cd.fixedDuration : cd.remainingSeconds;
  return Math.max(0, total - elapsed);
}

function computeTotalDuration(cd: Countdown): number {
  if (cd.timerMode === "fixed") return cd.fixedDuration;
  // For endAt mode, compute duration from now to target time
  if (!cd.startedAt) return cd.remainingSeconds;
  const started = new Date(cd.startedAt);
  const [h, m] = cd.endAtTime.split(":").map(Number);
  const target = new Date(started);
  target.setHours(h, m, 0, 0);
  if (target <= started) target.setDate(target.getDate() + 1);
  return Math.floor((target.getTime() - started.getTime()) / 1000);
}

export function useCountdownTimer(cd: Countdown): TimerState {
  const [remaining, setRemaining] = useState(() => computeRemaining(cd));
  const totalRef = useRef(computeTotalDuration(cd));
  const frameRef = useRef<number>(0);

  useEffect(() => {
    totalRef.current = computeTotalDuration(cd);
  }, [cd.timerMode, cd.fixedDuration, cd.endAtTime, cd.startedAt]);

  useEffect(() => {
    if (!cd.isRunning) {
      setRemaining(cd.remainingSeconds);
      return;
    }

    const tick = () => {
      const r = computeRemaining(cd);
      setRemaining(r);
      if (r > 0) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [cd.isRunning, cd.startedAt, cd.remainingSeconds, cd.timerMode, cd.fixedDuration, cd.endAtTime]);

  const totalSec = Math.floor(remaining);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  const total = totalRef.current || 1;
  const progress = ((total - remaining) / total) * 100;

  let formatted: string;
  if (cd.showHours) {
    formatted = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  } else if (cd.showMinutes && cd.showSeconds) {
    formatted = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  } else if (cd.showMinutes) {
    formatted = `${String(m).padStart(2, "0")}:00`;
  } else {
    formatted = `00:${String(s).padStart(2, "0")}`;
  }

  return {
    hours: h,
    minutes: m,
    seconds: s,
    totalSeconds: remaining,
    progress: Math.min(100, progress),
    isComplete: remaining <= 0,
    formatted,
  };
}
