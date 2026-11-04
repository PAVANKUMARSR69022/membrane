import React, { useState, useCallback } from 'react';
import { Sidebar, NavTabId } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { Dashboard } from './pages/Dashboard';
import { SimulationPage } from './pages/Simulation';
import { RobotControlPage } from './pages/RobotControl';
import { RecordingsPage } from './pages/Recordings';
import { SettingsPage } from './pages/Settings';

import { CameraPanel } from './components/panels/CameraPanel';
import { DetectionPanel } from './components/panels/DetectionPanel';
import { DepthPanel } from './components/panels/DepthPanel';
import { TaskTimeline } from './components/panels/TaskTimeline';
import { EventLogs } from './components/panels/EventLogs';
import { SystemDetails } from './components/panels/SystemDetails';

import { useBackendStatus } from './hooks/useBackendStatus';
import { useRobotState } from './hooks/useRobotState';
import { useEventLogs } from './hooks/useEventLogs';
import { INITIAL_TASK_STAGES, EMPTY_DETECTIONS } from './services/mockData';
import api from './services/api';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTabId>('dashboard');
  const [cameraFps, setCameraFps] = useState<number>(5);
  const [taskStages, setTaskStages] = useState(INITIAL_TASK_STAGES);
  const [currentTaskId, setCurrentTaskId] = useState<string>('mission_search_recover_01');
  const [isStartingTask, setIsStartingTask] = useState<boolean>(false);

  // Backend link health
  const { status: connectionStatus, pingMs, recheck: recheckHealth } = useBackendStatus(2500);
  const isConnected = connectionStatus === 'connected';

  // Event Logs hook
  const {
    logs,
    allLogsCount,
    severityFilter,
    setSeverityFilter,
    searchQuery,
    setSearchQuery,
    autoScroll,
    setAutoScroll,
    addLog,
    clearLogs,
  } = useEventLogs();

  // Authoritative Robot State & Actions hook
  const {
    robotState,
    depthDistance,
    cameraUrl,
    cameraTimestamp,
    telemetryHistory,
    keyframes,
    isExecutingAction,
    lastActionFeedback,
    executeMove,
    executeTurn,
    executePickup,
    executeDrop,
    captureKeyframe,
  } = useRobotState({
    isConnected,
    telemetryIntervalMs: 250,
    cameraFps,
    onLogEvent: addLog,
  });

  // Start Task Executor
  const handleStartTask = useCallback(async (taskId: string) => {
    setIsStartingTask(true);
    addLog({
      component: 'SYSTEM',
      event: `Dispatching POST /task/start: [${taskId}]`,
      severity: 'INFO',
    });

    try {
      const res = await api.startTask(taskId);
      addLog({
        component: 'SYSTEM',
        event: `Task transition acknowledged: ${res.task_status} (${res.status})`,
        severity: 'SUCCESS',
      });
      // Mark Stage 1 completed and Stage 2 running in UI
      setTaskStages((prev) =>
        prev.map((stage) => {
          if (stage.id === 1) return { ...stage, status: 'completed' };
          if (stage.id === 2) return { ...stage, status: 'running' };
          return stage;
        })
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Task start failed';
      addLog({
        component: 'SYSTEM',
        event: `Task start rejected: ${msg}`,
        severity: 'WARNING',
      });
    } finally {
      setIsStartingTask(false);
    }
  }, [addLog]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#090d14] text-slate-100">
      {/* 1. Left Fixed Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        backendConnected={isConnected}
      />

      {/* 2. Main Workstation Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header */}
        <Header
          connectionStatus={connectionStatus}
          pingMs={pingMs}
          robotState={robotState}
          currentTaskName={currentTaskId.toUpperCase()}
          onRefreshConnection={recheckHealth}
        />

        {/* Viewport Content Area */}
        <main className="flex-1 overflow-y-auto bg-tech-grid">
          {currentTab === 'dashboard' && (
            <Dashboard
              connectionStatus={connectionStatus}
              pingMs={pingMs}
              robotState={robotState}
              depthDistance={depthDistance}
              cameraUrl={cameraUrl}
              cameraTimestamp={cameraTimestamp}
              cameraFps={cameraFps}
              onFpsChange={setCameraFps}
              telemetryHistory={telemetryHistory}
              keyframes={keyframes}
              logs={logs}
              allLogsCount={allLogsCount}
              severityFilter={severityFilter}
              onSeverityFilterChange={setSeverityFilter}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              autoScroll={autoScroll}
              onAutoScrollToggle={() => setAutoScroll(!autoScroll)}
              onClearLogs={clearLogs}
              taskStages={taskStages}
              currentTaskId={currentTaskId}
              onStartTask={handleStartTask}
              isStartingTask={isStartingTask}
              detections={EMPTY_DETECTIONS}
              isExecutingAction={isExecutingAction}
              lastActionFeedback={lastActionFeedback}
              onMove={executeMove}
              onTurn={executeTurn}
              onPickup={executePickup}
              onDrop={executeDrop}
              onCaptureSnapshot={() => captureKeyframe('MANUAL_SNAPSHOT')}
            />
          )}

          {currentTab === 'simulation' && (
            <SimulationPage
              robotState={robotState}
              telemetryHistory={telemetryHistory}
            />
          )}

          {currentTab === 'control' && (
            <RobotControlPage
              isConnected={isConnected}
              robotState={robotState}
              depthDistance={depthDistance}
              cameraUrl={cameraUrl}
              cameraTimestamp={cameraTimestamp}
              cameraFps={cameraFps}
              onFpsChange={setCameraFps}
              isExecutingAction={isExecutingAction}
              lastActionFeedback={lastActionFeedback}
              onMove={executeMove}
              onTurn={executeTurn}
              onPickup={executePickup}
              onDrop={executeDrop}
            />
          )}

          {currentTab === 'camera' && (
            <div className="p-4 max-w-5xl mx-auto">
              <CameraPanel
                cameraUrl={cameraUrl}
                cameraTimestamp={cameraTimestamp}
                isConnected={isConnected}
                fps={cameraFps}
                onFpsChange={setCameraFps}
                detections={EMPTY_DETECTIONS}
                onCaptureSnapshot={() => captureKeyframe('MANUAL_SNAPSHOT')}
              />
            </div>
          )}

          {currentTab === 'detection' && (
            <div className="p-4 max-w-5xl mx-auto">
              <DetectionPanel detections={EMPTY_DETECTIONS} />
            </div>
          )}

          {currentTab === 'depth' && (
            <div className="p-4 max-w-4xl mx-auto">
              <DepthPanel distance={depthDistance} />
            </div>
          )}

          {currentTab === 'tasks' && (
            <div className="p-4 max-w-6xl mx-auto">
              <TaskTimeline
                stages={taskStages}
                currentTaskId={currentTaskId}
                onStartTask={handleStartTask}
                isStartingTask={isStartingTask}
              />
            </div>
          )}

          {currentTab === 'logs' && (
            <div className="p-4 max-w-6xl mx-auto">
              <EventLogs
                logs={logs}
                allLogsCount={allLogsCount}
                severityFilter={severityFilter}
                onSeverityFilterChange={setSeverityFilter}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                autoScroll={autoScroll}
                onAutoScrollToggle={() => setAutoScroll(!autoScroll)}
                onClear={clearLogs}
              />
            </div>
          )}

          {currentTab === 'recordings' && (
            <RecordingsPage keyframes={keyframes} />
          )}

          {currentTab === 'apistatus' && (
            <div className="p-4 max-w-6xl mx-auto">
              <SystemDetails
                connectionStatus={connectionStatus}
                pingMs={pingMs}
                robotState={robotState}
                currentTask={currentTaskId}
                cameraFps={cameraFps}
                keyframeCount={keyframes.length}
              />
            </div>
          )}

          {currentTab === 'settings' && (
            <SettingsPage
              currentFps={cameraFps}
              onFpsChange={setCameraFps}
              onRecheckConnection={recheckHealth}
            />
          )}
        </main>
      </div>
    </div>
  );
};
export default App;

