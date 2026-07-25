import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingStyles = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export function Card({ children, className, padding = "md" }: CardProps) {
  return (
    <div
      className={cn(
        "bg-white border border-slate-200 rounded-xl",
        paddingStyles[padding],
        className
      )}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

export function CardHeader({ title, description, action, icon }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="flex items-center gap-2.5">
        {icon && (
          <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 shrink-0">
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {description && (
            <p className="text-xs text-slate-500 mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

interface CardDividerProps {}

export function CardDivider() {
  return <div className="border-t border-slate-100 my-4" />;
}
