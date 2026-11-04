import React, { useEffect } from 'react';
import { RobotControls } from '../components/panels/RobotControls';
import { CameraPanel } from '../components/panels/CameraPanel';
import { DepthPanel } from '../components/panels/DepthPanel';
import { RobotState } from '../types/robot';

interface RobotControlPageProps {
  isConnected: boolean;
  robotState: RobotState;
  depthDistance: number | null;
  cameraUrl: string;
  cameraTimestamp: number;
  cameraFps: number;
  onFpsChange: (fps: number) => void;
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

export const RobotControlPage: React.FC<RobotControlPageProps> = ({
  isConnected,
  robotState,
  depthDistance,
  cameraUrl,
  cameraTimestamp,
  cameraFps,
  onFpsChange,
  isExecutingAction,
  lastActionFeedback,
  onMove,
  onTurn,
  onPickup,
  onDrop,
}) => {
  // Global Hotkey listeners for teleoperation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (!isConnected || isExecutingAction) return;

      const key = e.key.toLowerCase();
      if (key === 'w' || key === 'arrowup') {
        e.preventDefault();
        onMove(0.5);
      } else if (key === 's' || key === 'arrowdown') {
        e.preventDefault();
        onMove(-0.5);
      } else if (key === 'a' || key === 'arrowleft') {
        e.preventDefault();
        onTurn(-45.0);
      } else if (key === 'd' || key === 'arrowright') {
        e.preventDefault();
        onTurn(45.0);
      } else if (key === 'e') {
        e.preventDefault();
        if (!robotState.holding) onPickup();
      } else if (key === 'q') {
        e.preventDefault();
        if (robotState.holding) onDrop();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConnected, isExecutingAction, robotState.holding, onMove, onTurn, onPickup, onDrop]);

  return (
    <div className="p-4 space-y-4 max-w-[1920px] mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Camera Feed for Manual Driving */}
        <CameraPanel
          cameraUrl={cameraUrl}
          cameraTimestamp={cameraTimestamp}
          isConnected={isConnected}
          fps={cameraFps}
          onFpsChange={onFpsChange}
        />

        {/* Right: Controls & Rangefinder */}
        <div className="space-y-4">
          <DepthPanel distance={depthDistance} />
          <RobotControls
            isConnected={isConnected}
            robotState={robotState}
            isExecutingAction={isExecutingAction}
            lastActionFeedback={lastActionFeedback}
            onMove={onMove}
            onTurn={onTurn}
            onPickup={onPickup}
            onDrop={onDrop}
          />
        </div>
      </div>
    </div>
  );
};

