import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import Icon from "../components/Icon";

export interface SongImportFrameStep {
  id: string;
  label: string;
}

interface SongImportFrameProps {
  step: string;
  steps?: SongImportFrameStep[];
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  canClose?: boolean;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  ariaLabel?: string;
  error?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function SongImportFrame({
  step,
  steps = [],
  eyebrow,
  title,
  subtitle,
  onClose,
  canClose = true,
  onKeyDown,
  ariaLabel,
  error,
  footer,
  children,
}: SongImportFrameProps) {
  const activeStepIndex = steps.findIndex((entry) => entry.id === step);

  return (
    <div
      className="bulk-import-backdrop"
      onMouseDown={() => {
        if (canClose) {
          onClose();
        }
      }}
    >
      <div
        className="bulk-import-modal"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="bulk-import-header">
          <div>
            {eyebrow ? <p className="bulk-import-eyebrow">{eyebrow}</p> : null}
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="bulk-import-close"
            onClick={onClose}
            aria-label="Close import"
            title="Close"
            disabled={!canClose}
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {steps.length > 0 ? (
          <div className="bulk-import-steps" aria-label="Import steps">
            {steps.map((entry, index) => {
              const isActive = index === activeStepIndex;
              const isDone = activeStepIndex > -1 && index < activeStepIndex;
              return (
                <div key={entry.id} className="bulk-import-step-wrap">
                  <div className={`bulk-import-step${isActive ? " active" : ""}${isDone ? " done" : ""}`}>
                    <span className="bulk-import-step-num">{String(index + 1).padStart(2, "0")}</span>
                    <span>{entry.label}</span>
                  </div>
                  {index < steps.length - 1 ? <span className="bulk-import-step-divider" aria-hidden="true" /> : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {error}
        {children}
        {footer}
      </div>
    </div>
  );
}
