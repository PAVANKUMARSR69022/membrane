import React from 'react';
import { Scan, ShieldAlert, Cpu } from 'lucide-react';
import { PanelContainer } from '../common/PanelContainer';
import { PerceptionDetection } from '../../types/robot';

interface DetectionPanelProps {
  detections: PerceptionDetection[];
}

export const DetectionPanel: React.FC<DetectionPanelProps> = ({ detections }) => {
  return (
    <PanelContainer
      title="Perception & Object Detection"
      subtitle="Claude Vision Inference Pipeline"
      icon={<Scan size={16} />}
      actions={
        <div className="font-mono text-[10px] px-2 py-0.5 rounded bg-purple-950/40 border border-purple-500/30 text-purple-300">
          AGENT STATUS: {detections.length > 0 ? 'ACTIVE' : 'STANDBY'}
        </div>
      }
    >
      {detections.length === 0 ? (
        <div className="bg-[#090d14] rounded border border-[#1f2a40] p-6 flex flex-col items-center justify-center text-center font-mono">
          <div className="relative w-12 h-12 rounded-full border border-purple-500/40 flex items-center justify-center mb-3 bg-purple-950/20">
            <Scan size={22} className="text-purple-400 animate-pulse" />
            <div className="absolute inset-0 rounded-full border border-purple-500/20 animate-ping" />
          </div>

          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            PERCEPTION AGENT NOT CONNECTED
          </h4>
          <p className="text-[11px] text-slate-400 max-w-sm mt-1.5 leading-relaxed">
            The Claude multimodal perception agent is currently in offline / mock state. Visual detection classes, confidence ratings, and bounding boxes will stream here once the inference worker connects.
          </p>

          <div className="mt-4 pt-3 border-t border-[#1f2a40] w-full max-w-md flex items-center justify-center gap-2 text-[10px] text-slate-500">
            <ShieldAlert size={12} className="text-amber-400" />
            <span>
              PRIVILEGED ENGINE ISOLATION: Simulator ground-truth objects are never leaked.
            </span>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs text-left">
            <thead>
              <tr className="border-b border-[#1f2a40] text-slate-500 text-[10px] uppercase">
                <th className="pb-2 font-medium">Detection Label</th>
                <th className="pb-2 font-medium">Confidence</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f2a40]/50">
              {detections.map((det) => (
                <tr key={det.id} className="hover:bg-[#141b2a]/40 transition-colors">
                  <td className="py-2 text-cyan-300 font-semibold flex items-center gap-1.5">
                    <Cpu size={12} className="text-cyan-400" />
                    <span>{det.label}</span>
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-[#090d14] rounded-full overflow-hidden border border-[#1f2a40]">
                        <div
                          className="h-full bg-cyan-400"
                          style={{ width: `${Math.round(det.confidence * 100)}%` }}
                        />
                      </div>
                      <span className="text-slate-300">
                        {Math.round(det.confidence * 100)}%
                      </span>
                    </div>
                  </td>
                  <td className="py-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] uppercase border ${
                        det.trackingStatus === 'tracking'
                          ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-300'
                          : det.trackingStatus === 'candidate'
                          ? 'border-amber-500/40 bg-amber-950/60 text-amber-300'
                          : 'border-slate-700 bg-slate-900 text-slate-400'
                      }`}
                    >
                      {det.trackingStatus}
                    </span>
                  </td>
                  <td className="py-2 text-right text-slate-400 text-[11px]">
                    {det.lastUpdated}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelContainer>
  );
};

