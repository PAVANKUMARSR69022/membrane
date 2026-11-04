import React from 'react';

interface PanelContainerProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export const PanelContainer: React.FC<PanelContainerProps> = ({
  title,
  subtitle,
  icon,
  actions,
  children,
  className = '',
  bodyClassName = '',
}) => {
  return (
    <div
      className={`bg-[#0f1420] border border-[#1f2a40] rounded-lg flex flex-col overflow-hidden shadow-lg shadow-black/40 ${className}`}
    >
      {/* Header bar */}
      <div className="bg-[#141a29] border-b border-[#1f2a40] px-3.5 py-2 flex items-center justify-between select-none">
        <div className="flex items-center gap-2">
          {icon && <span className="text-cyan-400 opacity-90">{icon}</span>}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
              {title}
            </h3>
            {subtitle && (
              <span className="text-[10px] text-slate-500 font-mono block -mt-0.5">
                {subtitle}
              </span>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {/* Body content */}
      <div className={`p-3.5 flex-1 ${bodyClassName}`}>
        {children}
      </div>
    </div>
  );
};

