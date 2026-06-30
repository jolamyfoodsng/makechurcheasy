import React from "react";
import "./Tooltip.css";

type TooltipPosition = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  /** Tooltip text to display on hover */
  content: string;
  /** Position of the tooltip relative to the child element */
  position?: TooltipPosition;
  /** The element(s) to wrap with a tooltip */
  children: React.ReactElement;
}

/**
 * Pure CSS tooltip wrapper.
 *
 * Wraps any element to show a tooltip on hover/focus.
 * Uses `data-tooltip` attribute for the bubble content.
 * Also sets `aria-label` on the child for accessibility.
 *
 * @example
 * <Tooltip content="Push to broadcast">
 *   <button onClick={handlePush} title="Push"><Send size={16} /></button>
 * </Tooltip>
 */
export default function Tooltip({ content, position = "bottom", children }: TooltipProps) {
  if (!content) return children;

  const className = `mce-tooltip mce-tooltip--${position} ${(children.props as any).className || ""}`.trim();

  return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
    className,
    "data-tooltip": content,
    "aria-label": content,
  });
}
