import React from 'react';
import { CameraPanel } from '../components/panels/CameraPanel';
import { SimulationPanel } from '../components/panels/SimulationPanel';
import { TelemetryPanel } from '../components/panels/TelemetryPanel';
import { DepthPanel } from '../components/panels/DepthPanel';
import { DetectionPanel } from '../components/panels/DetectionPanel';
import { TaskTimeline } from '../components/panels/TaskTimeline';
import { EventLogs } from '../components/panels/EventLogs';
import { Keyframes } from '../components/panels/Keyframes';
import { RobotControls } from '../components/panels/RobotControls';
import { SystemDetails } from '../components/panels/SystemDetails';

import {
  RobotState,
  TelemetryPoint,
  KeyframeItem,
  EventLogItem,
  TaskStage,
  PerceptionDetection,
} from '../types/robot';
import { BackendConnectionState } from '../hooks/useBackendStatus';

interface DashboardProps {
  connectionStatus: BackendConnectionState;
  pingMs: number;
  robotState: RobotState;
  depthDistance: number | null;
  cameraUrl: string;
  cameraTimestamp: number;
  cameraFps: number;
  onFpsChange: (fps: number) => void;
  telemetryHistory: TelemetryPoint[];
  keyframes: KeyframeItem[];
  logs: EventLogItem[];
  allLogsCount: number;
  severityFilter: string;
  onSeverityFilterChange: (filter: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  autoScroll: boolean;
  onAutoScrollToggle: () => void;
  onClearLogs: () => void;
  taskStages: TaskStage[];
  currentTaskId: string;
  onStartTask: (taskId: string) => void;
  isStartingTask: boolean;
  detections: PerceptionDetection[];
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
  onCaptureSnapshot: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  connectionStatus,
  pingMs,
  robotState,
  depthDistance,
  cameraUrl,
  cameraTimestamp,
  cameraFps,
  onFpsChange,
  telemetryHistory,
  keyframes,
  logs,
  allLogsCount,
  severityFilter,
  onSeverityFilterChange,
  searchQuery,
  onSearchChange,
  autoScroll,
  onAutoScrollToggle,
  onClearLogs,
  taskStages,
  currentTaskId,
  onStartTask,
  isStartingTask,
  detections,
  isExecutingAction,
  lastActionFeedback,
  onMove,
  onTurn,
  onPickup,
  onDrop,
  onCaptureSnapshot,
}) => {
  const isConnected = connectionStatus === 'connected';

  return (
    <div className="p-4 space-y-4 max-w-[1920px] mx-auto">
      {/* 1. Primary Viewports Grid (Camera + 3D Sim) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Left: Main Camera Perception Feed */}
        <CameraPanel
          cameraUrl={cameraUrl}
          cameraTimestamp={cameraTimestamp}
          isConnected={isConnected}
          fps={cameraFps}
          onFpsChange={onFpsChange}
          detections={detections}
          onCaptureSnapshot={onCaptureSnapshot}
        />

        {/* Right: 3D Digital Twin Arena */}
        <SimulationPanel robotState={robotState} />
      </div>

      {/* 2. Telemetry and Depth Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <TelemetryPanel
            robotState={robotState}
            telemetryHistory={telemetryHistory}
          />
        </div>
        <div className="lg:col-span-1">
          <DepthPanel distance={depthDistance} />
        </div>
      </div>

      {/* 3. Controls and Perception Detection */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

        <DetectionPanel detections={detections} />
      </div>

      {/* 4. Operations: Task Execution Timeline */}
      <TaskTimeline
        stages={taskStages}
        currentTaskId={currentTaskId}
        onStartTask={onStartTask}
        isStartingTask={isStartingTask}
      />

      {/* 5. Logs and Keyframe Archive */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EventLogs
          logs={logs}
          allLogsCount={allLogsCount}
          severityFilter={severityFilter}
          onSeverityFilterChange={onSeverityFilterChange}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          autoScroll={autoScroll}
          onAutoScrollToggle={onAutoScrollToggle}
          onClear={onClearLogs}
        />

        <Keyframes keyframes={keyframes} />
      </div>

      {/* 6. System Details & Diagnostic Health */}
      <SystemDetails
        connectionStatus={connectionStatus}
        pingMs={pingMs}
        robotState={robotState}
        currentTask={currentTaskId}
        cameraFps={cameraFps}
        keyframeCount={keyframes.length}
      />
    </div>
  );
};

