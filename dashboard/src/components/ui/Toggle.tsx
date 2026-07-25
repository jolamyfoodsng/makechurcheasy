import { cn } from "@/lib/utils";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  destructive?: boolean;
}

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
  description,
  destructive,
}: ToggleProps) {
  const toggle = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative w-11 h-6 rounded-full transition-colors shrink-0",
        disabled && "opacity-50 cursor-not-allowed",
        checked
          ? destructive
            ? "bg-red-600"
            : "bg-blue-600"
          : "bg-slate-200"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
          checked && "translate-x-5"
        )}
      />
    </button>
  );

  if (!label) return toggle;

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-slate-900">{label}</p>
        {description && (
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
      {toggle}
    </div>
  );
}
