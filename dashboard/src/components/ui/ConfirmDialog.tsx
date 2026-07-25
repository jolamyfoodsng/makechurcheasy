"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onCancel} />
      <div className="relative bg-white border border-slate-200 rounded-2xl p-8 w-full max-w-[480px] mx-4 shadow-xl">
        <div className="flex items-start gap-4">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${destructive ? "bg-red-50" : "bg-amber-50"
              }`}
          >
            <AlertTriangle
              className={`w-5 h-5 ${destructive ? "text-red-600" : "text-amber-600"
                }`}
            />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              {description}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-6">
          <Button
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            size="sm"
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
