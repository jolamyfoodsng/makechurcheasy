import { ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import languageData from '../../full_langugae_list.json';
import './LanguagePicker.css';

export interface LanguageEntry {
  code: string;
  name: string;
  nativeName: string;
  region: string;
  popular: boolean;
}

const languages: LanguageEntry[] = languageData as LanguageEntry[];

const REGION_ORDER = [
  'Africa',
  'Asia',
  'Europe',
  'Middle East',
  'North America',
  'South America',
  'Oceania',
  'Global',
];

interface LanguagePickerProps {
  value: string;
  onChange: (code: string) => void;
}

export default function LanguagePicker({ value, onChange }: LanguagePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => languages.find(l => l.code === value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return languages;
    return languages.filter(
      l =>
        l.name.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q),
    );
  }, [query]);

  const popular = useMemo(() => filtered.filter(l => l.popular), [filtered]);

  const grouped = useMemo(() => {
    const rest = filtered.filter(l => !l.popular);
    const map = new Map<string, LanguageEntry[]>();
    for (const l of rest) {
      const arr = map.get(l.region) || [];
      arr.push(l);
      map.set(l.region, arr);
    }
    // Preserve region order
    const ordered: [string, LanguageEntry[]][] = [];
    for (const r of REGION_ORDER) {
      if (map.has(r)) ordered.push([r, map.get(r)!]);
    }
    // Any remaining regions not in REGION_ORDER
    for (const [r, arr] of map) {
      if (!REGION_ORDER.includes(r)) ordered.push([r, arr]);
    }
    return ordered;
  }, [filtered]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  function handleSelect(code: string) {
    onChange(code);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div className="lp-root">
      <button className="lp-trigger" onClick={() => setOpen(true)} type="button" title="Select">
        <span className="lp-trigger-content">
          {selected ? (
            <>
              <span className="lp-trigger-name">{selected.name}</span>
              {selected.nativeName && selected.nativeName !== selected.name && (
                <span className="lp-trigger-native">{selected.nativeName}</span>
              )}
            </>
          ) : (
            <span className="lp-trigger-placeholder">Select a language…</span>
          )}
        </span>
        <ChevronDown size={16} />
      </button>

      {open && (
        <div className="lp-overlay" onClick={() => setOpen(false)}>
          <div className="lp-dropdown" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
            <div className="lp-search-bar">
              <Search size={16} className="lp-search-icon" />
              <input
                ref={inputRef}
                className="lp-search-input"
                placeholder="Search by name, native name, or code…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              {query && (
                <button className="lp-search-clear" onClick={() => setQuery('')} type="button" title="Clear search">
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="lp-list" ref={listRef}>
              {/* Popular section */}
              {popular.length > 0 && (
                <div className="lp-section">
                  <div className="lp-section-title">Popular Languages</div>
                  {popular.map(l => (
                    <button
                      key={l.code}
                      className={`lp-item ${l.code === value ? 'selected' : ''}`}
                      onClick={() => handleSelect(l.code)}
                      type="button"
                    >
                      <span className="lp-item-main">
                        <span className="lp-item-name">{l.name}</span>
                        {l.nativeName && l.nativeName !== l.name && (
                          <span className="lp-item-native">{l.nativeName}</span>
                        )}
                      </span>
                      <span className="lp-item-region">{l.region}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Region groups */}
              {grouped.map(([region, items]) => (
                <div className="lp-section" key={region}>
                  <div className="lp-section-title">{region}</div>
                  {items.map(l => (
                    <button
                      key={l.code}
                      className={`lp-item ${l.code === value ? 'selected' : ''}`}
                      onClick={() => handleSelect(l.code)}
                      type="button"
                    >
                      <span className="lp-item-main">
                        <span className="lp-item-name">{l.name}</span>
                        {l.nativeName && l.nativeName !== l.name && (
                          <span className="lp-item-native">{l.nativeName}</span>
                        )}
                      </span>
                      <span className="lp-item-code">{l.code}</span>
                    </button>
                  ))}
                </div>
              ))}

              {filtered.length === 0 && (
                <div className="lp-empty">No languages match "{query}"</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
