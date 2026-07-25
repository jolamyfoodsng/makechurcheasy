import React from "react";
import Tooltip from "./Tooltip";
import "./Tooltip.css";

interface TooltipButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Tooltip text to display on hover */
  tooltip: string;
  /** Position of the tooltip relative to the button */
  tooltipPosition?: "top" | "bottom" | "left" | "right";
  /** Optional extra class name for the button */
  buttonClassName?: string;
}

/**
 * Convenience button with built-in tooltip, title, and aria-label.
 *
 * Use for simple icon-only buttons. For complex button content,
 * use <Tooltip> wrapper directly.
 *
 * @example
 * <TooltipButton tooltip="Close" onClick={handleClose}>
 *   <X size={16} />
 * </TooltipButton>
 */
export default function TooltipButton({
  tooltip,
  tooltipPosition = "bottom",
  buttonClassName,
  children,
  ...rest
}: TooltipButtonProps) {
  return (
    <Tooltip content={tooltip} position={tooltipPosition}>
      <button
        {...rest}
        className={buttonClassName}
        title={tooltip}
        aria-label={tooltip}
      >
        {children}
      </button>
    </Tooltip>
  );
}
