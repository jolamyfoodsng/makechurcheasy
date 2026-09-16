import { Check, ChevronDown, ChevronRight, Mic, RefreshCw } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";

export interface MacSelectOption {
  value: string;
  label: string;
}

interface MacSelectProps {
  options: MacSelectOption[];
  value: string;
  onChange: (value: string) => void;
  onReload: () => void;
  ariaLabel: string;
  quickStartLabel: string;
  allDevicesLabel: string;
  reloadLabel: string;
  loadingLabel: string;
  placeholder: string;
  emptyLabel: string;
  disabled?: boolean;
  loading?: boolean;
}

interface PopoverPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

/** A compact macOS-inspired device picker with a built-in rescan action. */
export default function MacSelect({
  options,
  value,
  onChange,
  onReload,
  ariaLabel,
  quickStartLabel,
  allDevicesLabel,
  reloadLabel,
  loadingLabel,
  placeholder,
  emptyLabel,
  disabled = false,
  loading = false,
}: MacSelectProps) {
  const [open, setOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.value === value);

  const updatePopoverPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const bounds = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const width = Math.min(Math.max(bounds.width, 248), window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      Math.max(viewportPadding, bounds.left),
      window.innerWidth - width - viewportPadding,
    );
    const spaceBelow = Math.max(0, window.innerHeight - bounds.bottom - viewportPadding);
    const spaceAbove = Math.max(0, bounds.top - viewportPadding * 2);
    const openAbove = spaceBelow < 250 && spaceAbove > spaceBelow;
    const availableHeight = openAbove ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(140, Math.min(420, availableHeight));

    setPopoverPosition({
      top: openAbove ? Math.max(viewportPadding, bounds.top - maxHeight - 5) : bounds.bottom + 5,
      left,
      width,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        rootRef.current && !rootRef.current.contains(target)
        && !popoverRef.current?.contains(target)
      ) {
        setOpen(false);
        setPopoverPosition(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setPopoverPosition(null);
        triggerRef.current?.focus();
      }
    };

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, updatePopoverPosition]);

  const choose = (option: MacSelectOption) => {
    onChange(option.value);
    setOpen(false);
    setPopoverPosition(null);
  };

  const togglePopover = () => {
    if (open) {
      setOpen(false);
      setPopoverPosition(null);
      return;
    }
    updatePopoverPosition();
    setOpen(true);
  };

  return (
    <div className="mac-select sts3-mic-select" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="mac-select__trigger"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        title={selected?.label ?? placeholder}
        onClick={togglePopover}
      >
        <span className="mac-select__trigger-value">
          <Mic size={14} aria-hidden="true" />
          <span>{selected?.label ?? placeholder}</span>
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>

      {open && popoverPosition && createPortal(
        <div
          ref={popoverRef}
          className="mac-select__popover"
          role="dialog"
          aria-label={ariaLabel}
          style={popoverPosition}
        >
          {selected && (
            <div className="mac-select__quick-start">
              <div className="mac-select__section-label">{quickStartLabel}</div>
              <button
                type="button"
                className="mac-select__quick-option"
                aria-pressed="true"
                aria-label={`${quickStartLabel}: ${selected.label}`}
                onClick={() => choose(selected)}
              >
                <span>{selected.label}</span>
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          )}

          <div className="mac-select__section-label mac-select__devices-label">
            {allDevicesLabel}
          </div>
          {options.length > 0 ? (
            <div className="mac-select__options" role="listbox" aria-label={allDevicesLabel}>
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`mac-select__option${isSelected ? " is-selected" : ""}`}
                    role="option"
                    aria-selected={isSelected}
                    title={option.label}
                    onClick={() => choose(option)}
                  >
                    <span>{option.label}</span>
                    {isSelected && <Check size={14} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mac-select__empty" role="status">
              {loading ? loadingLabel : emptyLabel}
            </div>
          )}

          <div className="mac-select__footer">
            <button
              type="button"
              className="mac-select__reload"
              disabled={loading}
              onClick={onReload}
            >
              <RefreshCw size={14} className={loading ? "is-spinning" : undefined} aria-hidden="true" />
              <span>{reloadLabel}</span>
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
