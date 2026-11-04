import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import {
  RobotState,
  TelemetryPoint,
  KeyframeItem,
  EventLogItem,
  MoveResponse,
  TurnResponse,
  PickupResponse,
  DropResponse,
} from '../types/robot';
import {
  INITIAL_ROBOT_STATE,
  INITIAL_TELEMETRY_SERIES,
  INITIAL_KEYFRAMES,
} from '../services/mockData';

export interface UseRobotStateOptions {
  isConnected: boolean;
  telemetryIntervalMs?: number;
  cameraFps?: number;
  onLogEvent?: (item: Omit<EventLogItem, 'id' | 'timestamp'>) => void;
}

export function useRobotState({
  isConnected,
  telemetryIntervalMs = 250,
  cameraFps = 5,
  onLogEvent,
}: UseRobotStateOptions) {
  const [robotState, setRobotState] = useState<RobotState>(INITIAL_ROBOT_STATE);
  const [depthDistance, setDepthDistance] = useState<number | null>(3.63);
  const [cameraUrl, setCameraUrl] = useState<string>('/mock_frame.jpg');
  const [cameraTimestamp, setCameraTimestamp] = useState<number>(Date.now());
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryPoint[]>(INITIAL_TELEMETRY_SERIES);
  const [keyframes, setKeyframes] = useState<KeyframeItem[]>(INITIAL_KEYFRAMES);
  const [isExecutingAction, setIsExecutingAction] = useState<boolean>(false);
  const [lastActionFeedback, setLastActionFeedback] = useState<{
    action: string;
    status: 'success' | 'warning' | 'error' | 'idle';
    message: string;
  }>({ action: '', status: 'idle', message: '' });

  const prevBlobUrlRef = useRef<string | null>(null);
  const frameCountRef = useRef<number>(150);
  const isFetchingTelemetryRef = useRef<boolean>(false);
  const isFetchingCameraRef = useRef<boolean>(false);

  // Poll Telemetry & Depth
  useEffect(() => {
    if (!isConnected) return;

    let isMounted = true;
    const fetchTelemetry = async () => {
      if (isFetchingTelemetryRef.current) return;
      isFetchingTelemetryRef.current = true;

      try {
        const [stateRes, depthRes] = await Promise.allSettled([
          api.getState(),
          api.getDepth(),
        ]);

        if (!isMounted) return;

        let newState = robotState;
        if (stateRes.status === 'fulfilled') {
          newState = stateRes.value;
          setRobotState(newState);
        }

        let newDist = depthDistance;
        if (depthRes.status === 'fulfilled') {
          newDist = depthRes.value.distance;
          setDepthDistance(newDist);
        }

        // Append to telemetry history
        if (stateRes.status === 'fulfilled') {
          const now = new Date();
          const timeStr = now.toTimeString().split(' ')[0] + '.' + Math.floor(now.getMilliseconds() / 100);
          setTelemetryHistory((prev) => {
            const next = [
              ...prev,
              {
                time: timeStr,
                x: newState.x,
                y: newState.y,
                heading: newState.heading,
                distance: newDist,
              },
            ];
            return next.length > 50 ? next.slice(next.length - 50) : next;
          });
        }
      } catch (err) {
        console.warn('Telemetry polling error:', err);
      } finally {
        isFetchingTelemetryRef.current = false;
      }
    };

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, telemetryIntervalMs);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isConnected, telemetryIntervalMs]);

  // Poll Camera Frames
  useEffect(() => {
    if (!isConnected || cameraFps <= 0) return;

    let isMounted = true;
    const frameIntervalMs = Math.max(100, Math.floor(1000 / cameraFps));

    const fetchFrame = async () => {
      if (isFetchingCameraRef.current) return;
      isFetchingCameraRef.current = true;

      try {
        const blob = await api.getLookBlob();
        if (!isMounted) return;

        const newUrl = URL.createObjectURL(blob);
        if (prevBlobUrlRef.current && prevBlobUrlRef.current.startsWith('blob:')) {
          URL.revokeObjectURL(prevBlobUrlRef.current);
        }
        prevBlobUrlRef.current = newUrl;
        setCameraUrl(newUrl);
        setCameraTimestamp(Date.now());
      } catch (err) {
        // Silent catch for frame drop to prevent UI jitter
      } finally {
        isFetchingCameraRef.current = false;
      }
    };

    fetchFrame();
    const interval = setInterval(fetchFrame, frameIntervalMs);
    return () => {
      isMounted = false;
      clearInterval(interval);
      if (prevBlobUrlRef.current && prevBlobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(prevBlobUrlRef.current);
      }
    };
  }, [isConnected, cameraFps]);

  // Capture a Keyframe manually or upon notable events
  const captureKeyframe = useCallback((actionName: string) => {
    frameCountRef.current += 1;
    const currentFrameNumber = frameCountRef.current;
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];

    const newKeyframe: KeyframeItem = {
      id: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      frameNumber: currentFrameNumber,
      timestamp: timeStr,
      action: actionName,
      imageUrl: cameraUrl,
      telemetry: {
        x: robotState.x,
        y: robotState.y,
        heading: robotState.heading,
      },
    };

    setKeyframes((prev) => [newKeyframe, ...prev.slice(0, 19)]);
    onLogEvent?.({
      component: 'CAMERA',
      event: `Keyframe #${currentFrameNumber} captured (${actionName})`,
      severity: 'INFO',
    });
  }, [cameraUrl, robotState, onLogEvent]);

  // Action Executors with Concurrency Guard
  const executeMove = useCallback(async (distance: number): Promise<MoveResponse | null> => {
    if (isExecutingAction || !isConnected) return null;
    setIsExecutingAction(true);
    setLastActionFeedback({
      action: `MOVE ${distance > 0 ? '+' : ''}${distance}m`,
      status: 'idle',
      message: 'Executing movement kinematic step...',
    });

    try {
      const res = await api.move(distance);
      if (res.collided) {
        setLastActionFeedback({
          action: `MOVE ${distance}m`,
          status: 'warning',
          message: `Collision detected! Backed off ${res.backed_off ?? 0.1}m (Retry ${res.retry_count})`,
        });
        onLogEvent?.({
          component: 'MOTION',
          event: `Collision during move: backed off ${res.backed_off ?? 0.1}m. Retries: ${res.retry_count}`,
          severity: 'WARNING',
        });
      } else {
        setLastActionFeedback({
          action: `MOVE ${distance}m`,
          status: 'success',
          message: `Displaced +${res.moved}m successfully`,
        });
        onLogEvent?.({
          component: 'MOTION',
          event: `Robot displaced ${res.moved}m forward/backward`,
          severity: 'INFO',
        });
      }
      captureKeyframe(`MOVE_${distance > 0 ? '+' : ''}${distance}m`);
      return res;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Movement failed';
      setLastActionFeedback({
        action: `MOVE ${distance}m`,
        status: 'error',
        message: msg,
      });
      onLogEvent?.({
        component: 'MOTION',
        event: `Movement command rejected: ${msg}`,
        severity: 'ERROR',
      });
      return null;
    } finally {
      setIsExecutingAction(false);
    }
  }, [isExecutingAction, isConnected, onLogEvent, captureKeyframe]);

  const executeTurn = useCallback(async (degrees: number): Promise<TurnResponse | null> => {
    if (isExecutingAction || !isConnected) return null;
    setIsExecutingAction(true);
    setLastActionFeedback({
      action: `TURN ${degrees > 0 ? '+' : ''}${degrees}°`,
      status: 'idle',
      message: 'Executing rotation step...',
    });

    try {
      const res = await api.turn(degrees);
      if (res.collided) {
        setLastActionFeedback({
          action: `TURN ${degrees}°`,
          status: 'warning',
          message: `Turn collided! Restored yaw. Retry ${res.retry_count}`,
        });
        onLogEvent?.({
          component: 'MOTION',
          event: `Collision during rotation: turned ${res.turned}°. Retries: ${res.retry_count}`,
          severity: 'WARNING',
        });
      } else {
        setLastActionFeedback({
          action: `TURN ${degrees}°`,
          status: 'success',
          message: `Turned ${res.turned}° successfully`,
        });
        onLogEvent?.({
          component: 'MOTION',
          event: `Robot rotated ${res.turned}° (${degrees > 0 ? 'Right/CW' : 'Left/CCW'})`,
          severity: 'INFO',
        });
      }
      captureKeyframe(`TURN_${degrees > 0 ? '+' : ''}${degrees}deg`);
      return res;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Turn failed';
      setLastActionFeedback({
        action: `TURN ${degrees}°`,
        status: 'error',
        message: msg,
      });
      onLogEvent?.({
        component: 'MOTION',
        event: `Turn command rejected: ${msg}`,
        severity: 'ERROR',
      });
      return null;
    } finally {
      setIsExecutingAction(false);
    }
  }, [isExecutingAction, isConnected, onLogEvent, captureKeyframe]);

  const executePickup = useCallback(async (): Promise<PickupResponse | null> => {
    if (isExecutingAction || !isConnected) return null;
    setIsExecutingAction(true);
    setLastActionFeedback({
      action: 'PICKUP',
      status: 'idle',
      message: 'Actuating gripper reach & surface contact check...',
    });

    try {
      const res = await api.pickup();
      if (res.success) {
        setLastActionFeedback({
          action: 'PICKUP',
          status: 'success',
          message: 'Object attached successfully. State: Carry',
        });
        onLogEvent?.({
          component: 'GRIPPER',
          event: 'Pickup successful: object securely gripped and attached',
          severity: 'SUCCESS',
        });
      } else {
        setLastActionFeedback({
          action: 'PICKUP',
          status: 'warning',
          message: 'Pickup missed: no eligible candidate within 0.5m reach and ±30°',
        });
        onLogEvent?.({
          component: 'GRIPPER',
          event: 'Pickup failed: no target candidate within reach threshold',
          severity: 'WARNING',
        });
      }
      captureKeyframe(`PICKUP_${res.success ? 'SUCCESS' : 'MISSED'}`);
      return res;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Pickup failed';
      setLastActionFeedback({
        action: 'PICKUP',
        status: 'error',
        message: msg,
      });
      onLogEvent?.({
        component: 'GRIPPER',
        event: `Pickup actuator error: ${msg}`,
        severity: 'ERROR',
      });
      return null;
    } finally {
      setIsExecutingAction(false);
    }
  }, [isExecutingAction, isConnected, onLogEvent, captureKeyframe]);

  const executeDrop = useCallback(async (): Promise<DropResponse | null> => {
    if (isExecutingAction || !isConnected) return null;
    setIsExecutingAction(true);
    setLastActionFeedback({
      action: 'DROP',
      status: 'idle',
      message: 'Releasing held object...',
    });

    try {
      const res = await api.drop();
      if (!res.released) {
        setLastActionFeedback({
          action: 'DROP',
          status: 'warning',
          message: 'Drop ignored: no object currently held',
        });
        onLogEvent?.({
          component: 'GRIPPER',
          event: 'Drop command ignored: gripper was empty',
          severity: 'WARNING',
        });
      } else if (res.in_drop_zone) {
        setLastActionFeedback({
          action: 'DROP',
          status: 'success',
          message: 'Object deposited inside target zone! Result: PASS',
        });
        onLogEvent?.({
          component: 'SIM',
          event: 'Mission target released inside drop zone: PASS!',
          severity: 'SUCCESS',
        });
      } else {
        setLastActionFeedback({
          action: 'DROP',
          status: 'error',
          message: 'Object released OUTSIDE drop zone. Result: FAIL',
        });
        onLogEvent?.({
          component: 'SIM',
          event: 'Object released outside designated zone (fail_not_reached)',
          severity: 'ERROR',
        });
      }
      captureKeyframe(`DROP_${res.in_drop_zone ? 'PASS' : 'OUTSIDE'}`);
      return res;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Drop failed';
      setLastActionFeedback({
        action: 'DROP',
        status: 'error',
        message: msg,
      });
      onLogEvent?.({
        component: 'GRIPPER',
        event: `Drop actuator error: ${msg}`,
        severity: 'ERROR',
      });
      return null;
    } finally {
      setIsExecutingAction(false);
    }
  }, [isExecutingAction, isConnected, onLogEvent, captureKeyframe]);

  return {
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
  };
}

