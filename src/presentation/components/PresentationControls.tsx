import { Radio, Trash2 } from "lucide-react";

interface PresentationControlsProps {
  canPresent: boolean;
  canClear: boolean;
  onPresent: () => void;
  onClear: () => void;
}

export function PresentationControls({
  canPresent,
  canClear,
  onPresent,
  onClear,
}: PresentationControlsProps) {
  return (
    <footer className="presentation-controls">
      <button type="button" className="presentation-button presentation-button--action" onClick={onPresent} disabled={!canPresent}>
        <Radio size={20} />
        <span>Present</span>
      </button>
      <button type="button" className="presentation-button presentation-button--action presentation-button--action-clear" onClick={onClear} disabled={!canClear}>
        <Trash2 size={20} />
        <span>Clear</span>
      </button>
    </footer>
  );
}
