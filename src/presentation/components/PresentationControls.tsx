import { ArrowLeft, ArrowRight, Radio, Trash2 } from "lucide-react";

interface PresentationControlsProps {
  canPresent: boolean;
  canClear: boolean;
  liveLabel: string;
  remoteStatusLabel: string;
  onPrevious: () => void;
  onPresent: () => void;
  onClear: () => void;
  onNext: () => void;
}

export function PresentationControls({
  canPresent,
  canClear,
  liveLabel,
  remoteStatusLabel,
  onPrevious,
  onPresent,
  onClear,
  onNext,
}: PresentationControlsProps) {
  return (
    <footer className="presentation-controls">
      <div className="presentation-controls__actions">
        <button type="button" className="presentation-button" onClick={onPrevious}>
          <ArrowLeft size={16} />
          <span>Previous</span>
        </button>
        <button type="button" className="presentation-button primary" onClick={onPresent} disabled={!canPresent}>
          <Radio size={16} />
          <span>Present</span>
        </button>
        <button type="button" className="presentation-button danger" onClick={onClear} disabled={!canClear}>
          <Trash2 size={16} />
          <span>Clear</span>
        </button>
        <button type="button" className="presentation-button" onClick={onNext}>
          <span>Next</span>
          <ArrowRight size={16} />
        </button>
      </div>

      <div className="presentation-controls__status">
        <span className="presentation-live-pill">{liveLabel}</span>
        <span className="presentation-remote-pill">{remoteStatusLabel}</span>
      </div>
    </footer>
  );
}
