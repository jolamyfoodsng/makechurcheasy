import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import { countries } from "../services/countries";

interface CountryPickerProps {
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
}

export default function CountryPicker({ value, onChange, placeholder = "Select country..." }: CountryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => countries.find((c) => c.code === value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  function handleSelect(code: string) {
    onChange(code);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <>
      <button
        className="cp-trigger"
        onClick={() => setOpen(true)}
        type="button"
        title="Select country"
      >
        <span className="cp-trigger-content">
          {selected ? (
            <span className="cp-trigger-name">{selected.name}</span>
          ) : (
            <span className="cp-trigger-placeholder">{placeholder}</span>
          )}
        </span>
        <ChevronDown size={16} />
      </button>

      {open && (
        <div className="cp-overlay" onClick={() => setOpen(false)}>
          <div
            className="cp-dropdown"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            <div className="cp-search-bar">
              <Search size={16} className="cp-search-icon" />
              <input
                ref={inputRef}
                className="cp-search-input"
                placeholder="Search countries..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  className="cp-search-clear"
                  onClick={() => setQuery("")}
                  type="button"
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="cp-list" ref={listRef}>
              {filtered.map((c) => (
                <button
                  key={c.code}
                  className={`cp-item ${c.code === value ? "selected" : ""}`}
                  onClick={() => handleSelect(c.code)}
                  type="button"
                  title={`Select ${c.name}`}
                >
                  <span className="cp-item-name">{c.name}</span>
                  <span className="cp-item-code">{c.code}</span>
                </button>
              ))}

              {filtered.length === 0 && (
                <div className="cp-empty">No countries found</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
