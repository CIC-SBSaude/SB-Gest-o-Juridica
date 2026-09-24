import React from 'react';
import { ProcessStatus } from '../../types/database';

interface ProcessStatusBadgeProps {
  status: ProcessStatus | string;
  size?: 'sm' | 'md';
}

export const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  NOVA: {
    label: 'Nova Demanda',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
  },
  TRIAGEM: {
    label: 'Em Triagem',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  EM_ANALISE: {
    label: 'Em Análise',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    dot: 'bg-indigo-500',
  },
  EM_TRATAMENTO: {
    label: 'Em Tratamento',
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200',
    dot: 'bg-sky-500',
  },
  AGUARDANDO_TERCEIRO: {
    label: 'Aguardando Terceiro',
    bg: 'bg-orange-50',
    text: 'text-orange-800',
    border: 'border-orange-200',
    dot: 'bg-orange-500',
  },
  AGUARDANDO_DECISAO: {
    label: 'Aguardando Decisão',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    dot: 'bg-purple-500',
  },
  CONCLUIDA: {
    label: 'Concluída',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
  },
  CANCELADA: {
    label: 'Cancelada',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-300',
    dot: 'bg-slate-400',
  },
};

export const ProcessStatusBadge: React.FC<ProcessStatusBadgeProps> = ({
  status,
  size = 'sm',
}) => {
  const config = STATUS_CONFIG[status] || {
    label: status || 'Desconhecido',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
  };

  const padClass = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      id={`process-status-badge-${String(status).toLowerCase()}`}
      className={`inline-flex items-center gap-1.5 font-semibold rounded-md border whitespace-nowrap ${config.bg} ${config.text} ${config.border} ${padClass}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <span>{config.label}</span>
    </span>
  );
};

export const ProcessPriorityBadge: React.FC<{ priority?: string | null }> = ({ priority }) => {
  const p = (priority || 'MEDIA').toUpperCase();

  const configs: Record<string, { label: string; bg: string; text: string; border: string }> = {
    URGENTE: {
      label: 'Urgente',
      bg: 'bg-red-100',
      text: 'text-red-800',
      border: 'border-red-200',
    },
    ALTA: {
      label: 'Alta',
      bg: 'bg-orange-100',
      text: 'text-orange-800',
      border: 'border-orange-200',
    },
    MEDIA: {
      label: 'Média',
      bg: 'bg-slate-100',
      text: 'text-slate-700',
      border: 'border-slate-200',
    },
    BAIXA: {
      label: 'Baixa',
      bg: 'bg-slate-50',
      text: 'text-slate-500',
      border: 'border-slate-200',
    },
  };

  const current = configs[p] || configs.MEDIA;

  return (
    <span
      id={`priority-badge-${p.toLowerCase()}`}
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap ${current.bg} ${current.text} ${current.border}`}
    >
      {current.label}
    </span>
  );
};
