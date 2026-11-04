import React from 'react';
import { Radar, AlertCircle, ShieldCheck, ShieldAlert } from 'lucide-react';
import { PanelContainer } from '../common/PanelContainer';

interface DepthPanelProps {
  distance: number | null;
}

export const DepthPanel: React.FC<DepthPanelProps> = ({ distance }) => {
  const maxRange = 10.0;
  const isAvailable = distance !== null && distance !== undefined && !isNaN(distance);
  const percentage = isAvailable ? Math.min(100, Math.max(0, (distance / maxRange) * 100)) : 0;

  // Obstacle proximity alerts
  const isCritical = isAvailable && distance < 0.5;
  const isWarning = isAvailable && distance >= 0.5 && distance < 1.5;

  return (
    <PanelContainer
      title="Forward Depth Probe"
      subtitle="GET /depth — Single-Ray Laser Rangefinder"
      icon={<Radar size={16} />}
    >
      <div className="space-y-3 font-mono">
        {/* Main Digital Readout */}
        <div className="flex items-center justify-between bg-[#090d14] p-3 rounded border border-[#1f2a40]">
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">
              LOS FORWARD DISTANCE
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span
                className={`text-2xl font-bold tracking-tight ${
                  !isAvailable
                    ? 'text-slate-600'
                    : isCritical
                    ? 'text-rose-400'
                    : isWarning
                    ? 'text-amber-300'
                    : 'text-emerald-400'
                }`}
              >
                {isAvailable ? distance.toFixed(3) : 'N/A'}
              </span>
              {isAvailable && <span className="text-xs text-slate-500">meters</span>}
            </div>
          </div>

          {/* Status Badge */}
          <div className="text-right">
            {!isAvailable ? (
              <div className="text-xs text-slate-500 flex items-center gap-1">
                <AlertCircle size={13} />
                <span>NO RETURN / INF</span>
              </div>
            ) : isCritical ? (
              <div className="text-xs text-rose-400 bg-rose-950/60 border border-rose-500/50 px-2 py-0.5 rounded flex items-center gap-1 animate-pulse">
                <ShieldAlert size={13} />
                <span>OBSTACLE PROXIMITY</span>
              </div>
            ) : isWarning ? (
              <div className="text-xs text-amber-300 bg-amber-950/60 border border-amber-500/40 px-2 py-0.5 rounded flex items-center gap-1">
                <ShieldAlert size={13} />
                <span>APPROACHING</span>
              </div>
            ) : (
              <div className="text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded flex items-center gap-1">
                <ShieldCheck size={13} />
                <span>PATH CLEAR</span>
              </div>
            )}
            <div className="text-[9px] text-slate-600 mt-1">RAY ELEVATION: 0.25M</div>
          </div>
        </div>

        {/* Visual Distance Meter Bar */}
        <div>
          <div className="flex justify-between text-[10px] text-slate-500 mb-1">
            <span>0.0m (Gripper Reach: 0.5m)</span>
            <span>5.0m</span>
            <span>10.0m (Max)</span>
          </div>
          <div className="w-full h-3 bg-[#090d14] rounded-sm border border-[#1f2a40] relative overflow-hidden flex items-center">
            {/* Safe / Warning / Critical zone background indicators */}
            <div className="absolute left-0 top-0 bottom-0 w-[5%] bg-rose-950/40 border-r border-rose-500/30" />
            <div className="absolute left-[5%] top-0 bottom-0 w-[10%] bg-amber-950/40 border-r border-amber-500/30" />

            {/* Filled distance bar */}
            {isAvailable && (
              <div
                className={`h-full transition-all duration-150 ${
                  isCritical
                    ? 'bg-rose-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]'
                    : isWarning
                    ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                    : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                }`}
                style={{ width: `${percentage}%` }}
              />
            )}
          </div>
        </div>

        {/* Explicit Sensor Specification Banner */}
        <div className="bg-[#121826]/70 border border-[#1f2a40] px-2.5 py-1.5 rounded text-[10px] text-slate-400 leading-relaxed">
          <span className="text-cyan-400 font-semibold">1D RAYCAST SENSOR:</span> Line-of-sight scalar distance along robot heading. This is NOT a 2D/3D depth camera point cloud.
        </div>
      </div>
    </PanelContainer>
  );
};

