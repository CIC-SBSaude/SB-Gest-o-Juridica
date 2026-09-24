import React from 'react';

interface StatusBadgeProps {
  status: string;
  type?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  label?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, type = 'default', label }) => {
  const displayLabel = label || status;

  const colorStyles: Record<string, string> = {
    default: 'bg-[#F1F5F9] text-[#475569]',
    success: 'bg-[#DCFCE7] text-[#166534]',
    warning: 'bg-[#FEF3C7] text-[#92400E]',
    danger: 'bg-[#FEE2E2] text-[#991B1B]',
    info: 'bg-[#DBEAFE] text-[#1E40AF]',
  };

  return (
    <span
      id={`status-badge-${status.toLowerCase()}`}
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap ${colorStyles[type] || colorStyles.default}`}
    >
      {displayLabel}
    </span>
  );
};
