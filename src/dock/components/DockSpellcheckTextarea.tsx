import type {
  KeyboardEventHandler,
  TextareaHTMLAttributes,
} from "react";

interface DockSpellcheckTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value" | "spellCheck"> {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
}

/**
 * Shared dock textarea kept under the old name for call-site compatibility.
 * Text editing should stay quiet: spelling diagnostics are not part of the
 * Worship or Notes editing surface.
 */
export default function DockSpellcheckTextarea({
  value,
  onChange,
  onKeyDown,
  className = "",
  id,
  ...textareaProps
}: DockSpellcheckTextareaProps) {
  return (
    <textarea
      {...textareaProps}
      id={id}
      className={className}
      value={value}
      spellCheck={false}
      onKeyDown={onKeyDown}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
