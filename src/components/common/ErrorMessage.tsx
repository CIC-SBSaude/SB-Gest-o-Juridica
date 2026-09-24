import React from 'react';
import { AlertCircle, X } from 'lucide-react';

interface ErrorMessageProps {
  title?: string;
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  title = 'Atenção',
  message,
  onDismiss,
  onRetry,
}) => {
  if (!message) return null;

  return (
    <div
      id="central-error-banner"
      className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 shadow-xs mb-4"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-red-900">{title}</h4>
          <p className="text-sm text-red-700 mt-0.5 leading-relaxed">{message}</p>
          {onRetry && (
            <button
              id="error-retry-btn"
              type="button"
              onClick={onRetry}
              className="mt-2 text-xs font-medium text-red-700 underline hover:text-red-900 cursor-pointer"
            >
              Tentar novamente
            </button>
          )}
        </div>
        {onDismiss && (
          <button
            id="error-dismiss-btn"
            type="button"
            onClick={onDismiss}
            className="text-red-400 hover:text-red-600 transition-colors p-1"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
