import React from 'react';

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'accent';

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  pulse?: boolean;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  variant = 'neutral',
  pulse = false,
  size = 'md',
  icon,
}) => {
  const variantStyles = {
    success: 'bg-emerald-950/70 border-emerald-500/40 text-emerald-400',
    warning: 'bg-amber-950/70 border-amber-500/40 text-amber-400',
    error: 'bg-rose-950/70 border-rose-500/40 text-rose-400',
    info: 'bg-sky-950/70 border-sky-500/40 text-sky-400',
    accent: 'bg-cyan-950/70 border-cyan-500/40 text-cyan-300',
    neutral: 'bg-slate-900 border-slate-700/60 text-slate-400',
  }[variant];

  const dotColors = {
    success: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]',
    warning: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]',
    error: 'bg-rose-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]',
    info: 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]',
    accent: 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]',
    neutral: 'bg-slate-500',
  }[variant];

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono font-medium rounded border ${variantStyles} ${sizeClasses}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${dotColors} ${
          pulse ? 'animate-ping' : ''
        }`}
      />
      {icon && <span className="opacity-80">{icon}</span>}
      <span className="uppercase tracking-wider">{label}</span>
    </span>
  );
};

