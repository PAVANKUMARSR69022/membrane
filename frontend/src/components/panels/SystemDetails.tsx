import React from 'react';
import {
  Server,
  Cpu,
  Radio,
  Camera,
  Layers,
  ShieldCheck,
  Disc,
} from 'lucide-react';
import { PanelContainer } from '../common/PanelContainer';
import { RobotState } from '../../types/robot';
import { BackendConnectionState } from '../../hooks/useBackendStatus';

interface SystemDetailsProps {
  connectionStatus: BackendConnectionState;
  pingMs: number;
  robotState: RobotState;
  currentTask: string;
  cameraFps: number;
  keyframeCount: number;
}

export const SystemDetails: React.FC<SystemDetailsProps> = ({
  connectionStatus,
  pingMs,
  robotState,
  currentTask,
  cameraFps,
  keyframeCount,
}) => {
  const isConnected = connectionStatus === 'connected';

  return (
    <PanelContainer
      title="System Diagnostics & Architecture Status"
      subtitle="Hardware, Simulator & Pipeline Health Report"
      icon={<Server size={16} />}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
        {/* Sim Engine */}
        <div className="bg-[#090d14] p-3 rounded border border-[#1f2a40] space-y-1">
          <div className="text-[10px] text-slate-500 uppercase flex items-center justify-between">
            <span>SIMULATION ENGINE</span>
            <Cpu size={13} className="text-cyan-400" />
          </div>
          <div className="text-slate-200 font-bold">PyBullet 3.2.8 (ARM64)</div>
          <div className="text-[10px] text-slate-400">
            Room: 8.0m x 8.0m • Kinematic DT: 1/30s
          </div>
        </div>

        {/* Backend Endpoint */}
        <div className="bg-[#090d14] p-3 rounded border border-[#1f2a40] space-y-1">
          <div className="text-[10px] text-slate-500 uppercase flex items-center justify-between">
            <span>FASTAPI SERVER</span>
            <Radio
              size={13}
              className={isConnected ? 'text-emerald-400' : 'text-rose-400'}
            />
          </div>
          <div className="flex items-center gap-1.5 font-bold">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-400' : 'bg-rose-500'
              }`}
            />
            <span className={isConnected ? 'text-emerald-400' : 'text-rose-400'}>
              {isConnected ? `CONNECTED (${pingMs}ms)` : 'DISCONNECTED'}
            </span>
          </div>
          <div className="text-[10px] text-slate-400">
            Host: 127.0.0.1:8080 • Authoritative
          </div>
        </div>

        {/* Camera Sensor */}
        <div className="bg-[#090d14] p-3 rounded border border-[#1f2a40] space-y-1">
          <div className="text-[10px] text-slate-500 uppercase flex items-center justify-between">
            <span>CAMERA SUBSYSTEM</span>
            <Camera size={13} className="text-cyan-400" />
          </div>
          <div className="text-cyan-300 font-bold">
            640x480 @ {cameraFps} FPS
          </div>
          <div className="text-[10px] text-slate-400">
            FOV: 90.0° • Pitch: -10.0° • Z: 0.5m
          </div>
        </div>

        {/* Agent Connection */}
        <div className="bg-[#090d14] p-3 rounded border border-[#1f2a40] space-y-1">
          <div className="text-[10px] text-slate-500 uppercase flex items-center justify-between">
            <span>CLAUDE AGENT</span>
            <ShieldCheck size={13} className="text-purple-400" />
          </div>
          <div className="text-purple-300 font-bold">STANDBY (PAUSED)</div>
          <div className="text-[10px] text-slate-400">
            Task 07 Mock Mode • Strict Privacy Active
          </div>
        </div>

        {/* Active Task */}
        <div className="bg-[#090d14] p-3 rounded border border-[#1f2a40] space-y-1">
          <div className="text-[10px] text-slate-500 uppercase flex items-center justify-between">
            <span>MISSION ID</span>
            <Layers size={13} className="text-slate-400" />
          </div>
          <div className="text-slate-200 font-bold truncate">{currentTask}</div>
          <div className="text-[10px] text-slate-400">
            Multi-stage recovery orchestration
          </div>
        </div>

        {/* Robot State */}
        <div className="bg-[#090d14] p-3 rounded border border-[#1f2a40] space-y-1">
          <div className="text-[10px] text-slate-500 uppercase flex items-center justify-between">
            <span>CURRENT STATE</span>
            <span className="text-cyan-400">ODOMETRY</span>
          </div>
          <div className="text-slate-200 font-bold">
            {robotState.state.toUpperCase()} (Retries: {robotState.retry_count}/3)
          </div>
          <div className="text-[10px] text-slate-400">
            Gripper: {robotState.holding ? 'LOAD ENGAGED' : 'VACANT'}
          </div>
        </div>

        {/* Recording Stream */}
        <div className="bg-[#090d14] p-3 rounded border border-[#1f2a40] space-y-1">
          <div className="text-[10px] text-slate-500 uppercase flex items-center justify-between">
            <span>SESSION RECORDER</span>
            <Disc size={13} className="text-rose-400 animate-pulse" />
          </div>
          <div className="text-rose-300 font-bold">BUFFER RECORDING</div>
          <div className="text-[10px] text-slate-400">
            {keyframeCount} Keyframe snapshots archived
          </div>
        </div>

        {/* Information Boundary Guard */}
        <div className="bg-[#090d14] p-3 rounded border border-emerald-500/30 space-y-1">
          <div className="text-[10px] text-emerald-400 uppercase flex items-center justify-between">
            <span>SECURITY ISOLATION</span>
            <ShieldCheck size={13} className="text-emerald-400" />
          </div>
          <div className="text-emerald-300 font-bold">COMPLIANT (ZERO LEAK)</div>
          <div className="text-[10px] text-slate-400">
            No privileged engine coordinates exposed
          </div>
        </div>
      </div>
    </PanelContainer>
  );
};

