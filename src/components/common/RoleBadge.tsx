import React from 'react';
import { UserRole } from '../../types/auth';

interface RoleBadgeProps {
  role?: UserRole | string;
  size?: 'sm' | 'md';
}

export const RoleBadge: React.FC<RoleBadgeProps> = ({ role = 'CONSULTA', size = 'md' }) => {
  const normalizedRole = (role || 'CONSULTA').toUpperCase();

  const getStyle = (r: string) => {
    switch (r) {
      case 'ADMIN':
        return 'bg-[#FEE2E2] text-[#991B1B]';
      case 'GESTOR':
        return 'bg-[#DBEAFE] text-[#1E40AF]';
      case 'ANALISTA':
        return 'bg-[#E2E8F0] text-[#0F172A]';
      case 'CONSULTA':
      default:
        return 'bg-[#F1F5F9] text-[#64748B]';
    }
  };

  const sizeClasses = size === 'sm' 
    ? 'px-2 py-0.5 text-[11px] font-semibold' 
    : 'px-2.5 py-1 text-xs font-semibold';

  return (
    <span
      id={`role-badge-${normalizedRole.toLowerCase()}`}
      className={`inline-flex items-center rounded-md uppercase whitespace-nowrap ${sizeClasses} ${getStyle(normalizedRole)}`}
    >
      {normalizedRole}
    </span>
  );
};
