import React from 'react';
import { ProcessSegment } from '../../types/database';

interface ProcessSegmentBadgeProps {
  segmento: ProcessSegment | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
}

const SEGMENT_CONFIG: Record<
  ProcessSegment,
  { label: string; color: string; icon: string }
> = {
  ASSISTENCIAL: {
    label: 'Assistencial',
    color: 'bg-blue-100 text-blue-800 border border-blue-200',
    icon: '🏥',
  },
  PRESTADOR: {
    label: 'Prestador',
    color: 'bg-purple-100 text-purple-800 border border-purple-200',
    icon: '💼',
  },
  OUTRO: {
    label: 'Outro',
    color: 'bg-gray-100 text-gray-700 border border-gray-200',
    icon: '📋',
  },
  NAO_CLASSIFICADO: {
    label: 'A classificar',
    color: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
    icon: '⏳',
  },
};

/**
 * RF01 — Badge visual do segmento do processo.
 * Exibe "A classificar" quando segmento é nulo/indefinido.
 */
export const ProcessSegmentBadge: React.FC<ProcessSegmentBadgeProps> = ({
  segmento,
  size = 'sm',
  className = '',
}) => {
  const config = segmento
    ? SEGMENT_CONFIG[segmento]
    : SEGMENT_CONFIG.NAO_CLASSIFICADO;

  const sizeClass = size === 'sm'
    ? 'text-xs px-2 py-0.5'
    : 'text-sm px-2.5 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${config.color} ${sizeClass} ${className}`}
      title={`Segmento: ${config.label}`}
    >
      <span aria-hidden="true">{config.icon}</span>
      {config.label}
    </span>
  );
};

export default ProcessSegmentBadge;
