import {
  RobotState,
  TaskStage,
  EventLogItem,
  KeyframeItem,
  PerceptionDetection,
  TelemetryPoint,
} from '../types/robot';

export const INITIAL_ROBOT_STATE: RobotState = {
  state: "Idle",
  x: 0.0,
  y: 0.0,
  heading: 0.0,
  holding: false,
  retry_count: 0,
  collided: false,
  result: null,
};

export const INITIAL_TASK_STAGES: TaskStage[] = [
  { id: 1, name: "Task Received", status: "completed", description: "Mission payload received and validated", timestamp: "12:00:01" },
  { id: 2, name: "Visual Inspection", status: "completed", description: "Initial 360° panoramic sweep performed", timestamp: "12:00:04" },
  { id: 3, name: "Object Localization", status: "running", description: "Target detection and bearing estimation", timestamp: "12:00:08" },
  { id: 4, name: "Navigation", status: "pending", description: "Kinematic path execution to target reach radius" },
  { id: 5, name: "Pickup", status: "pending", description: "Gripper alignment and surface contact attachment" },
  { id: 6, name: "Transport", status: "pending", description: "Carrying object while avoiding boundary collisions" },
  { id: 7, name: "Drop", status: "pending", description: "Placement into marked drop zone [2.8, 2.8]" },
  { id: 8, name: "Task Completed", status: "pending", description: "Verification of placement and final status report" },
];

export const INITIAL_EVENT_LOGS: EventLogItem[] = [
  { id: "log-1", timestamp: "12:00:00.120", component: "SIM", event: "PyBullet environment initialized (Room 8.0m x 8.0m)", severity: "SUCCESS" },
  { id: "log-2", timestamp: "12:00:00.340", component: "SIM", event: "Fetch robot loaded at pos=[0.0, 0.0, 0.22] yaw=0.0°", severity: "INFO" },
  { id: "log-3", timestamp: "12:00:00.510", component: "CAMERA", event: "Sensor stream online: 640x480 @ 30 FPS, FOV 90.0°", severity: "INFO" },
  { id: "log-4", timestamp: "12:00:00.680", component: "DEPTH", event: "Single-ray rangefinder calibrated at 0.25m height", severity: "INFO" },
  { id: "log-5", timestamp: "12:00:01.000", component: "SYSTEM", event: "FastAPI server listening at http://127.0.0.1:8080", severity: "SUCCESS" },
  { id: "log-6", timestamp: "12:00:01.450", component: "AGENT", event: "Mission manager standby. Task 'search_and_recover_01' queued", severity: "INFO" },
  { id: "log-7", timestamp: "12:00:04.220", component: "MOTION", event: "Yaw sweep executed: +45.0° step completed", severity: "INFO" },
  { id: "log-8", timestamp: "12:00:06.110", component: "DEPTH", event: "Forward ray obstruction detected at 1.84m", severity: "WARNING" },
];

export const INITIAL_KEYFRAMES: KeyframeItem[] = [
  {
    id: "kf-1",
    frameNumber: 104,
    timestamp: "12:00:01",
    action: "LOOK_INIT",
    imageUrl: "/mock_frame.jpg",
    telemetry: { x: 0.0, y: 0.0, heading: 0.0 },
  },
  {
    id: "kf-2",
    frameNumber: 128,
    timestamp: "12:00:04",
    action: "TURN_RIGHT_45",
    imageUrl: "/mock_frame.jpg",
    telemetry: { x: 0.0, y: 0.0, heading: 45.0 },
  },
  {
    id: "kf-3",
    frameNumber: 142,
    timestamp: "12:00:08",
    action: "MOVE_FWD_0.5M",
    imageUrl: "/mock_frame.jpg",
    telemetry: { x: 0.35, y: 0.35, heading: 45.0 },
  },
];

export const INITIAL_TELEMETRY_SERIES: TelemetryPoint[] = [
  { time: "12:00:00", x: 0.0, y: 0.0, heading: 0.0, distance: 3.63 },
  { time: "12:00:02", x: 0.0, y: 0.0, heading: 15.0, distance: 3.52 },
  { time: "12:00:04", x: 0.0, y: 0.0, heading: 45.0, distance: 3.12 },
  { time: "12:00:06", x: 0.15, y: 0.15, heading: 45.0, distance: 2.74 },
  { time: "12:00:08", x: 0.35, y: 0.35, heading: 45.0, distance: 2.21 },
  { time: "12:00:10", x: 0.50, y: 0.50, heading: 45.0, distance: 1.84 },
];

// Note: Per security & competition rules, no simulated ground-truth objects are leaked.
// Detections are null/empty until the Claude agent perception pipe is active.
export const EMPTY_DETECTIONS: PerceptionDetection[] = [];

