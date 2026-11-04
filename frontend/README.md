# Membrane Robot — Professional Robotics Control Dashboard

A high-density, dark industrial command and control dashboard built for the **Membrane Robot** simulation platform.

Inspired by real-world robotics laboratory digital twin operations centers (DARPA SubT, NASA JPL Ops, Fetch Core, ROS RViz2 Web).

---

## Architecture & Integration

- **Frontend Framework**: React 18 + TypeScript + Vite 6
- **Styling**: Tailwind CSS (dark charcoal industrial aesthetic, cyan/emerald/amber/rose telemetry indicators)
- **Icons**: Lucide React
- **Charts**: Recharts (2D odometry trajectory scatter plot and heading time-series)
- **3D Digital Twin Viewport**: Three.js WebGL canvas displaying the authoritative 8.0m × 8.0m arena, kinematic robot model, heading vector, and forward camera FOV frustum
- **Backend Communication**: Typed REST API service with automated health probing, ping latency measurement, request cancellation, and Vite reverse proxy (`/api` → `http://127.0.0.1:8080`)
- **Information Boundary Compliance**: Strictly honors competition and security constraints; never leaks private simulator ground-truth objects, IDs, or target coordinates.

---

## Dashboard Layout & Capabilities

1. **Left Navigation Sidebar**:
   - `OVERVIEW`: Dashboard (Full Command Center), Simulation (Dedicated 3D Digital Twin), Robot Control (Dedicated Teleoperation Console)
   - `PERCEPTION`: Camera Feed, Object Detection Pipeline, Depth Rangefinder View
   - `OPERATIONS`: Task Timeline, Event Logs Terminal, Keyframe Gallery
   - `SYSTEM`: API Diagnostics, Settings & Config
2. **Top Telemetry Header**:
   - Project name (`MEMBRANE LAB COMMAND`), active mission ID, live API link status with round-trip latency (`API LIVE (3ms)`), simulation engine badge, robot state badge (`IDLE`, `LOCATE`, `CARRY`, `BLOCKED`, `DONE`, `FAILED`), gripper status (`VACANT` / `ENGAGED`), session recording timer (`REC 00:14:22`), and UTC clock.
3. **Primary Optical Perception Stream (`GET /look`)**:
   - 640×480 JPEG live stream with configurable sampling rate (1, 5, 10 FPS).
   - Aiming reticle and pitch horizon overlay (-10° tilt).
   - Perception bounding box layer with clean empty standby state when Claude vision agent is offline.
   - Fullscreen mode and manual keyframe snapshot capture.
4. **Digital Twin 3D Arena (Three.js)**:
   - 8.0m × 8.0m room arena, boundary walls, floor grid, coordinate axes.
   - Synchronized robot position `(X, Y)` and heading rotation `yaw`.
   - Perspective and Top-Down camera presets with reset control.
   - Clear disclaimer that the authoritative physics is owned by PyBullet.
5. **Technical Odometry & Telemetry (`GET /state`)**:
   - High-precision numerical readouts: X (m), Y (m), Heading (°), Robot State, Gripper status, Collision flag, Retry counter (x/3).
   - Recharts XY Trajectory scatter map and Heading timeline.
6. **Forward Laser Rangefinder (`GET /depth`)**:
   - 1D scalar line-of-sight distance measurement (0.25m elevation).
   - Graduated proximity bar with safe, warning, and critical collision distance zones.
7. **Perception & Object Detection**:
   - Structured detections table with confidence ratings and tracking status.
   - Strict isolation empty-state when Claude perception agent is not connected.
8. **Mission Task Pipeline**:
   - 8-stage sequence (Task received, Visual inspection, Object localization, Navigation, Pickup, Transport, Drop, Task completed).
   - Color-coded stage states (`completed`, `running`, `pending`, `failed`).
9. **Live Event Logs Console**:
   - Severity filters (`ALL`, `INFO`, `SUCCESS`, `WARNING`, `ERROR`), text search, auto-scroll, and buffer clear.
10. **Recent Keyframe Captures**:
    - Gallery of captured frames with frame numbers, action tags, timestamp, and pose metadata.
    - Click-to-inspect high-resolution modal.
11. **Robot Teleoperation & Motion Actuators**:
    - Directional pad (Forward/Backward with step distance selector: 0.1m, 0.25m, 0.5m, 1.0m).
    - Rotation controls (Turn Left/Right with angle selector: 15°, 30°, 45°, 90°).
    - Gripper actuators (`POST /pickup`, `POST /drop`).
    - Hotkeys: `W` (Fwd), `S` (Rev), `A` (Left), `D` (Right), `E` (Pickup), `Q` (Drop).
    - Execution feedback banner with concurrency guard preventing duplicate commands.

---

## Running the Dashboard

### 1. Start the Simulation Engine

```bash
# In the repository root with .venv activated:
python -c "from engine.server import start_engine; start_engine(gui=False)"
# Or with PyBullet GUI:
python run_engine.py
```

The engine listens at `http://127.0.0.1:8080`.

### 2. Start the Frontend Dashboard

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000` in your browser.

