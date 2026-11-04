# Task 05.2 — Drop Outcomes and Visual Navigation Assessment

## Summary and recommendation

The drop API now separates physical release from task completion. Inside-zone
release returns `released: true`, `in_drop_zone: true`, `result: "pass"`; an
outside-zone release returns `released: true`, `in_drop_zone: false`,
`result: "fail_not_reached"`. Both leave the state `Done` and publish the
matching result in `/state`. Dropping with no object held returns
`released: false`, `in_drop_zone: false`, `result: null` on a fresh task and
leaves the state unchanged.

The visual assessment is **not ready for agent navigation**. The room's
objects can be recognized in the camera after scanning/turning, but not all
are visible in the initial forward view. The green floor marker is clearly
visible in one view, is only a narrow partial strip in another, and is
partially hidden by a nearby object during approach. Most importantly, a
carried object covers a large central portion of the camera image. A camera-
only approach got close to a clearly visible target but the next increment
collided and backed off; the subsequent pickup attempt returned
`success: false`. These observations are a **NO-GO for Task 06**.

No Claude API was called. Camera resolution, FOV, height, and tilt were not
changed in this task, and no additional scene-layout changes were made.

## Drop behavior before and after

Before Task 05.2, `/drop` used `success` to describe release and exposed only
zone membership. An outside release returned
`{"success": true, "in_drop_zone": false}`, while `/state` reported `Done`
without a task result. A drop with nothing held returned
`{"success": false, "in_drop_zone": false}` but also changed state to `Done`.

The API now uses these fields:

| Case | `/drop` response | Final `/state` |
|---|---|---|
| Object released inside zone | `released: true`, `in_drop_zone: true`, `result: "pass"` | `state: "Done"`, `result: "pass"`, `holding: false` |
| Object released outside zone | `released: true`, `in_drop_zone: false`, `result: "fail_not_reached"` | `state: "Done"`, `result: "fail_not_reached"`, `holding: false` |
| No object held on a fresh task | `released: false`, `in_drop_zone: false`, `result: null` | Existing state and `result: null` preserved |

The successful physical release is no longer represented as Fetch success.
The outside-zone result is explicitly a failure. The empty-hand drop is a
safe no-op; it neither marks the state `Done` nor reports `pass`. These
responses contain no object identity or coordinates.

Live HTTP bodies and final state responses are recorded in
[task05_2_live_drop_carry_results.json](./task_05_evidence/task05_2_live_drop_carry_results.json).
Simulation and HTTP contract regression coverage is in
[test_simulation.py](./tests/test_simulation.py) and
[test_server_contract.py](./tests/test_server_contract.py).

## Visual-navigation assessment

### Method and information boundary

The GUI-mode simulator was started and its `/health` endpoint returned HTTP
200. Frames were captured from `/look` at actual robot camera viewpoints. The
heading scan used only the current heading/state response and turn requests;
the approach was guided by image pixels, forward depth, pose, and collision
responses. No object IDs, positions, color/shape metadata, or drop-zone
coordinates were used to guide that camera-only approach.

For the separate carried-object camera and drop-contract regression, an
internal test harness staged simulator state solely to exercise the existing
HTTP endpoints and obtain a carried-view image. Those internal values were
not sent to or exposed by any endpoint and were not used to guide the
camera-only navigation attempt.

### What is visible

- At headings 0°, 90°, 180°, and 270°, the camera showed different portions
  of the room and visible floor objects. The spherical and conical silhouettes
  are distinct in their captured views; block-like objects are also visually
  distinguishable when not clipped.
- Turning is reflected in the camera orientation: successive live API turns
  produced state headings 0°, 90°, 180°, and 270°, with the view changing
  accordingly.
- After turning based on the camera view, a block-like target was centered at
  heading 330°. Its visible size increased through the approach. At that
  point, reported forward depth changed from 1.71 m to 1.41 m, 0.91 m, and
  0.61 m across the captured approach frames.
- A green floor marker is visible as a patch in the heading-315° approach
  frame. It is recognizable by its color and floor placement in that view.

### What is difficult or obscured

- The initial heading-0° view only shows a clipped portion of a floor object;
  a full-room scan requires turning. Several cardinal-heading frames show
  objects clipped at an image edge rather than centered.
- In the heading-180° frame, the green marker is only a narrow partial strip
  near the edge. In the heading-315° approach frame it is more recognizable,
  but sits behind/next to the foreground target and becomes further occluded
  as the robot approaches.
- At depth 0.21 m, the target filled most of the view. The next 0.15 m
  movement request reported collision, `backed_off: 0.1`, and
  `collided: true`; after this the target still filled most of the view and
  forward depth was 0.177 m. A pickup attempt returned `success: false`.
  This is actual visual/API evidence that the present collision back-off and
  pickup reach do not reliably complete the camera-guided approach.
- With a carried object, the live `/look` image showed the carried object
  spanning most of the central/lower image. The visible room background was
  reduced to narrow strips; the marked drop zone was not visible in that
  carried view. The same was observed after moving 0.1 m while carrying.
- The chassis itself is not prominent in the camera image, but the carried
  object and close target geometry occlude useful scene context.

### Camera/scene changes indicated

The camera is still 640×480, 90° horizontal FOV, 0.5 m high, and tilted down
10°. These settings were not changed because the evidence indicates the
primary obstruction is the object held directly ahead, not an incorrect FOV,
resolution, height, or tilt. No additional scene/object layout change was made
for Task 05.2; the Task 05.1 camera-marker adjustment remains in place.

Before agent navigation is considered ready, evaluate a carrying attachment
pose that does not occupy the camera's central view and resolve the mismatch
between collision back-off and pickup reach. Then repeat image-guided pickup,
carrying, and zone-recognition tests. If the held-object view must remain
forward-occluded by design, the agent needs a verified alternate observation
strategy; that behavior is not established by this task.

### Camera evidence

All frames are 640×480 PNGs captured from live `/look` responses:

- Before movement / heading scan:
  [heading 0](./task_05_evidence/task05_2_heading_0.png),
  [heading 90](./task_05_evidence/task05_2_heading_90.png),
  [heading 180](./task_05_evidence/task05_2_heading_180.png),
  [heading 270](./task_05_evidence/task05_2_heading_270.png).
- Camera-guided alignment and approach:
  [visible approach target](./task_05_evidence/task05_2_visual_target_approach.png),
  [centered target](./task_05_evidence/task05_2_object_centering.png),
  [during approach](./task_05_evidence/task05_2_during_approach.png),
  [near target](./task_05_evidence/task05_2_near_target.png),
  [close approach](./task_05_evidence/task05_2_close_approach.png),
  [near contact](./task_05_evidence/task05_2_near_contact.png).
- Carried object, generated for a separate diagnostic endpoint test:
  [carrying view](./task_05_evidence/task05_2_carrying_view.png),
  [after movement while carrying](./task_05_evidence/task05_2_carrying_after_move.png).
- Heading metadata without scene metadata:
  [task05_2_heading_frames.json](./task_05_evidence/task05_2_heading_frames.json).
- Camera-only approach observations:
  [task05_2_approach_results.json](./task_05_evidence/task05_2_approach_results.json),
  [task05_2_object_centering.json](./task_05_evidence/task05_2_object_centering.json),
  [task05_2_during_approach.json](./task_05_evidence/task05_2_during_approach.json),
  [task05_2_near_target.json](./task_05_evidence/task05_2_near_target.json),
  [task05_2_close_approach.json](./task_05_evidence/task05_2_close_approach.json),
  [task05_2_near_contact.json](./task_05_evidence/task05_2_near_contact.json),
  [task05_2_pickup_results.json](./task_05_evidence/task05_2_pickup_results.json).

## Files modified

- `engine/simulation.py` — added final result state and separated release from
  task outcome; empty-hand drop preserves the state.
- `tests/test_simulation.py` — asserts pass/failure outcomes and state
  preservation for empty-hand drop.
- `tests/test_server_contract.py` — updates safe endpoint response/state
  contract for the new result fields.
- `agent/tools.py` — clarifies the drop tool reports physical release and
  final task result, not a generic success flag.
- `README.md` — documents permitted `/state` result and drop semantics.
- `TASK_05_REPORT.md` — records this release-gate update and no-go decision.
- `TASK_05_2_REPORT.md` — this report.

The camera/test evidence files listed above were added under
`task_05_evidence/`.

## Final regression checks

Using the existing project `.venv`:

- `pytest -q`: **16 passed**, with one existing Starlette/httpx deprecation
  warning from `starlette.testclient`.
- `python -m compileall engine agent tests`: **passed**.
- `python -m pip check`: **No broken requirements found**.
- Live HTTP inside-zone, outside-zone, empty-hand drop, final state, pickup,
  and carrying movement checks: **passed** for the endpoint behavior.
- Camera-only navigation pickup attempt: **not passed**; it is recorded as a
  readiness failure rather than masked by test staging.
- GUI simulator: **started**, served HTTP successfully, and was stopped after
  evidence capture.

## Remaining limitations and Task 06 decision

1. A camera-guided approach did not result in successful pickup after collision
   back-off; the live pickup endpoint returned false.
2. The carried object occludes the central camera view and the marked zone was
   not recognizable in the carried frames.
3. The green zone is not reliably visible from the captured heading views;
   one direction shows only a partial strip.
4. Internal state staging was used only for the separate endpoint/carry-camera
   diagnostic and deterministic inside/outside drop checks.

**GO/NO-GO: NO-GO for Task 06.** The drop outcome semantics release gate is
resolved, but visual pickup/navigation and carrying visibility are not. Do
not start Claude integration until the camera-guided pickup and carried-view
limitations are addressed and revalidated.

## Task 05.3 follow-up

Task 05.3 supersedes the visual-navigation findings above. Pickup reach now
uses the closest separation between the robot and object collision geometry,
and the carried object is attached 0.5 m behind the robot rather than in front
of its camera. A fresh live trial confirmed that the camera-guided pickup can
succeed and that the green marker remains visible while carrying. However, the
first live Fetch ended with an outside-zone release and
`fail_not_reached`; a second camera-guided pickup reached the marked zone but
hit the three-retry collision limit before a drop. Neither trial passed.

The turn loop also now accumulates rotation from its initial yaw instead of
re-reading wrapped Euler yaw on each frame. A regression test covers four
successive 90-degree turns across the heading boundary.

The full details, endpoint boundary audit, validation results, limitations,
and camera evidence are in [TASK_05_3_REPORT.md](./TASK_05_3_REPORT.md).
Task 06 remains **NO-GO** until a full camera-guided pickup, carry, and
inside-zone drop returns `pass` without exhausting retries.
