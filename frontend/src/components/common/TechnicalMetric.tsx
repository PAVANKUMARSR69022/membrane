import React from 'react';

interface TechnicalMetricProps {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  status?: 'healthy' | 'warning' | 'alert' | 'neutral';
  icon?: React.ReactNode;
}

export const TechnicalMetric: React.FC<TechnicalMetricProps> = ({
  label,
  value,
  unit,
  subtext,
  status = 'neutral',
  icon,
}) => {
  const statusBorder = {
    healthy: 'border-l-2 border-l-emerald-500',
    warning: 'border-l-2 border-l-amber-500',
    alert: 'border-l-2 border-l-rose-500',
    neutral: 'border-l-2 border-l-slate-700',
  }[status];

  const valueColor = {
    healthy: 'text-slate-100',
    warning: 'text-amber-300',
    alert: 'text-rose-400',
    neutral: 'text-slate-200',
  }[status];

  return (
    <div
      className={`bg-[#0f1420]/80 border border-[#1f2a40] ${statusBorder} px-3 py-2 rounded flex flex-col justify-between`}
    >
      <div className="flex items-center justify-between text-[#818ea8] text-[11px] uppercase font-mono tracking-wider">
        <span>{label}</span>
        {icon && <span className="text-slate-500">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-1 mt-1 font-mono">
        <span className={`text-lg font-semibold tracking-tight ${valueColor}`}>
          {value}
        </span>
        {unit && <span className="text-xs text-slate-500">{unit}</span>}
      </div>
      {subtext && (
        <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
          {subtext}
        </div>
      )}
    </div>
  );
};

