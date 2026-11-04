import React, { useState } from 'react';
import {
  Compass,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  RotateCw,
  PackagePlus,
  PackageMinus,
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Shield,
} from 'lucide-react';
import { PanelContainer } from '../common/PanelContainer';
import { RobotState } from '../../types/robot';

interface RobotControlsProps {
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

export const RobotControls: React.FC<RobotControlsProps> = ({
  isConnected,
  robotState,
  isExecutingAction,
  lastActionFeedback,
  onMove,
  onTurn,
  onPickup,
  onDrop,
}) => {
  const [stepDistance, setStepDistance] = useState<number>(0.5);
  const [turnAngle, setTurnAngle] = useState<number>(45.0);

  const disabled = !isConnected || isExecutingAction;

  return (
    <PanelContainer
      title="Teleoperation & Motion Actuators"
      subtitle="Authoritative Kinematic Command Interface"
      icon={<Compass size={16} />}
      actions={
        <div className="font-mono text-[10px] text-slate-400 flex items-center gap-1.5">
          <Shield size={12} className="text-cyan-400" />
          <span>BOUNDED COMMAND LOCK</span>
        </div>
      }
    >
      <div className="space-y-4 font-mono select-none">
        {/* Step size & angle selectors */}
        <div className="grid grid-cols-2 gap-3">
          {/* Movement Distance presets */}
          <div className="bg-[#090d14] p-2.5 rounded border border-[#1f2a40]">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 flex justify-between">
              <span>STEP DISTANCE</span>
              <span className="text-cyan-400 font-bold">{stepDistance}m</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[0.1, 0.25, 0.5, 1.0].map((dist) => (
                <button
                  key={dist}
                  disabled={disabled}
                  onClick={() => setStepDistance(dist)}
                  className={`py-1 text-xs rounded border transition-colors ${
                    stepDistance === dist
                      ? 'bg-cyan-950 text-cyan-300 font-bold border-cyan-500/50'
                      : 'bg-[#121826] text-slate-400 hover:text-slate-200 border-[#1f2a40]'
                  } disabled:opacity-40`}
                >
                  {dist}m
                </button>
              ))}
            </div>
          </div>

          {/* Turn angle presets */}
          <div className="bg-[#090d14] p-2.5 rounded border border-[#1f2a40]">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 flex justify-between">
              <span>TURN ANGLE</span>
              <span className="text-cyan-400 font-bold">{turnAngle}°</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[15, 30, 45, 90].map((deg) => (
                <button
                  key={deg}
                  disabled={disabled}
                  onClick={() => setTurnAngle(deg)}
                  className={`py-1 text-xs rounded border transition-colors ${
                    turnAngle === deg
                      ? 'bg-cyan-950 text-cyan-300 font-bold border-cyan-500/50'
                      : 'bg-[#121826] text-slate-400 hover:text-slate-200 border-[#1f2a40]'
                  } disabled:opacity-40`}
                >
                  {deg}°
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Directional Pad and Gripper Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          {/* Kinematic D-Pad */}
          <div className="flex flex-col items-center justify-center p-2 bg-[#090d14] rounded border border-[#1f2a40]">
            {/* Forward button */}
            <button
              disabled={disabled}
              onClick={() => onMove(stepDistance)}
              className="w-28 py-2 mb-1.5 bg-[#141b2a] hover:bg-[#1a2336] active:bg-cyan-950 border border-[#212c44] hover:border-cyan-500/50 text-slate-200 rounded flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 shadow"
            >
              <ArrowUp size={16} className="text-cyan-400" />
              <span className="text-xs font-semibold">FWD (+{stepDistance}m)</span>
            </button>

            {/* Left / Center / Right row */}
            <div className="flex items-center gap-1.5">
              <button
                disabled={disabled}
                onClick={() => onTurn(-turnAngle)}
                className="w-28 py-2 bg-[#141b2a] hover:bg-[#1a2336] active:bg-cyan-950 border border-[#212c44] hover:border-cyan-500/50 text-slate-200 rounded flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 shadow"
              >
                <RotateCcw size={15} className="text-cyan-400" />
                <span className="text-xs font-semibold">LEFT (-{turnAngle}°)</span>
              </button>

              <div className="w-10 h-10 rounded border border-[#1f2a40] bg-[#0c1018] flex items-center justify-center text-[10px] text-slate-500 font-mono">
                {robotState.heading.toFixed(0)}°
              </div>

              <button
                disabled={disabled}
                onClick={() => onTurn(turnAngle)}
                className="w-28 py-2 bg-[#141b2a] hover:bg-[#1a2336] active:bg-cyan-950 border border-[#212c44] hover:border-cyan-500/50 text-slate-200 rounded flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 shadow"
              >
                <span className="text-xs font-semibold">RIGHT (+{turnAngle}°)</span>
                <RotateCw size={15} className="text-cyan-400" />
              </button>
            </div>

            {/* Backward button */}
            <button
              disabled={disabled}
              onClick={() => onMove(-stepDistance)}
              className="w-28 py-2 mt-1.5 bg-[#141b2a] hover:bg-[#1a2336] active:bg-cyan-950 border border-[#212c44] hover:border-cyan-500/50 text-slate-200 rounded flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 shadow"
            >
              <ArrowDown size={16} className="text-cyan-400" />
              <span className="text-xs font-semibold">REV (-{stepDistance}m)</span>
            </button>
          </div>

          {/* Gripper Actuators */}
          <div className="space-y-2.5">
            <div className="bg-[#090d14] p-3 rounded border border-[#1f2a40] space-y-2">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider flex justify-between">
                <span>MANIPULATOR ACTUATORS</span>
                <span
                  className={
                    robotState.holding ? 'text-cyan-400' : 'text-slate-500'
                  }
                >
                  {robotState.holding ? 'TARGET GRIPPED' : 'READY TO PICK'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* Pickup Button */}
                <button
                  disabled={disabled || robotState.holding}
                  onClick={onPickup}
                  className="py-2.5 px-3 rounded bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 font-semibold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-40 shadow"
                >
                  <PackagePlus size={16} />
                  <span>POST /pickup</span>
                </button>

                {/* Drop Button */}
                <button
                  disabled={disabled || !robotState.holding}
                  onClick={onDrop}
                  className="py-2.5 px-3 rounded bg-amber-950/60 hover:bg-amber-900 border border-amber-500/40 text-amber-300 font-semibold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-40 shadow"
                >
                  <PackageMinus size={16} />
                  <span>POST /drop</span>
                </button>
              </div>

              <div className="text-[9px] text-slate-500 leading-tight pt-1">
                Reach rule: Object must be within 0.5m surface reach and ±30° heading alignment.
              </div>
            </div>

            {/* Keyboard shortcut hint */}
            <div className="bg-[#121826]/70 px-2.5 py-1.5 rounded border border-[#1f2a40] text-[10px] text-slate-400 flex items-center justify-between">
              <span>CONTROLS HOTKEYS:</span>
              <span className="text-cyan-300 font-mono">
                W: FWD • S: REV • A: LEFT • D: RIGHT • E: PICK • Q: DROP
              </span>
            </div>
          </div>
        </div>

        {/* Action Execution Feedback Banner */}
        <div
          className={`p-2.5 rounded border text-xs flex items-center gap-2.5 transition-all ${
            isExecutingAction
              ? 'bg-cyan-950/70 border-cyan-500/50 text-cyan-200 animate-pulse'
              : lastActionFeedback.status === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
              : lastActionFeedback.status === 'warning'
              ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
              : lastActionFeedback.status === 'error'
              ? 'bg-rose-950/60 border-rose-500/40 text-rose-300'
              : 'bg-[#090d14] border-[#1f2a40] text-slate-500'
          }`}
        >
          {isExecutingAction ? (
            <>
              <Loader2 size={16} className="animate-spin text-cyan-400" />
              <span>Executing kinematic command... awaiting simulator response</span>
            </>
          ) : lastActionFeedback.status === 'success' ? (
            <>
              <CheckCircle size={16} className="text-emerald-400" />
              <div>
                <span className="font-bold mr-1">[{lastActionFeedback.action}]</span>
                <span>{lastActionFeedback.message}</span>
              </div>
            </>
          ) : lastActionFeedback.status === 'warning' ? (
            <>
              <AlertTriangle size={16} className="text-amber-400" />
              <div>
                <span className="font-bold mr-1">[{lastActionFeedback.action}]</span>
                <span>{lastActionFeedback.message}</span>
              </div>
            </>
          ) : lastActionFeedback.status === 'error' ? (
            <>
              <XCircle size={16} className="text-rose-400" />
              <div>
                <span className="font-bold mr-1">[{lastActionFeedback.action}]</span>
                <span>{lastActionFeedback.message}</span>
              </div>
            </>
          ) : (
            <span>Actuator controller ready. Awaiting operator input.</span>
          )}
        </div>
      </div>
    </PanelContainer>
  );
};

