# Task 05.4 — Carrying Collisions and Camera-Guided Drop

## Result

**GO for Task 06 integration work, with the simulator gate met.** Three complete visual-only Fetches ended with `result: "pass"` and zero retries (Trials 1, 2, and 4). Trial 3 is retained as a failed pre-fix run: its turn was stopped by a carried-cone/floor contact and it did not attempt a drop. The correction was then verified in a fresh GUI run: the same 60-degree carried-cone turn completed without collision, followed by a successful Fetch. Claude was not called, and no agent implementation was started.

## Carrying collision diagnosis and correction

Trial 3 approached the visibly selected cone, picked it up, and attempted a 60-degree turn toward the visually observed marker. The turn stopped at 0 degrees; the robot remained at `(0.0, 1.35)`, heading `270°`, holding the cone, and entered `Blocked` with retry count 1. The private collision event recorded a closest separation of `-0.001 m` between the held object and floor.

The cone's collision mesh extended approximately 1 mm below the floor when its attachment origin was fixed at `z=0.25 m`. Turn collision checking correctly queried the held object against the floor, but consequently treated this persistent floor overlap as an obstacle. The earlier Task 05.3 three-retry failure predates these diagnostics, so its exact collision pair cannot be confirmed; this Task 05.4 reproduction establishes a concrete carrying-turn false positive.

The attachment now derives the object's local bottom from its actual collision AABB and raises it to a `0.03 m` floor clearance. This preserves the rearward horizontal attachment offset, object mesh, rendering, collision checks against real obstacles, and collision retry limit. It does not disable floor collisions or increase retries. A regression test verifies the carried cone's clearance and that it can turn without a false collision. Existing tests continue to verify that carried objects still block on real scene-object collisions and that the robot/held-object self-pair is not treated as an obstacle.

An earlier retained diagnostic record from the first Trial 1 attempt reports robot/held-object self-overlap; that is the self-pair regression already excluded by the current collision-pair filter, not an external collision. It is not counted as a valid obstacle event. Private diagnostic records and frames are under `task_05_evidence/task05_4_diagnostics/`.

## Camera-driven final approach

The rear attachment means the release point trails the robot center, so the robot should not drop merely because the marker appears centered or close in the forward camera. The demonstrated visual-only procedure was:

1. Locate the green floor marker in the robot camera and center it with small turns based on its image position.
2. Use the marker's apparent floor position, camera calibration, robot pose, and permitted depth as relative guidance; do not query hidden zone or object coordinates.
3. Approach in bounded movements, re-observing after each step. As the marker grows and moves toward the lower image, use shorter final increments and account for the fixed rear attachment transform when choosing the release pose.
4. Drop and use only the public `released`, `in_drop_zone`, and `result` fields to confirm the outcome.

This is a demonstrated manual camera-guided procedure, not an implemented autonomous controller. The carried object remains visible in the renderer; when the rear attachment points away from the camera it does not occupy the central forward view. The green marker remained recognizable during the successful carrying approaches.

## Visual-only trials

The three passing trials used distinct starting headings or approach directions. Trial 3 is included rather than discarded; Trial 4 was run separately after the collision correction.

| Trial | Start / target approach | Pickup and carrying | Final drop | Outcome |
|---|---|---|---|---|
| 1 (corrected run) | Start heading `0°`; followed the visually observed target and marker. | Pickup succeeded; retry count remained `0`. | `released: true`, `in_drop_zone: true`, `result: "pass"`; final pose `(2.737, 2.610)`, heading `125°`. | **Pass** |
| 2 | Start heading `90°`; visually scanned to a blue sphere, then aligned on the marker. | Pickup succeeded; collision-free turns and movement; retry count `0`. | `released: true`, `in_drop_zone: true`, `result: "pass"`; final pose `(2.942, 2.966)`, heading `319°`. | **Pass** |
| 3 (pre-fix) | Start heading `270°`; visually approached a cone and picked it up. | Attempted turn stopped at `0°` due held-object/floor overlap; `Blocked`, retry count `1`. No drop attempted. | Incomplete; no pass claimed. | **Failed, preserved** |
| 4 (post-fix) | Fresh start heading `270°`; visually approached a cone and the green marker. | Pickup succeeded; the formerly blocked `60°` turn completed; retry count `0`. | `released: true`, `in_drop_zone: true`, `result: "pass"`; final pose `(3.118, 3.150)`, heading `330°`. | **Pass** |

Representative camera evidence (640×480):

- Trial 1: [initial](./task_05_evidence/task05_4_trial1r_initial.png), [target scan](./task_05_evidence/task05_4_trial1r_target_scan.png), [close approach](./task_05_evidence/task05_4_trial1r_close_approach.png), [pickup](./task_05_evidence/task05_4_trial1r_pickup.png), [carrying](./task_05_evidence/task05_4_trial1r_carry_scan.png), [zone approach](./task_05_evidence/task05_4_trial1r_zone_approach.png), [pre-drop alignment](./task_05_evidence/task05_4_trial1r_pre_drop_alignment.png), [final drop](./task_05_evidence/task05_4_trial1r_final_drop.png).
- Trial 2: [initial heading 90°](./task_05_evidence/task05_4_trial2_initial_heading90.png), [close approach](./task_05_evidence/task05_4_trial2_close_approach.png), [pickup](./task_05_evidence/task05_4_trial2_pickup.png), [carrying scan](./task_05_evidence/task05_4_trial2_carry_scan2.png), [zone approach](./task_05_evidence/task05_4_trial2_zone_approach4.png), [final drop](./task_05_evidence/task05_4_trial2_final_drop.png).
- Trial 3 failure: [pre-fix turn observation](./task_05_evidence/task05_4_trial3_zone_scan.png); the internal pair and recorded collision frame are in the private [collision event log](./task_05_evidence/task05_4_diagnostics/trial_3/collision_events.jsonl).
- Trial 4: [initial heading 270°](./task_05_evidence/task05_4_trial4_initial_heading270.png), [pickup](./task_05_evidence/task05_4_trial4_pickup.png), [marker after the formerly blocked turn](./task_05_evidence/task05_4_trial4_zone_scan.png), [zone approach](./task_05_evidence/task05_4_trial4_zone_approach3.png), [pre-drop](./task_05_evidence/task05_4_trial4_pre_drop.png), [final drop](./task_05_evidence/task05_4_trial4_final_drop.png).

## Information-boundary audit

Live GET checks returned HTTP 200 for `/state`, `/look`, and `/depth`; `/look` returned `image/jpeg` at 640×480. The captured final `/state` contained only state, robot `x/y/heading`, holding, retry count, collision flag, and result. `/depth` returned one scalar distance. `/look` returned pixels only.

The exercised movement, turn, pickup, and drop responses contained action progress/collision/retry fields, a success boolean, or `released`/`in_drop_zone`/`result` as applicable. They did not return object identity, names, colours/shapes as metadata, positions, counts, target distances, segmentation, or drop-zone coordinates. An out-of-bound movement request returned HTTP 422 and did not stop the server. OpenAPI exposes only the movement/turn inputs and their existing bounds (`distance: -1..1 m`, `degrees: -90..90`). The Claude tool descriptions in `agent/tools.py` do not contain scene-specific facts. Collision body roles/IDs, camera-frame paths, and event records are written only to local diagnostics; they are not serialized into API responses or tool observations.

The live API/OpenAPI snapshot is retained at [task05_4_api_boundary_audit.json](./task_05_evidence/task05_4_api_boundary_audit.json).

## Files changed

- `engine/simulation.py` — internal collision event capture, turn sweep checks and self-pair filtering from this task; held-object vertical attachment now clears the floor according to its collision AABB.
- `engine/config.py` — added `ATTACHMENT_CLEARANCE_METRES = 0.03`.
- `engine/server.py` — optional local diagnostics-directory wiring; not exposed through endpoints.
- `agent/tools.py` — collision recovery guidance; no hidden scene information added.
- `tests/test_simulation.py` — collision diagnostics, turn-collision, and carried-cone floor-clearance regression coverage.
- `TASK_05_4_REPORT.md` — this report.
- `task_05_evidence/` — live camera/API evidence and private local collision diagnostics.

## Validation and limitations

- `pytest -q`: **27 passed**, 1 existing Starlette/httpx deprecation warning.
- `python -m compileall engine agent tests`: **passed**.
- `python -m pip check`: **No broken requirements found**.
- GUI simulator: opened and remained responsive during trials; each completed server was stopped, and port 8080 was confirmed closed.
- The corrected carried-cone turn and full post-fix camera-guided Fetch were exercised against the live GUI/API.

Remaining limitations:

- The exact collision pair from the historical Task 05.3 retry-exhaustion run is unavailable; the current cone/floor false positive was reproduced directly and fixed.
- These trials use the fixed simulation scene and do not establish robustness to randomized layouts or physical hardware.
- Camera-guided navigation was exercised manually through the permitted API observations. No autonomous visual-navigation controller or Claude integration was implemented or called.
- Pylance's workspace environment discovery still reports the global Python 3.14 interpreter; project commands and tests were run using the existing `.venv` Python 3.11.9, where the dependencies are installed. This is an editor-analysis configuration mismatch, not a simulator test failure.
