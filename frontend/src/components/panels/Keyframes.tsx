import React, { useState } from 'react';
import { Film, Maximize2, X, MapPin, Compass } from 'lucide-react';
import { PanelContainer } from '../common/PanelContainer';
import { KeyframeItem } from '../../types/robot';

interface KeyframesProps {
  keyframes: KeyframeItem[];
}

export const Keyframes: React.FC<KeyframesProps> = ({ keyframes }) => {
  const [selectedKeyframe, setSelectedKeyframe] = useState<KeyframeItem | null>(null);

  return (
    <PanelContainer
      title="Recent Keyframe Captures"
      subtitle="Visual State Snapshots tagged with Action & Pose"
      icon={<Film size={16} />}
      actions={
        <span className="font-mono text-[10px] text-slate-500">
          {keyframes.length} FRAMES
        </span>
      }
    >
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-3 min-w-full">
          {keyframes.map((kf) => (
            <div
              key={kf.id}
              onClick={() => setSelectedKeyframe(kf)}
              className="w-48 shrink-0 bg-[#090d14] rounded border border-[#1f2a40] hover:border-cyan-500/50 p-2 cursor-pointer transition-all hover:shadow-[0_0_12px_rgba(6,182,212,0.15)] group font-mono"
            >
              {/* Thumbnail image with action tag */}
              <div className="relative aspect-[4/3] rounded overflow-hidden bg-black mb-1.5 border border-[#1a2336]">
                <img
                  src={kf.imageUrl}
                  alt={`Frame #${kf.frameNumber}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
                <div className="absolute top-1 left-1 bg-black/80 px-1.5 py-0.2 rounded text-[9px] text-cyan-300 font-bold border border-cyan-500/30">
                  #{kf.frameNumber}
                </div>
                <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-cyan-950/90 text-cyan-300 p-1 rounded border border-cyan-500/40">
                  <Maximize2 size={11} />
                </div>
              </div>

              {/* Action and Timestamp */}
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-slate-200 font-semibold truncate max-w-[100px]">
                  {kf.action}
                </span>
                <span className="text-slate-500">{kf.timestamp}</span>
              </div>

              {/* Telemetry Snapshot */}
              <div className="text-[9px] text-slate-500 flex items-center justify-between pt-1 border-t border-[#1a2336]">
                <span>
                  X:{kf.telemetry.x.toFixed(2)} Y:{kf.telemetry.y.toFixed(2)}
                </span>
                <span>{kf.telemetry.heading.toFixed(0)}°</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Keyframe Modal Inspector */}
      {selectedKeyframe && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f1420] border border-[#1f2a40] rounded-lg max-w-2xl w-full overflow-hidden shadow-2xl font-mono">
            {/* Header */}
            <div className="bg-[#141a29] px-4 py-2.5 border-b border-[#1f2a40] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Film size={16} className="text-cyan-400" />
                <span className="text-sm font-bold text-slate-200">
                  KEYFRAME #{selectedKeyframe.frameNumber} INSPECTOR
                </span>
              </div>
              <button
                onClick={() => setSelectedKeyframe(null)}
                className="text-slate-400 hover:text-rose-400 p-1 rounded"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              <div className="aspect-[4/3] w-full bg-black rounded border border-[#1f2a40] overflow-hidden">
                <img
                  src={selectedKeyframe.imageUrl}
                  alt="High-Res Keyframe Preview"
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Metadata details */}
              <div className="grid grid-cols-3 gap-2 bg-[#090d14] p-3 rounded border border-[#1f2a40] text-xs">
                <div>
                  <div className="text-[10px] text-slate-500">ASSOCIATED ACTION</div>
                  <div className="text-cyan-300 font-bold mt-0.5">
                    {selectedKeyframe.action}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">TIMESTAMP</div>
                  <div className="text-slate-200 mt-0.5">
                    {selectedKeyframe.timestamp}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">ROBOT POSE</div>
                  <div className="text-emerald-400 font-bold mt-0.5 flex items-center gap-2">
                    <span className="flex items-center gap-0.5">
                      <MapPin size={11} />
                      [{selectedKeyframe.telemetry.x.toFixed(2)},{' '}
                      {selectedKeyframe.telemetry.y.toFixed(2)}]
                    </span>
                    <span className="flex items-center gap-0.5 text-cyan-300">
                      <Compass size={11} />
                      {selectedKeyframe.telemetry.heading.toFixed(1)}°
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </PanelContainer>
  );
};

