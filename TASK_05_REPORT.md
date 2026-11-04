# Task 05 — Full Live Simulator Validation

> Historical baseline: this report records the original Task 05 observations.
> Task 05.1 and Task 05.2 updates above supersede the corresponding collision,
> camera, heading, and drop-semantics findings below.

## Summary

The PyBullet GUI and live HTTP API both started. The world and 640×480 camera
rendered successfully, and all requested API routes responded. Forward/reverse,
left/right turning, staged pickup, attachment follow, drop-zone checks, and the
three-collision failure limit were exercised.

The original Task 05 run found a collision/back-off reporting discrepancy, a
blue camera band, and non-normalized headings. These three issues have since
been corrected and revalidated; the complete evidence and current status are
in [TASK_05_1_REPORT.md](./TASK_05_1_REPORT.md). This report retains the original
measurements below as the historical baseline.

**Task 05.2 update:** drop completion now distinguishes physical release from
Fetch task outcome: inside-zone release is `pass`, outside-zone release is
`fail_not_reached`, and dropping without a held object is a state-preserving
no-op. However, the live camera-only approach did not reach a successful
pickup, and a carried object substantially occludes the forward camera.
**Readiness is NO-GO for Task 06** until pickup approach and carrying visibility
are corrected and validated without hidden scene guidance.

See [TASK_05_2_REPORT.md](./TASK_05_2_REPORT.md) and
`task_05_evidence/task05_2_*.png` for the latest results and camera frames.

## Task 05.1 corrections and validation

- Collision response was changed to report travel through the first colliding candidate
  pose in `moved`, and reports its separate recovery offset in `backed_off`.
  Live start `x=3.000`, `moved=0.667`, `backed_off=0.100` produced final
  `x=3.567`; response-derived position error was `0.000 m` at API precision.
- The blue stripe was found to be caused by the robot's blue visual orientation marker
  intruding into the camera's near-field view. Moving the marker behind the
  camera removed it without changing camera resolution, FOV, height, tilt, or
  forward direction. The sampled band changed from 27,520 blue pixels to 0.
- Reported heading was normalized to `[0, 360)` without changing physical yaw.
  Live checks returned 0° for 0°/360°/720°, 270° for -90°, and 90° for 450°.
- Task 05.1's suite passed: `pytest -q` reported 15 passed and one existing
  Starlette/httpx deprecation warning; `compileall` passed; `pip check`
  reported no broken requirements.
- The Task 05.1 live GUI/API remained responsive during validation and was shut down
  afterward. Pickup, attached-object following, and inside/outside drop checks
  were repeated through live HTTP requests.
- At the end of Task 05.1, outside-drop semantics were still ambiguous. Task
  05.2 replaced the generic success field with separate release and final
  outcome fields; see the current API behavior in [TASK_05_2_REPORT.md](./TASK_05_2_REPORT.md).

See [TASK_05_1_REPORT.md](./TASK_05_1_REPORT.md) for Task 05.1 evidence and
[TASK_05_2_REPORT.md](./TASK_05_2_REPORT.md) for current behavior and readiness.

## Phase A — GUI and camera

- Started `run_engine.py` in GUI mode using the project `.venv`.
- Visible window title: `Bullet Physics ExampleBrowser using OpenGL3+ [btgl] Release build`.
- The captured GUI screenshot shows the room floor and boundary walls, robot,
  all five configured floor objects, and the marked drop zone.
- The window remained available while HTTP requests were served. GUI-window
  enumeration found it after behavior tests, and `/health` continued returning
  HTTP 200.
- Source configuration sets the camera at 0.5 m and tilts its view down by
  10°. The 640×480 image was captured from the live `/look` endpoint and
  decoded as JPEG. The configured horizontal FOV is 90°; the vertical FOV
  conversion is used for the 4:3 projection.
- **Visual issue:** the camera frame shows a prominent cyan/blue horizontal
  band across its lower-middle area and partially clipped objects near the
  edges. The image is real and correctly sized, but should be reviewed before
  relying on it for visual navigation.

Evidence:

- GUI screenshot: `task_05_evidence/simulator_gui.png`
- GUI screenshot after behavior run: `task_05_evidence/simulator_gui_after_behavior.png`
- Initial robot camera frame: `task_05_evidence/camera_initial.jpg`
- HTTP-captured robot camera frame: `task_05_evidence/camera_frame.jpg`
- Staged pickup camera frame: `task_05_evidence/pickup_staged_camera.jpg`

The GUI screenshot was captured while the PyBullet window was visible. The
second desktop capture was taken after it had been covered by VS Code; use the
first screenshot for scene inspection.

## Phase B — Live HTTP API

The GUI-mode server on `127.0.0.1:8080` served these requests. Full response
bodies, content types, and status codes are saved in
`task_05_evidence/api_results.json`.

| Request | Status | Observed response |
|---|---:|---|
| `GET /health` | 200 | `{"ok": true}` |
| `GET /state` | 200 | State, robot `x/y`, heading, holding, retry count, collision flag |
| `GET /look` | 200 | `image/jpeg`; 640×480 JPEG, 13,176 bytes |
| `GET /depth` | 200 | `{"distance": 3.63}` at the initial pose |
| `POST /move` with `0.0` | 200 | `{"moved": 0.0, "collided": false, "retry_count": 0}` |
| `POST /move` with `1.0` | 200 | `{"moved": 1.0, "collided": false, "retry_count": 0}` |
| `POST /turn` with `0.0` | 200 | `{"turned": 0.0, "collided": false}` |
| `POST /turn` with `90.0` | 200 | `{"turned": 90.0, "collided": false}` |
| `POST /pickup` with nothing in reach | 200 | `{"success": false}` |
| `POST /drop` while not holding | 200 | `{"success": false, "in_drop_zone": false}` |
| `/move` with `1.01` or nonnumeric input | 422 | Validation error; no engine crash |
| `/turn` with `90.01` or nonnumeric input | 422 | Validation error; no engine crash |

The service remained responsive after the collision sequence. The API responses
and test servers shut down without a simulator exception.

## Phase C — Robot behaviors

Movement and behavior requests were made through HTTP endpoints. State values
below are API-visible robot state, not object metadata.

### Movement and heading

Results are saved in `task_05_evidence/movement_results.json`.

- Forward `0.25 m` from the initial pose: API reported `moved: 0.25`;
  state changed to approximately `(x=0.255, y=-0.002)`.
- Reverse `0.25 m` from a fresh initial pose: API reported `moved: 0.25`;
  state changed to approximately `(x=-0.255, y=-0.002)`.
- Right turn `+45°`: heading became `45°`; subsequent forward motion had
  negative `y`, consistent with clockwise-positive heading.
- Left turn `-45°`: heading became `315°`; subsequent forward motion had
  positive `y`.
- **Observed state-format issue:** after slight numerical yaw drift, the
  heading field reported `360.0°` rather than normalizing it to `0.0°`.

### Wall collision, back-off, retries

Controlled live HTTP results are saved in
`task_05_evidence/collision_controlled_results.json`. The robot was positioned
by test-only instrumentation near a wall; collision, movement, state, and
recovery were exercised via the running HTTP API.

- First wall approach returned `collided: true`, `state: Blocked`, and
  `retry_count: 1`.
- The response reported `moved: 0.567 m`. From the initial state and the
  documented heading, travel plus a 0.1 m back-off predicts `y=-3.467 m`;
  the observed state was `y=-3.520 m`, a **0.053 m discrepancy**.
- Reverse recovery then returned `moved: 0.2 m` without collision.
- Further wall contacts advanced retry count to 2 and then 3. At retry 3 the
  response had `failed: true`, and state became `Failed`. Further movement and
  turning were rejected with `failed: true`. The engine stayed healthy.
- **Result:** retry limit and failure state passed; reverse recovery passed in
  the controlled run. The required back-off distance did **not** match the
  response-derived expected position within 0.01 m. Another approach/turn
  sequence also encountered a further collision immediately after turning
  while near the wall, so recovery around persistent contacts is not robustly
  established.

An earlier wall run started after unrelated movement/turn requests and is also
recorded in `task_05_evidence/collision_results.json`; its coordinates should
not be used as the controlled back-off measurement.

### Pickup, attachment, drop

Results are saved in `task_05_evidence/pickup_drop_results.json`.

- With no object staged in reach, `/pickup` returned `{"success": false}`.
- With a test object staged directly ahead by internal test instrumentation,
  `/pickup` returned only `{"success": true}`; `/state` reported `holding: true`.
- After an HTTP move of 0.2 m, internal test-only pose comparison confirmed
  that the attached object maintained its offset from the robot.
- A held object dropped in the test drop-zone setup returned
  `{"success": true, "in_drop_zone": true}`.
- A held object dropped in the outside-zone setup returned
  `{"success": true, "in_drop_zone": false}`.

Pickup/drop placement used internal simulator instrumentation solely to stage
test conditions and verify attachment; those details were not returned by the
API or exposed to Claude. Visual navigation from the original scene to choose
and reach a target object was **not** validated.

## Phase D — Information-boundary audit

Audit evidence is saved in `task_05_evidence/information_boundary_audit.json`.

- `/state` returned only `state`, `x`, `y`, `heading`, `holding`,
  `retry_count`, and `collided`.
- `/look` returned image bytes only, with JPEG media type.
- `/depth` returned one unnamed distance value.
- Movement, turn, pickup, and drop results contained action outcomes only.
- OpenAPI schemas exposed only the movement `distance` and turn `degrees`
  inputs; the live response-body and schema scan found **zero forbidden-key
  violations**.
- `agent/tools.py` contains no object IDs/positions, object counts, drop-zone
  coordinates, or segmentation-mask fields.
- The agent client reads the permitted state/image/depth and action results.
  The Claude execution adapter remains intentionally unimplemented, so there
  is no actual Claude payload to audit or API call to make.
- No object metadata was found in the audited endpoint bodies, schemas, or tool
  descriptions. Camera pixels naturally depict the scene as allowed.

## Phase E — Final checks

Final validation using the existing project `.venv`:

- `pytest -q`: **10 passed**, 1 Starlette/httpx deprecation warning.
- `python -m compileall engine agent tests`: **passed**.
- `pip check`: **No broken requirements found**.
- DIRECT-mode test servers and the GUI API server were shut down after testing.

## Original Task 05 failures (historical; superseded where noted above)

1. The back-off distance inferred from API-reported movement and observed
   coordinates differed by 0.053 m in the controlled wall test. This needs
   investigation before the collision requirement can be signed off.
2. Recovery after turning while near a wall can still collide immediately;
   persistent-contact recovery has not been proven robust.
3. Heading sometimes reports `360.0°` instead of normalized `0.0°`.
4. The camera image has a prominent blue horizontal band and partial object
   clipping, despite correct resolution and configured FOV.
5. Pickup and drop outcomes were tested with internally staged conditions,
   not by navigating to targets and the drop zone from the original scene
   using vision alone.
6. API behavior and collision tests ran against the GUI server; pickup/drop
   used a separate live HTTP server in DIRECT mode for isolated test setup.

The original Task 05 readiness decision was **NO-GO**. Collision, blue-band,
and heading issues were subsequently resolved in Task 05.1; drop outcome
semantics were resolved in Task 05.2. The current **NO-GO** is for the visual
navigation and carried-camera limitations described at the top and in
[TASK_05_2_REPORT.md](./TASK_05_2_REPORT.md).
