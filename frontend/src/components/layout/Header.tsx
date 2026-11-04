import React, { useState, useEffect } from 'react';
import {
  Activity,
  Circle,
  RefreshCw,
  Box,
  Layers,
  Clock,
  Radio,
} from 'lucide-react';
import { RobotState } from '../../types/robot';
import { BackendConnectionState } from '../../hooks/useBackendStatus';

interface HeaderProps {
  connectionStatus: BackendConnectionState;
  pingMs: number;
  robotState: RobotState;
  currentTaskName?: string;
  onRefreshConnection: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  connectionStatus,
  pingMs,
  robotState,
  currentTaskName = 'MISSION-01: SEARCH & RECOVER',
  onRefreshConnection,
}) => {
  const [timeStr, setTimeStr] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(true);
  const [recSeconds, setRecSeconds] = useState<number>(842);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setTimeStr(now.toTimeString().split(' ')[0] + ' UTC');
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      setRecSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecording]);

  const formatRecTime = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `00:${m}:${s}`;
  };

  const getRobotStateBadge = () => {
    const s = robotState.state;
    if (s === 'Carry') {
      return (
        <span className="px-2 py-0.5 rounded border border-amber-500/40 bg-amber-950/60 text-amber-300 font-mono text-xs flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          STATE: CARRY
        </span>
      );
    }
    if (s === 'Blocked') {
      return (
        <span className="px-2 py-0.5 rounded border border-rose-500/50 bg-rose-950/70 text-rose-300 font-mono text-xs flex items-center gap-1.5 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          STATE: BLOCKED ({robotState.retry_count}/3)
        </span>
      );
    }
    if (s === 'Failed') {
      return (
        <span className="px-2 py-0.5 rounded border border-rose-600 bg-rose-950 text-rose-300 font-mono text-xs flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
          STATE: FAILED
        </span>
      );
    }
    if (s === 'Done') {
      return (
        <span className="px-2 py-0.5 rounded border border-emerald-500/50 bg-emerald-950/60 text-emerald-300 font-mono text-xs flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          STATE: DONE ({robotState.result || 'PASS'})
        </span>
      );
    }
    if (s === 'Locate') {
      return (
        <span className="px-2 py-0.5 rounded border border-cyan-500/40 bg-cyan-950/60 text-cyan-300 font-mono text-xs flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          STATE: LOCATE
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded border border-slate-700 bg-slate-900 text-slate-300 font-mono text-xs flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        STATE: {s.toUpperCase()}
      </span>
    );
  };

  return (
    <header className="h-14 bg-[#0c1018] border-b border-[#1a2336] px-4 flex items-center justify-between shrink-0 select-none">
      {/* Left: Project & Active Mission */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
          <h1 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">
            MEMBRANE LAB COMMAND
          </h1>
        </div>
        <div className="h-4 w-[1px] bg-slate-800" />
        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 bg-[#121826] px-2.5 py-1 rounded border border-[#1f2a40]">
          <Layers size={13} className="text-cyan-400" />
          <span className="text-slate-300 font-medium">{currentTaskName}</span>
        </div>
      </div>

      {/* Center: System Telemetry Badges */}
      <div className="flex items-center gap-2.5">
        {/* Backend Connection */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded border font-mono text-xs ${
            connectionStatus === 'connected'
              ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
              : connectionStatus === 'connecting'
              ? 'border-amber-500/40 bg-amber-950/40 text-amber-300'
              : 'border-rose-500/40 bg-rose-950/40 text-rose-300'
          }`}
        >
          <Radio
            size={13}
            className={connectionStatus === 'connected' ? 'animate-pulse' : ''}
          />
          <span className="font-semibold uppercase">
            {connectionStatus === 'connected'
              ? `API LIVE (${pingMs}ms)`
              : connectionStatus === 'connecting'
              ? 'CONNECTING...'
              : 'API DISCONNECTED'}
          </span>
        </div>

        {/* Sim Engine Badge */}
        <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded border border-slate-700 bg-slate-900/80 text-slate-300 font-mono text-xs">
          <Box size={13} className="text-cyan-400" />
          <span>SIM: PYBULLET</span>
        </div>

        {/* Robot State Badge */}
        {getRobotStateBadge()}

        {/* Gripper Status */}
        <div
          className={`px-2 py-0.5 rounded border font-mono text-xs ${
            robotState.holding
              ? 'border-cyan-500/50 bg-cyan-950/60 text-cyan-300'
              : 'border-slate-800 bg-slate-950 text-slate-500'
          }`}
        >
          {robotState.holding ? 'GRIPPER: ENGAGED' : 'GRIPPER: VACANT'}
        </div>
      </div>

      {/* Right: Recording, Clock, Actions */}
      <div className="flex items-center gap-3">
        {/* Recording Indicator */}
        <button
          onClick={() => setIsRecording(!isRecording)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded border font-mono text-xs transition-colors ${
            isRecording
              ? 'border-rose-500/50 bg-rose-950/50 text-rose-300'
              : 'border-slate-800 bg-slate-900 text-slate-500'
          }`}
          title="Toggle Recording"
        >
          <Circle
            size={9}
            className={`${
              isRecording ? 'fill-rose-500 text-rose-500 animate-pulse' : 'text-slate-600'
            }`}
          />
          <span>{isRecording ? `REC ${formatRecTime(recSeconds)}` : 'REC PAUSED'}</span>
        </button>

        {/* System Time */}
        <div className="hidden xl:flex items-center gap-1.5 font-mono text-xs text-slate-400 bg-[#121826] px-2.5 py-1 rounded border border-[#1f2a40]">
          <Clock size={13} className="text-slate-500" />
          <span>{timeStr || '12:00:00 UTC'}</span>
        </div>

        {/* Reconnect / Refresh Button */}
        <button
          onClick={onRefreshConnection}
          className="p-1.5 rounded border border-[#1f2a40] bg-[#121826] hover:bg-[#1a2336] text-slate-400 hover:text-cyan-300 transition-colors"
          title="Refresh Connection"
        >
          <RefreshCw size={14} />
        </button>
      </div>
    </header>
  );
};

