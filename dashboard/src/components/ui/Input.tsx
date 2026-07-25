import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  required?: boolean;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, required, error, id, ...props }, ref) => {
    const t = useTranslations();
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold text-slate-700">
            {label} {required && <span className="text-red-500">*</span>}
            {!required && <span className="text-slate-400 font-normal">{t("input.optional")}</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "w-full h-[44px] px-3 rounded-lg border text-sm font-medium",
            "bg-white text-slate-900 placeholder:text-slate-400",
            "border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
            "outline-none transition-all",
            error && "border-red-300 focus:border-red-500 focus:ring-red-500/20",
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-xs text-red-500 font-medium">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  required?: boolean;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, required, error, id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={textareaId} className="block text-xs font-semibold text-slate-700">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            "w-full px-3 py-2.5 rounded-lg border text-sm font-medium",
            "bg-white text-slate-900 placeholder:text-slate-400",
            "border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
            "outline-none transition-all resize-y min-h-[120px] max-h-[160px]",
            error && "border-red-300 focus:border-red-500 focus:ring-red-500/20",
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-xs text-red-500 font-medium">{error}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  required?: boolean;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, required, error, id, options, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={selectId} className="block text-xs font-semibold text-slate-700">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn(
            "w-full h-[44px] px-3 rounded-lg border text-sm font-medium",
            "bg-white text-slate-900",
            "border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
            "outline-none transition-all appearance-none",
            error && "border-red-300 focus:border-red-500 focus:ring-red-500/20",
            className
          )}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="text-xs text-red-500 font-medium">{error}</p>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";
