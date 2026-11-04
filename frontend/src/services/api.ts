import {
  RobotState,
  DepthResponse,
  HealthResponse,
  MoveResponse,
  TurnResponse,
  PickupResponse,
  DropResponse,
  TaskStartResponse,
} from '../types/robot';

const DEFAULT_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

class ApiService {
  private baseUrl: string;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  private async fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 4000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  public async getHealth(): Promise<HealthResponse> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/health`, {}, 2500);
    if (!res.ok) throw new Error(`Health check failed: HTTP ${res.status}`);
    return res.json();
  }

  public async getState(): Promise<RobotState> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/state`, {}, 2500);
    if (!res.ok) throw new Error(`Get state failed: HTTP ${res.status}`);
    return res.json();
  }

  public getLookUrl(): string {
    return `${this.baseUrl}/look?t=${Date.now()}`;
  }

  public async getLookBlob(): Promise<Blob> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/look`, {
      headers: { Accept: 'image/jpeg' },
    }, 4000);
    if (!res.ok) throw new Error(`Get look image failed: HTTP ${res.status}`);
    return res.blob();
  }

  public async getDepth(): Promise<DepthResponse> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/depth`, {}, 2500);
    if (!res.ok) throw new Error(`Get depth failed: HTTP ${res.status}`);
    return res.json();
  }

  public async move(distance: number): Promise<MoveResponse> {
    // Clamped per API contract [-1.0, 1.0]
    const clamped = Math.max(-1.0, Math.min(1.0, distance));
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/move`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distance: clamped }),
      },
      8000
    );
    if (!res.ok) throw new Error(`Move command failed: HTTP ${res.status}`);
    return res.json();
  }

  public async turn(degrees: number): Promise<TurnResponse> {
    // Clamped per API contract [-90.0, 90.0]
    const clamped = Math.max(-90.0, Math.min(90.0, degrees));
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/turn`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ degrees: clamped }),
      },
      8000
    );
    if (!res.ok) throw new Error(`Turn command failed: HTTP ${res.status}`);
    return res.json();
  }

  public async pickup(): Promise<PickupResponse> {
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/pickup`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      4000
    );
    if (!res.ok) throw new Error(`Pickup command failed: HTTP ${res.status}`);
    return res.json();
  }

  public async drop(): Promise<DropResponse> {
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/drop`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      4000
    );
    if (!res.ok) throw new Error(`Drop command failed: HTTP ${res.status}`);
    return res.json();
  }

  public async startTask(taskId: string): Promise<TaskStartResponse> {
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/task/start`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId }),
      },
      4000
    );
    if (!res.ok) throw new Error(`Task start failed: HTTP ${res.status}`);
    return res.json();
  }
}

export const api = new ApiService();
export default api;

