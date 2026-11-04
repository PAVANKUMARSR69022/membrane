import { useState, useCallback, useMemo } from 'react';
import { EventLogItem, LogSeverity } from '../types/robot';
import { INITIAL_EVENT_LOGS } from '../services/mockData';

export function useEventLogs() {
  const [logs, setLogs] = useState<EventLogItem[]>(INITIAL_EVENT_LOGS);
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  const addLog = useCallback((item: Omit<EventLogItem, 'id' | 'timestamp'>) => {
    const now = new Date();
    const timeStr =
      now.toTimeString().split(' ')[0] +
      '.' +
      Math.floor(now.getMilliseconds()).toString().padStart(3, '0');

    const newLog: EventLogItem = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: timeStr,
      component: item.component,
      event: item.event,
      severity: item.severity,
    };

    setLogs((prev) => [newLog, ...prev.slice(0, 199)]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSeverity =
        severityFilter === 'ALL' || log.severity === severityFilter;
      const matchesSearch =
        !searchQuery ||
        log.event.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.component.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSeverity && matchesSearch;
    });
  }, [logs, severityFilter, searchQuery]);

  return {
    logs: filteredLogs,
    allLogsCount: logs.length,
    severityFilter,
    setSeverityFilter,
    searchQuery,
    setSearchQuery,
    autoScroll,
    setAutoScroll,
    addLog,
    clearLogs,
  };
}

