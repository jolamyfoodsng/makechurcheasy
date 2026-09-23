import { useCallback, useEffect, useRef, useState } from "react";

export interface TextUndoRedoOptions {
  maxHistory?: number;
  debounceMs?: number;
}

export interface TextUndoRedoState {
  text: string;
  value: string;
  setText: (nextText: string | ((prev: string) => string), immediateSnapshot?: boolean) => void;
  setValue: (nextText: string | ((prev: string) => string), immediateSnapshot?: boolean) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  reset: (newText: string) => void;
}

export class TextUndoRedoHistory {
  private past: string[] = [];
  private future: string[] = [];
  private current: string;
  private maxHistory: number;

  constructor(initialText = "", maxHistory = 50) {
    this.current = initialText;
    this.maxHistory = maxHistory;
  }

  get text(): string {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  commit(newText: string): void {
    if (newText === this.current) return;
    this.past.push(this.current);
    if (this.past.length > this.maxHistory) {
      this.past.shift();
    }
    this.future = [];
    this.current = newText;
  }

  undo(): string | null {
    if (this.past.length === 0) return null;
    const previous = this.past.pop()!;
    this.future.push(this.current);
    this.current = previous;
    return this.current;
  }

  redo(): string | null {
    if (this.future.length === 0) return null;
    const next = this.future.pop()!;
    this.past.push(this.current);
    this.current = next;
    return this.current;
  }

  reset(newText: string): void {
    this.past = [];
    this.future = [];
    this.current = newText;
  }
}

export function isUndoKeyboardShortcut(event: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): boolean {
  const isModifier = Boolean(event.metaKey || event.ctrlKey);
  if (!isModifier || event.altKey) return false;
  return event.key.toLowerCase() === "z" && !event.shiftKey;
}

export function isRedoKeyboardShortcut(event: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): boolean {
  const isModifier = Boolean(event.metaKey || event.ctrlKey);
  if (!isModifier || event.altKey) return false;
  const key = event.key.toLowerCase();
  return (key === "z" && Boolean(event.shiftKey)) || key === "y";
}

export function useTextUndoRedo(
  initialText = "",
  options: TextUndoRedoOptions = {},
): TextUndoRedoState {
  const { maxHistory = 50, debounceMs = 450 } = options;

  const [text, setTextInternal] = useState(initialText);
  const pastRef = useRef<string[]>([]);
  const futureRef = useRef<string[]>([]);
  const lastCommittedTextRef = useRef(initialText);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [historyVersion, setHistoryVersion] = useState(0);

  const commitSnapshot = useCallback((valueToCommit: string) => {
    if (valueToCommit === lastCommittedTextRef.current) return;
    pastRef.current.push(lastCommittedTextRef.current);
    if (pastRef.current.length > maxHistory) {
      pastRef.current.shift();
    }
    futureRef.current = [];
    lastCommittedTextRef.current = valueToCommit;
    setHistoryVersion((v) => v + 1);
  }, [maxHistory]);

  const setText = useCallback((
    nextText: string | ((prev: string) => string),
    immediateSnapshot = false,
  ) => {
    setTextInternal((prev) => {
      const resolved = typeof nextText === "function" ? nextText(prev) : nextText;
      if (resolved === prev) return prev;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      if (immediateSnapshot) {
        commitSnapshot(prev);
        lastCommittedTextRef.current = resolved;
      } else {
        debounceTimerRef.current = setTimeout(() => {
          commitSnapshot(resolved);
        }, debounceMs);
      }

      return resolved;
    });
  }, [commitSnapshot, debounceMs]);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const previous = pastRef.current.pop()!;
    futureRef.current.push(text);
    lastCommittedTextRef.current = previous;
    setTextInternal(previous);
    setHistoryVersion((v) => v + 1);
  }, [text]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const next = futureRef.current.pop()!;
    pastRef.current.push(text);
    lastCommittedTextRef.current = next;
    setTextInternal(next);
    setHistoryVersion((v) => v + 1);
  }, [text]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (isUndoKeyboardShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      undo();
    } else if (isRedoKeyboardShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      redo();
    }
  }, [redo, undo]);

  const reset = useCallback((newText: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pastRef.current = [];
    futureRef.current = [];
    lastCommittedTextRef.current = newText;
    setTextInternal(newText);
    setHistoryVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Suppress unused warning on historyVersion by referencing it
  void historyVersion;

  return {
    text,
    value: text,
    setText,
    setValue: setText,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    handleKeyDown,
    reset,
  };
}
