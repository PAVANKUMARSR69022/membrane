# Task 05.3 — Pickup Geometry, Carry View, and Visual Fetch Validation

## Result

**NO-GO for Task 06.** The pickup geometry correction works in regression tests
and in two camera-guided live pickup attempts. The rear attachment keeps the
camera useful and the green marker can be recognized while carrying. However,
neither live Fetch completed successfully: Trial 1 physically released outside
the zone (`fail_not_reached`), and Trial 2 exhausted the three-collision retry
limit before dropping. No Claude API calls were made.

## Root causes and corrections

### Pickup reach after collision back-off

The prior pickup predicate compared robot-center-to-object-center distance
against the 0.5 m reach. A wall/object collision can stop the robot with its
center more than 0.5 m from the target even when the object surfaces are
already close. The recorded reproduction had a 0.533 m center distance but
only 0.073 m between collision surfaces after the 0.1 m back-off. The center
distance therefore rejected a physically reachable object.

`Simulation.pickup()` now uses PyBullet's closest-point separation for the
robot and each candidate object's collision geometry, retaining the existing
0.5 m limit and ±30° center-bearing alignment check. It does not increase the
reach or disable world collisions. Trial 1 achieved pickup after camera-guided
incremental movement; the staged regression separately asserts collision,
0.1 m back-off, surface separation, and successful pickup.

### Carried-object camera occlusion

The attachment offset was +0.5 m along the robot's forward direction, placing
the carried object between the camera and the scene. The offset is now
−0.5 m, behind the robot, with the same magnitude. The object remains rendered
and attached; the camera remains the same forward-facing camera. A live
post-pickup frame shows the marked green zone without the carried object
covering the central view.

### Turn behavior across heading wrap

Live scanning exposed that `turn()` reread Euler yaw during every step. When
Euler yaw crossed its ±180° representation boundary, the wrapped value could
reverse the remaining turn and make the camera direction inconsistent with
the intended turn. The loop now advances from a fixed starting yaw and
accumulated turn angle. A regression checks four successive right turns:
90°, 180°, 270°, then 0°.

### Camera configuration

The camera was not changed: 640×480, 90° horizontal FOV, 0.5 m height, 10°
downward tilt, forward-facing. The configured vertical FOV continues to account
for the 640:480 aspect ratio.

## Live visual-only trials

Navigation decisions used camera frames, permitted robot pose/heading, depth,
collision/movement feedback, and the visible marker only. No object IDs,
object coordinates, object metadata, or drop-zone coordinates were queried or
used to guide either trial. Frames below were captured from live `/look`
responses.

### Trial 1 — visible block-like target

The robot scanned from the initial view, visually selected the block-like
target, and used short moves and camera alignment to approach. A close pickup
attempt initially returned false; after additional visually guided approach
and alignment, `/pickup` returned `{"success": true}` and `/state` reported
`holding: true`. The carried camera view was clear and showed the green marker.

The robot then followed the visible marker and issued `/drop`. The object was
physically released, but the result was **not a pass**:

```json
{
  "released": true,
  "in_drop_zone": false,
  "result": "fail_not_reached"
}
```

Final `/state` reported `state: "Done"`, `holding: false`, and
`result: "fail_not_reached"`. This trial does not satisfy the Fetch objective.

Evidence:

- [Initial observation](./task_05_evidence/task05_3_trial1_initial_observation.png)
- [Close approach](./task_05_evidence/task05_3_trial1_close_approach.png)
- [Successful pickup](./task_05_evidence/task05_3_trial1_successful_pickup.png)
- [Carrying view after turn](./task_05_evidence/task05_3_trial1_carrying.png)
- [Drop-zone approach](./task_05_evidence/task05_3_trial1_drop_zone_approach.png)
- [Final outside-zone release](./task_05_evidence/task05_3_trial1_final_drop.png)
- [Trial 1 final API result](./task_05_evidence/task05_3_trial1_final_drop.json)

### Trial 2 — different visible target and approach direction

From a fresh GUI simulator, the robot visually selected a different target,
approached it using camera/depth feedback, and `/pickup` returned
`{"success": true}`. While carrying, the robot scanned and visually located
the green marker. At the marker approach, movements repeatedly returned a
collision and 0.1 m back-off:

| Attempt | Requested distance | Reported moved | Back-off | Retry count | Result |
|---|---:|---:|---:|---:|---|
| 1 | 0.5 m | 0.333 m | 0.1 m | 1 | Blocked |
| 2 | 0.15 m | 0.1 m | 0.1 m | 2 | Blocked |
| 3 | 0.2 m | 0.133 m | 0.1 m | 3 | Failed |

After the final attempt, `/state` reported `state: "Failed"`, `holding: true`,
`retry_count: 3`, and `collided: true`. The visible camera frames showed the
marker and an apparently open forward view, but the collision source was not
diagnosed using hidden scene data. No drop was attempted after the simulator
entered `Failed`; Trial 2 is incomplete and is not a pass.

Evidence:

- [Initial observation](./task_05_evidence/task05_3_trial2_initial_observation.png)
- [Target scan](./task_05_evidence/task05_3_trial2_scan_target.png)
- [Close approach](./task_05_evidence/task05_3_trial2_close_approach.png)
- [Successful pickup](./task_05_evidence/task05_3_trial2_successful_pickup.png)
- [Carrying scan](./task_05_evidence/task05_3_trial2_carry_scan.png)
- [Drop-zone approach at retry limit](./task_05_evidence/task05_3_trial2_drop_zone_approach.png)
- [Final failed-state API response](./task_05_evidence/task05_3_trial2_drop_zone_approach.json)

## Information-boundary audit

The live API and published tool/schema surface were checked:

- `/state` returned only robot `x`, `y`, `heading`, state name, holding flag,
  retry count, collision flag, and final task result.
- `/look` returned a JPEG image only; `/depth` returned one scalar distance.
- `/move` and `/turn` responses contained movement/turn amount, collision,
  back-off, retry, and failure status only.
- `/pickup` returned a success boolean only.
- `/drop` returned release status, zone verdict, and task result only. It
  returned no object identity or coordinates.
- `/openapi.json` exposed the expected endpoint paths and request-validation
  schemas for movement/turn values; it contained no scene/object schemas.
- `agent/tools.py` descriptions and the permitted `MoveRequest` and
  `TurnRequest` fields disclosed no object names, IDs, colors/shapes as
  metadata, positions, counts, target distances, segmentation masks, object
  states, or drop-zone coordinates.

No information-boundary violation was found. The green marker's pixels are
visible in the camera, as intended. No hidden object or zone data was used to
guide live navigation.

## Regression and environment validation

Using the existing project `.venv`:

- `pytest -q`: **23 passed**, with one existing Starlette/httpx deprecation
  warning from `starlette.testclient`.
- `python -m compileall engine agent tests`: **passed**.
- `python -m pip check`: **No broken requirements found**.
- Live `/health`, `/state`, `/look`, `/depth`, `/openapi.json`: HTTP 200.
- GUI-mode simulator started for both live trials and was stopped afterward;
  port 8080 was confirmed closed.
- The camera returned actual 640×480 frames. The rear attachment left the
  marker visible in carrying frames.

The unit test that stages a visible target internally is named as a staged
regression, not as proof of autonomous camera-guided behavior. Only the live
trials above count as visual-navigation evidence.

## Files changed

- `engine/simulation.py` — collision-geometry pickup reach and fixed-start-yaw
  turn accumulation.
- `engine/config.py` — rearward attachment offset of −0.5 m.
- `tests/test_simulation.py` — turn-wrap regression and accurately named
  staged pickup/back-off regression; pickup, alignment, attachment, and camera
  tests remain.
- `TASK_05_2_REPORT.md` — superseding Task 05.3 outcome and recommendation.
- `TASK_05_3_REPORT.md` — this report.
- `task_05_evidence/` — live camera frames and endpoint result JSON files.

## Remaining limitations and recommendation

1. Neither live Fetch passed: Trial 1 dropped outside the marker; Trial 2 hit
   the retry limit while carrying.
2. The repeated Trial 2 collision source remains unresolved. It must be
   diagnosed without using hidden scene facts to guide an agent.
3. The second trial did not reach a drop attempt, so live inside-zone drop
   behavior after camera-guided navigation was not revalidated.
4. The two successful live pickups show that the corrected geometry can work,
   but they do not establish reliable full-task navigation or completion.
5. Existing Starlette/httpx deprecation warning remains unrelated to this
   change.

**GO/NO-GO: NO-GO for Task 06.** Do not begin Claude integration until a
camera-guided Fetch can reliably pick up, keep useful camera visibility while
carrying, reach the visually identified marker, and receive
`released: true`, `in_drop_zone: true`, `result: "pass"` without exhausting
collision retries.
