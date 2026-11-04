# Task 05.1 — Live Simulator Corrections and Revalidation

## Summary

All three reported issues were corrected and verified: collision movement and
back-off reporting are consistent, the prominent blue camera band is gone,
and state headings stay within `[0, 360)`. The camera remains 640×480 with a
90° horizontal FOV, 0.5 m height, 10° downward tilt, and forward-facing
orientation.

The simulator ran in GUI mode and remained responsive. Live HTTP tests
confirmed collision recovery, retry limits, heading normalization, pickup,
attachment following, and both inside- and outside-zone drops. No Claude API
was called.

**Do not treat this validation as approval to start Task 06.** The outside-zone
drop currently returns `success: true`, `in_drop_zone: false`, and leaves the
state as `Done`. The endpoint exposes the zone verdict, but the state does not
distinguish a passing drop from a failing one. This existing behavior should be
clarified before an agent relies on the final state as a pass/fail signal.

## Changes made

- [engine/simulation.py](./engine/simulation.py): uses candidate-pose geometry
  checks for movement; reports `moved` through the first colliding candidate
  and separately reports `backed_off`; backs away once by 0.1 m along the
  signed movement direction; normalizes reported heading modulo 360.
- [engine/world.py](./engine/world.py): makes the robot kinematic so movement
  checks and reported positions share the same pose semantics; stores wall
  IDs for collision checks; moves the blue orientation marker behind the
  camera so it does not intrude into the camera view.
- [tests/test_simulation.py](./tests/test_simulation.py): adds/regresses
  movement-position consistency, collision recovery and retry limit, heading
  normalization, and camera-band checks. The camera pixel test no longer uses
  Pillow's deprecated `getdata()` accessor.
- [TASK_05_REPORT.md](./TASK_05_REPORT.md): updated the Task 05 status with
  the corrected findings and current readiness limitation.

No dependency, Python version, API schema bounds, Claude integration, or
simulation architecture was changed.

## Issue 1 — Collision back-off discrepancy

### Root cause

Previously, the robot was dynamically simulated and collision handling used
post-step physics movement/rollback. This made the returned `moved` value and
the final robot pose describe different points in the movement sequence. It
also made rollback behavior sensitive to the physics solver.

The robot is now kinematic. Before committing each movement increment, the
engine places it at the candidate pose and checks the robot's actual collision
geometry against stored wall IDs and floor-object IDs with
`getClosestPoints(distance=0)`. Thus, the cylinder collider's 0.24 m radius is
included in the contact test; the check does not treat the robot center as the
contact boundary. A held object's collision geometry is checked as well.

On contact, `moved` is the accumulated center displacement through the first
colliding candidate increment. `backed_off` is the separate 0.1 m retreat from
that candidate position, applied once along the signed heading direction.
Therefore:

`final_position = start_position + movement_direction * (moved - backed_off)`

for a collision response. `moved` is not a net distance after back-off.

### Before/after measurements

| Measurement | Before Task 05.1 | After Task 05.1 |
|---|---:|---:|
| Controlled approach response `moved` | 0.567 m | 0.667 m |
| Required back-off | 0.100 m (not separately represented) | `backed_off: 0.100 m` |
| Start/final coordinate | start `y=-3.000`, final `y=-3.520` | start `x=3.000`, final `x=3.567` |
| Response-predicted final coordinate | `y=-3.467` | `x=3.567` |
| Position discrepancy | 0.053 m | 0.000 m at API precision |

The prior 0.053 m measurement and current controlled collision result are
captured in the Task 05 and Task 05.1 evidence files. API state and `moved`
are rounded to 0.001 m, so the exact zero discrepancy refers to the reported
precision. The new response explicitly reports the `backed_off` field.

The live controlled test entered `Blocked` at retry count 1. Repeated wall
contacts advanced the count to 3 and returned `failed: true`/`Failed`; another
move was rejected without moving the robot. The focused regression also
verifies three-collision maximum and that a carried object's collider is
included in collision handling.

Evidence:

- [task05_1_live_results.json](./task_05_evidence/task05_1_live_results.json)
- [task05_1_heading_retry_results.json](./task_05_evidence/task05_1_heading_retry_results.json)
- Collision regression: `test_collision_backs_off_exactly_tenth_metre_and_fails_after_three`

## Issue 2 — Blue band in camera

### Root cause and correction

The blue pixels were produced by the robot's blue visual orientation marker
intruding into the camera's near-field view. The marker has been moved behind
the camera eye as the robot moves. This does not change the view matrix,
projection matrix, camera attachment, scene geometry, or camera framing.

The 640×480 horizontal-FOV projection still uses a 90° horizontal FOV with
the corresponding 73.74° vertical FOV at 4:3 aspect ratio. The camera remains
0.5 m above the floor, is tilted down 10°, and points along the robot's forward
direction.

The inspected camera frame's sampled blue-band pixel count changed from
27,520 to 0. This test checks a specific prior band area and is not a claim
that all blue pixels are absent from the image. Floor objects remain rendered
where they fall in the forward field of view. The camera is not a full-room
overview; objects or the marked drop zone outside that view require robot
rotation to inspect.

Evidence:

- Before: [camera_frame.jpg](./task_05_evidence/camera_frame.jpg)
- After: [camera_after_task05_1.jpg](./task_05_evidence/camera_after_task05_1.jpg)
- GUI screenshot: [simulator_gui_after_task05_1.png](./task_05_evidence/simulator_gui_after_task05_1.png)
- Pixel and dimensions comparison: [task05_1_live_results.json](./task_05_evidence/task05_1_live_results.json)

Both frames are 640×480. The new frame was fetched from the live `/look`
endpoint and decoded as an image for inspection. The GUI window remained
available while the HTTP server returned `/health` with HTTP 200.

## Issue 3 — Heading normalization

The state boundary now rounds the physical yaw reading and applies modulo
360°, so rounding drift cannot return 360°. The robot's quaternion/physical
orientation is not modified by the state read.

| Input/orientation | Expected API heading | Result |
|---:|---:|---|
| 0° | 0° | Passed |
| 360° | 0° | Passed |
| 720° | 0° | Passed |
| -90° | 270° | Passed |
| 450° | 90° | Passed |

The live API also exercised clockwise-positive turning: successive +90°
turns reported 90°, 180°, 270°, then 0°, and a -90° turn from 0° reported
270°. Unit tests verify the five requested normalized inputs without changing
the underlying orientation.

Evidence:

- [task05_1_heading_retry_results.json](./task_05_evidence/task05_1_heading_retry_results.json)
- Regression: `test_state_heading_is_normalized_without_changing_orientation`

## Repeated pickup and drop checks

These were live HTTP requests to a separately started simulator server after
the Task 05.1 code changes. Internal test instrumentation staged an object
within reach and repositioned the robot for inside/outside drop setup; no
object identifiers, names, colours, shapes, or coordinates were sent through
agent-facing routes or written into the evidence records.

| Behavior | HTTP result | Verification |
|---|---|---|
| Pickup with no object in reach | 200, `success: false` | Passed |
| Pickup with an aligned in-reach object | 200, `success: true` | Passed; `/state` showed `holding: true` |
| Move while holding | 200, `moved: 0.2` | Passed; internal relative offset remained 0.5 m before/after |
| Drop inside marked zone | 200, `success: true`, `in_drop_zone: true` | Passed |
| Drop outside marked zone | 200, `success: true`, `in_drop_zone: false` | Zone verdict passed; final-state semantics remain a limitation |

After both drops the state was `Done`. The outside-zone outcome makes the
meaning of `Done` ambiguous and is not evidence that an out-of-zone drop
passes the task.

Evidence: [task05_1_pickup_drop_results.json](./task_05_evidence/task05_1_pickup_drop_results.json).

## API information-boundary check

Live response bodies were inspected after the changes. `/state` contains only
state, robot x/y/heading, holding, retry count, and collision flag. `/depth`
contains one distance value. `/look` returns camera image bytes. Action
responses contain action outcomes, including the new scalar `backed_off`
value; none contains object metadata or drop-zone coordinates. The updated
evidence records contain only these API responses, behavior observations,
and camera dimensions/pixel counts.

No Claude API call or Claude payload was created. Object positions were used
only by internal test setup, not to guide an agent-facing workflow.

## Final validation

Using the existing project `.venv`:

- `pytest -q`: **15 passed**, 1 warning in 2.75 s. The remaining warning is
  Starlette's deprecation warning about using `httpx` with
  `starlette.testclient`.
- `python -m compileall engine agent tests`: **passed**.
- `python -m pip check`: **No broken requirements found**.
- DIRECT simulator initialization and shutdown: **passed** during live API
  pickup/drop validation.
- GUI simulator: **opened**, served live requests, and returned HTTP 200 from
  `/health`; it was stopped after validation.

The GUI screenshot and camera frame are saved under `task_05_evidence/`.
The post-validation API process was shut down; port 8080 no longer served the
simulator.

## Remaining limitations and readiness

1. `/drop` in the outside-zone test returns `success: true` and
   `in_drop_zone: false`, while `/state` becomes `Done`. The API does expose
   the false zone verdict, but `Done` alone cannot represent pass/fail.
2. The camera is forward-facing, not panoramic. Visual navigation to locate
   all objects or the drop zone from an arbitrary pose has not been validated.
3. Pickup/drop locations were staged internally for repeatable behavior tests;
   autonomous visual navigation to them was not exercised.
4. The live collision test used test-only pose placement to establish a
   controlled wall approach. It validates collision/back-off semantics, not
   end-to-end navigation around arbitrary obstacles.

The three Task 05.1 issues are resolved based on the stated evidence. The
simulator remains **not yet cleared for Claude integration** until the
outside-zone completion semantics are decided and visual navigation is
validated. Task 06 was not started.
