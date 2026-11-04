import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot,
  SendHorizonal,
  Radar,
  Map,
  Navigation,
  Crosshair,
  Hand,
  Truck,
  Target,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Zap,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';
import { PanelContainer } from '../common/PanelContainer';
import { RobotState } from '../../types/robot';

type MissionPhase =
  | 'IDLE'
  | 'SCANNING'
  | 'MAPPING'
  | 'LOCALIZING'
  | 'PATHFINDING'
  | 'APPROACHING'
  | 'GRASPING'
  | 'TRANSPORTING'
  | 'DELIVERING'
  | 'COMPLETE'
  | 'ABORTED';

interface MissionPreset {
  id: string;
  label: string;
  target: string | null;
  color: string;
}

const MISSION_PRESETS: MissionPreset[] = [
  { id: 'scan_room', label: 'Scan Room', target: null, color: 'amber' },
  { id: 'retrieve_red_cube', label: 'Retrieve Red Cube', target: 'red_cube', color: 'red' },
  { id: 'retrieve_blue_sphere', label: 'Retrieve Blue Sphere', target: 'blue_sphere', color: 'blue' },
  { id: 'retrieve_red_cylinder', label: 'Retrieve Red Cylinder', target: 'red_cylinder', color: 'red' },
  { id: 'retrieve_yellow_cube', label: 'Retrieve Yellow Cube', target: 'yellow_cube', color: 'yellow' },
  { id: 'retrieve_purple_cone', label: 'Retrieve Purple Cone', target: 'purple_cone', color: 'purple' },
];

const PHASE_CONFIG: Record<MissionPhase, { icon: React.ReactNode; label: string; color: string }> = {
  IDLE:         { icon: <Bot size={14} />,         label: 'IDLE',          color: 'text-slate-400' },
  SCANNING:     { icon: <Radar size={14} />,        label: 'SCANNING',      color: 'text-amber-400' },
  MAPPING:      { icon: <Map size={14} />,          label: 'MAPPING',       color: 'text-amber-300' },
  LOCALIZING:   { icon: <Navigation size={14} />,   label: 'LOCALIZING',    color: 'text-orange-400' },
  PATHFINDING:  { icon: <Crosshair size={14} />,    label: 'PATHFINDING',   color: 'text-orange-300' },
  APPROACHING:  { icon: <Navigation size={14} />,   label: 'APPROACHING',   color: 'text-yellow-400' },
  GRASPING:     { icon: <Hand size={14} />,         label: 'GRASPING',      color: 'text-emerald-400' },
  TRANSPORTING: { icon: <Truck size={14} />,        label: 'TRANSPORTING',  color: 'text-emerald-300' },
  DELIVERING:   { icon: <Target size={14} />,       label: 'DELIVERING',    color: 'text-green-400' },
  COMPLETE:     { icon: <CheckCircle2 size={14} />, label: 'COMPLETE',      color: 'text-green-300' },
  ABORTED:      { icon: <AlertTriangle size={14} />,label: 'ABORTED',       color: 'text-red-400' },
};

const PHASE_ORDER: MissionPhase[] = [
  'SCANNING','MAPPING','LOCALIZING','PATHFINDING',
  'APPROACHING','GRASPING','TRANSPORTING','DELIVERING','COMPLETE',
];

interface AutonomousMissionProps {
  isConnected: boolean;
  robotState: RobotState;
  isExecutingAction: boolean;
  lastActionFeedback: {
    action: string;
    status: 'success' | 'warning' | 'error' | 'idle';
    message: string;
  };
  onMove: (distance: number) => void;
  onTurn: (degrees: number) => void;
  onPickup: () => void;
  onDrop: () => void;
}

export const AutonomousMission: React.FC<AutonomousMissionProps> = ({
  isConnected,
  robotState,
  isExecutingAction,
  lastActionFeedback,
  onMove,
  onTurn,
  onPickup,
  onDrop,
}) => {
  const [commandInput, setCommandInput] = useState('');
  const [currentPhase, setCurrentPhase] = useState<MissionPhase>('IDLE');
  const [missionGoal, setMissionGoal] = useState<string>('No active mission');
  const [missionActive, setMissionActive] = useState(false);
  const [phaseProgress, setPhaseProgress] = useState(0);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [missionLog, setMissionLog] = useState<string[]>(['System ready. Awaiting mission dispatch.']);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseIndexRef = useRef(0);

  const appendLog = useCallback((msg: string) => {
    setMissionLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 29)]);
  }, []);

  const stopMission = useCallback(() => {
    if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    phaseIndexRef.current = 0;
    setMissionActive(false);
    setCurrentPhase('IDLE');
    setPhaseProgress(0);
    setElapsedSecs(0);
  }, []);

  const advancePhase = useCallback((phases: MissionPhase[], idx: number, onMove: (d: number) => void, onTurn: (d: number) => void, onPickup: () => void, onDrop: () => void) => {
    if (idx >= phases.length) {
      setCurrentPhase('COMPLETE');
      setPhaseProgress(100);
      setMissionActive(false);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      appendLog('Mission COMPLETE — object delivered to drop zone.');
      return;
    }

    const phase = phases[idx];
    setCurrentPhase(phase);
    setPhaseProgress(Math.round((idx / phases.length) * 100));
    appendLog(`Phase: ${phase}`);

    // Trigger real API calls for action phases
    if (phase === 'APPROACHING') {
      onMove(0.5);
    } else if (phase === 'GRASPING') {
      onPickup();
    } else if (phase === 'DELIVERING') {
      onDrop();
    } else if (phase === 'SCANNING' || phase === 'MAPPING') {
      onTurn(45);
    }

    const phaseDuration = phase === 'SCANNING' ? 2000 : phase === 'MAPPING' ? 2500 : phase === 'APPROACHING' ? 2000 : phase === 'GRASPING' ? 1500 : phase === 'TRANSPORTING' ? 2000 : 1500;
    phaseTimerRef.current = setTimeout(() => {
      advancePhase(phases, idx + 1, onMove, onTurn, onPickup, onDrop);
    }, phaseDuration);
  }, [appendLog]);

  const startMission = useCallback((goal: string, phases: MissionPhase[]) => {
    if (!isConnected) return;
    stopMission();
    setMissionGoal(goal);
    setMissionActive(true);
    setElapsedSecs(0);
    appendLog(`Mission dispatched: "${goal}"`);

    elapsedTimerRef.current = setInterval(() => {
      setElapsedSecs(s => s + 1);
    }, 1000);

    advancePhase(phases, 0, onMove, onTurn, onPickup, onDrop);
  }, [isConnected, stopMission, appendLog, advancePhase, onMove, onTurn, onPickup, onDrop]);

  const handlePreset = useCallback((preset: MissionPreset) => {
    const phases: MissionPhase[] = preset.target
      ? ['SCANNING','MAPPING','LOCALIZING','PATHFINDING','APPROACHING','GRASPING','TRANSPORTING','DELIVERING','COMPLETE']
      : ['SCANNING','MAPPING','LOCALIZING','COMPLETE'];
    startMission(preset.label, phases);
  }, [startMission]);

  const handleDispatch = useCallback(() => {
    if (!commandInput.trim() || !isConnected) return;
    const cmd = commandInput.trim().toLowerCase();
    const matchedPreset = MISSION_PRESETS.find(p => cmd.includes(p.id.replace(/_/g, ' ')) || cmd.includes(p.label.toLowerCase()));
    if (matchedPreset) {
      handlePreset(matchedPreset);
    } else {
      startMission(commandInput.trim(), ['SCANNING','MAPPING','LOCALIZING','PATHFINDING','APPROACHING','GRASPING','TRANSPORTING','DELIVERING','COMPLETE']);
    }
    setCommandInput('');
  }, [commandInput, isConnected, handlePreset, startMission]);

  useEffect(() => {
    return () => {
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, []);

  const phaseInfo = PHASE_CONFIG[currentPhase];
  const progressPct = phaseProgress;

  const presetColorMap: Record<string, string> = {
    amber: 'border-amber-500/40 hover:bg-amber-950/40 text-amber-300',
    red: 'border-red-500/40 hover:bg-red-950/40 text-red-300',
    blue: 'border-blue-500/40 hover:bg-blue-950/40 text-blue-300',
    yellow: 'border-yellow-500/40 hover:bg-yellow-950/40 text-yellow-300',
    purple: 'border-purple-500/40 hover:bg-purple-950/40 text-purple-300',
  };

  return (
    <PanelContainer
      title="Autonomous Mission Dispatcher"
      subtitle="NLP-Driven Autonomous Agent Control Interface"
      icon={<Bot size={16} />}
      actions={
        <div className="flex items-center gap-2 font-mono text-[10px]">
          <span className={`flex items-center gap-1 ${missionActive ? 'text-amber-400' : 'text-slate-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${missionActive ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'}`} />
            {missionActive ? 'MISSION ACTIVE' : 'STANDBY'}
          </span>
          {missionActive && (
            <button
              onClick={stopMission}
              className="px-2 py-0.5 rounded border border-red-500/40 text-red-400 hover:bg-red-950/40 transition-colors flex items-center gap-1"
            >
              <RotateCcw size={10} />
              ABORT
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-3 font-mono">
        {/* NLP Command Bar */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={commandInput}
              onChange={e => setCommandInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleDispatch()}
              placeholder='e.g. "Retrieve blue sphere from room" or "Scan environment"'
              disabled={!isConnected || missionActive}
              className="w-full bg-[#111215] border border-[#2e323b] rounded px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20 disabled:opacity-40 transition-all"
            />
          </div>
          <button
            onClick={handleDispatch}
            disabled={!isConnected || missionActive || !commandInput.trim()}
            className="px-3 py-2 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/50 text-amber-300 rounded text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-40"
          >
            <SendHorizonal size={13} />
            DISPATCH
          </button>
        </div>

        {/* Mission Presets Grid */}
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">MISSION PRESETS</div>
          <div className="grid grid-cols-3 gap-1.5">
            {MISSION_PRESETS.map(preset => (
              <button
                key={preset.id}
                onClick={() => handlePreset(preset)}
                disabled={!isConnected || missionActive}
                className={`py-1.5 px-2 rounded border bg-[#111215] text-[11px] font-semibold transition-all disabled:opacity-40 ${presetColorMap[preset.color] || 'border-slate-600 text-slate-300 hover:bg-slate-800/40'}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Current Mission Status */}
        <div className="bg-[#111215] border border-[#2e323b] rounded p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">ACTIVE MISSION</div>
            <div className="text-[10px] text-slate-500 font-mono">
              {missionActive ? `T+${elapsedSecs}s` : '—'}
            </div>
          </div>

          <div className="text-sm text-slate-200 font-semibold truncate">{missionGoal}</div>

          {/* Phase Badge */}
          <div className={`flex items-center gap-2 ${phaseInfo.color}`}>
            {missionActive && currentPhase !== 'COMPLETE' && currentPhase !== 'IDLE' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              phaseInfo.icon
            )}
            <span className="text-xs font-bold tracking-widest">{phaseInfo.label}</span>
          </div>

          {/* Progress Bar */}
          <div className="h-1.5 bg-[#1c1e24] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Phase Pipeline */}
          <div className="flex items-center gap-0.5 overflow-x-auto pb-1">
            {PHASE_ORDER.map((phase, i) => {
              const phaseIdx = PHASE_ORDER.indexOf(currentPhase as MissionPhase);
              const isDone = missionActive && i < phaseIdx;
              const isCurrent = currentPhase === phase;
              return (
                <React.Fragment key={phase}>
                  <div className={`flex-shrink-0 h-5 px-1.5 rounded text-[9px] font-bold flex items-center whitespace-nowrap transition-all ${
                    isCurrent ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50' :
                    isDone ? 'bg-emerald-900/40 text-emerald-400' :
                    'text-slate-600'
                  }`}>
                    {phase.slice(0, 4)}
                  </div>
                  {i < PHASE_ORDER.length - 1 && (
                    <div className={`flex-shrink-0 w-2 h-[1px] ${isDone ? 'bg-emerald-600' : 'bg-slate-700'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Mission Log */}
        <div className="bg-[#111215] border border-[#2e323b] rounded p-2">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
            <span>MISSION LOG</span>
            <RefreshCw size={9} className={`${missionActive ? 'text-amber-400 animate-spin' : 'text-slate-600'}`} />
          </div>
          <div className="space-y-0.5 max-h-24 overflow-y-auto">
            {missionLog.map((entry, i) => (
              <div key={i} className={`text-[10px] font-mono ${i === 0 ? 'text-slate-300' : 'text-slate-600'}`}>
                {entry}
              </div>
            ))}
          </div>
        </div>

        {/* Action Feedback */}
        <div className={`px-2.5 py-1.5 rounded border text-[11px] flex items-center gap-2 transition-all ${
          isExecutingAction ? 'bg-amber-950/50 border-amber-500/40 text-amber-300 animate-pulse' :
          lastActionFeedback.status === 'success' ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' :
          lastActionFeedback.status === 'error' ? 'bg-red-950/40 border-red-500/30 text-red-300' :
          'bg-[#111215] border-[#2e323b] text-slate-500'
        }`}>
          {isExecutingAction ? (
            <><Loader2 size={12} className="animate-spin" /><span>Executing autonomous command...</span></>
          ) : lastActionFeedback.status === 'success' ? (
            <><CheckCircle2 size={12} /><span>[{lastActionFeedback.action}] {lastActionFeedback.message}</span></>
          ) : lastActionFeedback.status === 'error' ? (
            <><AlertTriangle size={12} /><span>[{lastActionFeedback.action}] {lastActionFeedback.message}</span></>
          ) : (
            <><Zap size={12} /><span>Autonomous planner ready. Dispatch a mission to begin.</span></>
          )}
        </div>
      </div>
    </PanelContainer>
  );
};
