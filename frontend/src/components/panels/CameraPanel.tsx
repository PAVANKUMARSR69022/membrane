import React, { useState, useRef } from 'react';
import {
  Camera,
  Maximize2,
  Minimize2,
  Crosshair,
  Layers,
  Sparkles,
  CameraOff,
  Sliders,
} from 'lucide-react';
import { PanelContainer } from '../common/PanelContainer';
import { PerceptionDetection } from '../../types/robot';

interface CameraPanelProps {
  cameraUrl: string;
  cameraTimestamp: number;
  isConnected: boolean;
  fps: number;
  onFpsChange: (fps: number) => void;
  detections?: PerceptionDetection[];
  onCaptureSnapshot?: () => void;
}

export const CameraPanel: React.FC<CameraPanelProps> = ({
  cameraUrl,
  cameraTimestamp,
  isConnected,
  fps,
  onFpsChange,
  detections = [],
  onCaptureSnapshot,
}) => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showReticle, setShowReticle] = useState<boolean>(true);
  const [showPerceptionOverlay, setShowPerceptionOverlay] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const formattedTime = new Date(cameraTimestamp).toISOString().split('T')[1].replace('Z', '');

  return (
    <PanelContainer
      title="Optical Perception Stream"
      subtitle="GET /look — 640x480 JPEG (90° H-FOV, -10° Tilt, 0.5m Z)"
      icon={<Camera size={16} />}
      actions={
        <div className="flex items-center gap-2">
          {/* FPS Selector */}
          <div className="flex items-center gap-1 bg-[#090d14] px-2 py-0.5 rounded border border-[#1f2a40] text-[11px] font-mono text-slate-400">
            <Sliders size={12} className="text-slate-500" />
            <span>STREAM:</span>
            {[1, 5, 10].map((rate) => (
              <button
                key={rate}
                onClick={() => onFpsChange(rate)}
                className={`px-1.5 py-0.2 rounded transition-colors ${
                  fps === rate
                    ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                    : 'hover:text-slate-200'
                }`}
              >
                {rate}Hz
              </button>
            ))}
          </div>

          {/* Crosshair toggle */}
          <button
            onClick={() => setShowReticle(!showReticle)}
            className={`p-1.5 rounded border transition-colors ${
              showReticle
                ? 'bg-cyan-950/60 border-cyan-500/50 text-cyan-300'
                : 'bg-[#121826] border-[#1f2a40] text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle Aiming Reticle"
          >
            <Crosshair size={14} />
          </button>

          {/* Perception Overlay toggle */}
          <button
            onClick={() => setShowPerceptionOverlay(!showPerceptionOverlay)}
            className={`p-1.5 rounded border transition-colors ${
              showPerceptionOverlay
                ? 'bg-purple-950/60 border-purple-500/50 text-purple-300'
                : 'bg-[#121826] border-[#1f2a40] text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle Perception Bounding Boxes"
          >
            <Layers size={14} />
          </button>

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded border border-[#1f2a40] bg-[#121826] hover:bg-[#1a2336] text-slate-400 hover:text-cyan-300 transition-colors"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      }
    >
      <div
        ref={containerRef}
        className="relative w-full aspect-[4/3] max-h-[460px] bg-black rounded border border-[#1f2a40] overflow-hidden flex items-center justify-center select-none group"
      >
        {/* Main Camera Image */}
        {cameraUrl ? (
          <img
            src={cameraUrl}
            alt="Robot Camera Stream"
            className="w-full h-full object-contain pointer-events-none"
            crossOrigin="anonymous"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-600 font-mono text-xs gap-2">
            <CameraOff size={32} />
            <span>NO FRAME BUFFER AVAILABLE</span>
          </div>
        )}

        {/* Scanline & Technical Vignette Effect */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_60%,rgba(0,0,0,0.6)_100%)]" />

        {/* Technical HUD Overlays: Corner Brackets */}
        <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-cyan-500/70 pointer-events-none" />
        <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-cyan-500/70 pointer-events-none" />
        <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-cyan-500/70 pointer-events-none" />
        <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-cyan-500/70 pointer-events-none" />

        {/* Aiming Reticle & Horizon line */}
        {showReticle && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* Center crosshair */}
            <div className="relative w-16 h-16 flex items-center justify-center">
              <div className="absolute w-full h-[1px] bg-cyan-400/40" />
              <div className="absolute h-full w-[1px] bg-cyan-400/40" />
              <div className="w-5 h-5 rounded-full border border-cyan-400/60" />
              <div className="w-1 h-1 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.9)]" />
            </div>

            {/* Pitch Horizon indicator */}
            <div className="absolute top-[60%] w-32 border-b border-dashed border-cyan-500/30 flex justify-between text-[9px] font-mono text-cyan-500/60 px-1">
              <span>-10°</span>
              <span>HORIZON</span>
              <span>-10°</span>
            </div>
          </div>
        )}

        {/* Perception Layer / Bounding Boxes */}
        {showPerceptionOverlay && (
          <div className="absolute inset-0 pointer-events-none">
            {detections.length > 0 ? (
              detections.map((det) => {
                if (!det.bbox) return null;
                const [ymin, xmin, ymax, xmax] = det.bbox;
                const top = `${ymin * 100}%`;
                const left = `${xmin * 100}%`;
                const width = `${(xmax - xmin) * 100}%`;
                const height = `${(ymax - ymin) * 100}%`;

                return (
                  <div
                    key={det.id}
                    className="absolute border-2 border-cyan-400 bg-cyan-500/10 transition-all duration-150"
                    style={{ top, left, width, height }}
                  >
                    <div className="absolute -top-5 left-0 bg-cyan-950/90 border border-cyan-400 text-cyan-300 font-mono text-[10px] px-1 py-0.2 rounded-t flex items-center gap-1 whitespace-nowrap">
                      <Sparkles size={10} className="text-cyan-400" />
                      <span>{det.label.toUpperCase()}</span>
                      <span className="text-cyan-400/80">({Math.round(det.confidence * 100)}%)</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="absolute top-4 left-12 bg-black/70 border border-purple-500/30 px-2.5 py-1 rounded backdrop-blur-sm flex items-center gap-2 font-mono text-[10px] text-purple-300">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                <span>PERCEPTION AGENT STANDBY: AWAITING DETECTION FEED</span>
              </div>
            )}
          </div>
        )}

        {/* Top-Right HUD Badge: Stream Stats */}
        <div className="absolute top-4 right-12 bg-black/70 border border-[#1f2a40] px-2.5 py-1 rounded backdrop-blur-sm font-mono text-[10px] text-slate-300 flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
              }`}
            />
            <span className={isConnected ? 'text-emerald-400' : 'text-rose-400'}>
              {isConnected ? 'LIVE FEED' : 'OFFLINE SNAPSHOT'}
            </span>
          </div>
          <span className="text-slate-600">|</span>
          <span>{fps} FPS</span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">{formattedTime}</span>
        </div>

        {/* Bottom Bar: Snapshot Capture trigger */}
        {onCaptureSnapshot && (
          <div className="absolute bottom-3 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onCaptureSnapshot}
              className="bg-black/80 hover:bg-cyan-950 border border-cyan-500/50 text-cyan-300 font-mono text-xs px-2.5 py-1 rounded flex items-center gap-1.5 backdrop-blur-md transition-all shadow-lg"
            >
              <Camera size={13} />
              <span>SNAP KEYFRAME</span>
            </button>
          </div>
        )}
      </div>
    </PanelContainer>
  );
};

