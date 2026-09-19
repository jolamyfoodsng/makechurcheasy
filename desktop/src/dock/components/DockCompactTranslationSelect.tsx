import Icon from "../DockIcon";

interface TranslationOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: TranslationOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
}

/**
 * Keeps compare controls compact without hiding the full translation names
 * from the native, keyboard-accessible option list.
 */
export default function DockCompactTranslationSelect({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
}: Props) {
  const selectedOption = options.find((option) => option.value === value);
  const selectedCode = selectedOption?.value ?? value;

  return (
    <div className={`dock-compact-translation-select${disabled ? " dock-compact-translation-select--disabled" : ""}`}>
      <span className="dock-compact-translation-select__value" aria-hidden="true">
        {selectedCode}
      </span>
      <Icon name="expand_more" size={14} />
      <select
        className="dock-compact-translation-select__native"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-label={ariaLabel}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
