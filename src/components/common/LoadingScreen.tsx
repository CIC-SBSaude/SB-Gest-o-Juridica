import React from 'react';
import { Loader2, Scale } from 'lucide-react';

export const LoadingScreen: React.FC<{ message?: string }> = ({
  message = 'Carregando ambiente corporativo...',
}) => {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4">
      <div className="flex flex-col items-center max-w-sm text-center">
        <div className="w-14 h-14 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-md mb-4 ring-4 ring-slate-100">
          <Scale className="w-7 h-7 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-[#0F172A] tracking-tight mb-1">
          SB Gestão Jurídica
        </h2>
        <span className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-6">
          SB Saúde • Sistema Integrado
        </span>
        <div className="flex items-center gap-2.5 text-slate-600 bg-white px-4 py-2.5 rounded-lg border border-slate-200 shadow-xs">
          <Loader2 className="w-4 h-4 text-red-600 animate-spin" />
          <span className="text-sm font-medium">{message}</span>
        </div>
      </div>
    </div>
  );
};
