export type RobotStateName = 
  | "Idle" 
  | "Locate" 
  | "Go to object" 
  | "Carry" 
  | "Blocked" 
  | "Done" 
  | "Failed";

export type TaskResultType = "pass" | "fail_not_reached" | null;

export interface RobotState {
  state: RobotStateName;
  x: number;
  y: number;
  heading: number; // 0..360, 0 is +X, positive is clockwise
  holding: boolean;
  retry_count: number;
  collided: boolean;
  result?: TaskResultType;
}

export interface DepthResponse {
  distance: number | null;
}

export interface HealthResponse {
  ok: boolean;
}

export interface MoveResponse {
  moved: number;
  collided: boolean;
  retry_count?: number;
  backed_off?: number;
  failed?: boolean;
}

export interface TurnResponse {
  turned: number;
  collided: boolean;
  retry_count?: number;
  failed?: boolean;
}

export interface PickupResponse {
  success: boolean;
}

export interface DropResponse {
  released: boolean;
  in_drop_zone: boolean;
  result: TaskResultType;
}

export interface TaskStartResponse {
  status: "started" | "duplicate";
  task_id: string;
  task_status: string;
  active_task_id?: string;
  robot_state?: RobotState;
}

export interface PerceptionDetection {
  id: string;
  label: string;
  confidence: number;
  trackingStatus: "tracking" | "lost" | "candidate";
  lastUpdated: string;
  bbox?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] in normalized 0..1 coordinates
}

export type StageStatus = "pending" | "running" | "completed" | "failed";

export interface TaskStage {
  id: number;
  name: string;
  status: StageStatus;
  description: string;
  timestamp?: string;
}

export type LogSeverity = "INFO" | "WARNING" | "ERROR" | "SUCCESS";

export interface EventLogItem {
  id: string;
  timestamp: string;
  component: "SIM" | "CAMERA" | "DEPTH" | "MOTION" | "GRIPPER" | "AGENT" | "SYSTEM";
  event: string;
  severity: LogSeverity;
}

export interface KeyframeItem {
  id: string;
  frameNumber: number;
  timestamp: string;
  action: string;
  imageUrl: string;
  telemetry: {
    x: number;
    y: number;
    heading: number;
  };
}

export interface TelemetryPoint {
  time: string;
  x: number;
  y: number;
  heading: number;
  distance: number | null;
}

