import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

export type ActionDialogVariant = 'default' | 'danger' | 'warning';

interface ActionDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ActionDialogVariant;
  inputLabel?: string;
  inputPlaceholder?: string;
  inputRequired?: boolean;
  initialValue?: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (value?: string) => void | Promise<void>;
}

export const ActionDialog: React.FC<ActionDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  inputLabel,
  inputPlaceholder,
  inputRequired = false,
  initialValue = '',
  busy = false,
  error,
  onClose,
  onConfirm,
}) => {
  const [value, setValue] = useState(initialValue);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      setLocalError(null);
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const submit = async () => {
    const trimmed = value.trim();
    if (inputRequired && !trimmed) {
      setLocalError('Este campo é obrigatório.');
      return;
    }
    setLocalError(null);
    await onConfirm(inputLabel ? trimmed : undefined);
  };

  const accent = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-700 focus:ring-red-200'
    : variant === 'warning'
      ? 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-200'
      : 'bg-slate-900 hover:bg-slate-800 focus:ring-slate-200';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4" role="presentation">
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="action-dialog-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${variant === 'danger' ? 'bg-red-50 text-red-600' : variant === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-700'}`}>
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <h3 id="action-dialog-title" className="text-sm font-bold text-slate-900">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          {inputLabel && (
            <label className="block text-xs font-semibold text-slate-700">
              {inputLabel}
              <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={inputPlaceholder}
                rows={3}
                disabled={busy}
                className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-50"
              />
            </label>
          )}
          {(localError || error) && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {localError || error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold text-white shadow-sm focus:outline-none focus:ring-4 disabled:opacity-60 ${accent}`}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
