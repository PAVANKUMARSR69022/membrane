import React, { useRef, useEffect } from 'react';
import { Terminal, Search, Trash2, ArrowDown } from 'lucide-react';
import { PanelContainer } from '../common/PanelContainer';
import { EventLogItem, LogSeverity } from '../../types/robot';

interface EventLogsProps {
  logs: EventLogItem[];
  allLogsCount: number;
  severityFilter: string;
  onSeverityFilterChange: (filter: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  autoScroll: boolean;
  onAutoScrollToggle: () => void;
  onClear: () => void;
}

export const EventLogs: React.FC<EventLogsProps> = ({
  logs,
  allLogsCount,
  severityFilter,
  onSeverityFilterChange,
  searchQuery,
  onSearchChange,
  autoScroll,
  onAutoScrollToggle,
  onClear,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const severityPill = (sev: LogSeverity) => {
    switch (sev) {
      case 'SUCCESS':
        return <span className="text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-1 py-0.2 rounded text-[9px]">SUCCESS</span>;
      case 'WARNING':
        return <span className="text-amber-300 bg-amber-950/60 border border-amber-500/40 px-1 py-0.2 rounded text-[9px]">WARN</span>;
      case 'ERROR':
        return <span className="text-rose-400 bg-rose-950/60 border border-rose-500/40 px-1 py-0.2 rounded text-[9px]">ERROR</span>;
      case 'INFO':
      default:
        return <span className="text-sky-300 bg-sky-950/60 border border-sky-500/40 px-1 py-0.2 rounded text-[9px]">INFO</span>;
    }
  };

  return (
    <PanelContainer
      title="Telemetry & Runtime Event Logs"
      subtitle={`Live Buffer (${logs.length}/${allLogsCount} events)`}
      icon={<Terminal size={16} />}
      actions={
        <div className="flex items-center gap-1.5 font-mono text-xs">
          {/* Auto scroll toggle */}
          <button
            onClick={onAutoScrollToggle}
            className={`p-1 rounded border transition-colors ${
              autoScroll
                ? 'bg-cyan-950/60 border-cyan-500/50 text-cyan-300'
                : 'bg-[#121826] border-[#1f2a40] text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle Auto-Scroll"
          >
            <ArrowDown size={13} />
          </button>

          {/* Clear button */}
          <button
            onClick={onClear}
            className="p-1 rounded border border-[#1f2a40] bg-[#121826] hover:bg-rose-950/50 hover:border-rose-500/40 text-slate-500 hover:text-rose-400 transition-colors"
            title="Clear Logs Buffer"
          >
            <Trash2 size={13} />
          </button>
        </div>
      }
    >
      <div className="space-y-2 font-mono">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Severity Buttons */}
          <div className="flex items-center gap-1">
            {['ALL', 'INFO', 'SUCCESS', 'WARNING', 'ERROR'].map((filter) => (
              <button
                key={filter}
                onClick={() => onSeverityFilterChange(filter)}
                className={`px-2 py-0.5 rounded text-[10px] uppercase transition-colors ${
                  severityFilter === filter
                    ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-500/50'
                    : 'bg-[#090d14] text-slate-500 hover:text-slate-300 border border-[#1f2a40]'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="relative flex items-center">
            <Search size={12} className="absolute left-2 text-slate-500" />
            <input
              type="text"
              placeholder="Search component/event..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="bg-[#090d14] border border-[#1f2a40] rounded pl-6 pr-2 py-0.5 text-[11px] text-slate-200 focus:outline-none focus:border-cyan-500/60 w-44"
            />
          </div>
        </div>

        {/* Log Viewer Console */}
        <div
          ref={scrollRef}
          className="h-44 bg-[#090d14] rounded border border-[#1f2a40] p-2 overflow-y-auto space-y-1 text-[11px] leading-tight select-text"
        >
          {logs.length === 0 ? (
            <div className="text-slate-600 text-center py-8">
              No log entries match the current filter.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2 hover:bg-[#141b2a]/40 px-1 py-0.5 rounded transition-colors"
              >
                <span className="text-slate-600 shrink-0 text-[10px] pt-0.5">
                  {log.timestamp}
                </span>
                <span className="text-cyan-400 shrink-0 font-semibold text-[10px] pt-0.5">
                  [{log.component}]
                </span>
                <span className="shrink-0">{severityPill(log.severity)}</span>
                <span className="text-slate-300 flex-1 break-all">
                  {log.event}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </PanelContainer>
  );
};

