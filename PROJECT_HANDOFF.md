# Membrane Robot Hackathon — Project Handoff

This document summarizes the project through **Task 07** so a new engineer or
coding agent can continue without this conversation. The current source code
and task reports are authoritative; historical task findings below are
identified as historical where later tasks superseded them.

## Project objective

Build a Smart Search and Recovery Intelligence (SSRI) multi-task robot system
using the validated PyBullet Fetch simulator as its baseline. The current
architecture adds structured mission/task orchestration with progress,
dependencies, recovery tracking, and safe task boundaries. Claude API
execution is paused; the current multi-task path is mock-only.

Key implementation constraints:

- The engine owns all scene/object truth. The agent navigates from the actual
  camera image, permitted robot state, optional forward depth, and action
  results.
- Do not pass object identity or metadata, object positions/counts, named
  target distances, segmentation masks, object states, or drop-zone
  coordinates to Claude.
- Do not hardcode object positions or a path into the agent.
- Claude must receive actual image content, not an engine-generated caption.
- Scene time advances only during robot movement/turning, not while the agent
  is waiting for a model response.
- Do not use real Claude credentials or make real API calls until authorized
  configuration is supplied.
- Do not change validated simulation physics or camera geometry without a
  demonstrated incompatibility and a focused regression test.

## Technology and environment

- OS used for validation: Windows 11 x64.
- Python: 3.11.9, project-local virtual environment at `.venv`.
- Simulator: PyBullet via `pybullet-arm64==3.2.8`. Its import name remains
  `pybullet`; basic runtime/connection checks passed in the project
  environment.
- HTTP engine: FastAPI and Uvicorn, bound to `127.0.0.1:8080`.
- Agent HTTP client: Requests.
- Claude SDK: official Anthropic Python SDK, already declared in
  `requirements.txt`; environment inspection found Anthropic 0.125.0 installed
  in `.venv`.
- Image handling: Pillow.
- Environment variables: `python-dotenv`.
- Tests: pytest.

Install dependencies into the existing environment with:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Current declared dependencies are in [requirements.txt](./requirements.txt).
Do not replace `pybullet-arm64==3.2.8` unless a reproducible incompatibility
is established. The previously attempted official PyBullet Windows package
did not provide a compatible wheel for this environment; Microsoft C++ Build
Tools were not installed.

## Progress by task

### Tasks 01–04 — project foundation and simulator readiness

- Audited the project scaffold, README, agent instructions, and dependency
  manifest before making fixes.
- Established the Windows Python 3.11 environment and project-local `.venv`.
- Evaluated and verified `pybullet-arm64==3.2.8` as the working PyBullet
  distribution on Python 3.11 x64. Direct-mode connection, API version,
  simulation step, disconnect, dependency check, and compilation were
  exercised during environment setup.
- Corrected the initial engine/world syntax and geometry/API issues; aligned
  camera FOV conversion with a 90-degree horizontal FOV at 640×480, corrected
  forward depth sensing, collision recovery/retry behavior, and API movement
  and turn bounds.
- Added cone support as a mesh because this PyBullet build does not expose a
  native `GEOM_CONE`. Both visual and collision geometry use the cone mesh so
  the object remains visibly and physically cone-shaped.
- At Task 04 completion, the reported baseline was 10 passing tests, DIRECT
  simulator initialization, a 640×480 camera image, and HTTP 200 responses
  from `/state`, `/look`, and `/depth`.

### Task 05 — live simulator validation

- Exercised the GUI simulator, live HTTP endpoints, camera, movement and
  turning, collision recovery and retries, pickup/attachment, drop-zone
  validation, and agent-facing information boundaries.
- Task 05.1 fixed the collision movement/back-off accounting discrepancy,
  camera blue band caused by the GUI orientation marker entering the camera
  view, and heading normalization. Camera remained 640×480, 90° horizontal
  FOV, 0.5 m high, and tilted down 10°.
- Task 05.2 separated physical release from task completion:
  `released`, `in_drop_zone`, and `result`. An inside-zone drop is `pass`;
  outside-zone is `fail_not_reached`; dropping without a held object is a
  state-preserving no-op.
- Task 05.3 corrected pickup distance to use collision-surface separation
  while preserving 0.5 m reach and ±30° alignment, and moved the carried
  object behind the robot to reduce forward-camera occlusion. Its live trials
  still did not complete successfully, so the simulator remained NO-GO at
  that point.
- Task 05.4 added local-only collision diagnostics, checked collision sweeps
  while turning with a held object, and identified a carried-cone/floor
  overlap causing a false collision. Attachment height now derives from the
  held object's collision bounds and maintains 0.03 m floor clearance.
  Collision detection and the three-retry maximum remain enabled.
- Final Task 05.4 evidence includes **three successful camera-guided Fetches**
  (Trials 1, 2, and 4), each ending with `result: "pass"` and zero retries.
  Trial 3 is retained as a pre-fix failure: a cone/floor collision stopped its
  turn; it was not quietly discarded or counted as a pass. After the fix, the
  same carried-cone turn completed and Trial 4 passed.
- The final Task 05.4 report recorded 27 tests passing at that task stage,
  compileall passing, and `pip check` reporting no broken requirements.
- Read [TASK_05_REPORT.md](./TASK_05_REPORT.md) for historical Task 05
  baseline findings; its later-task NO-GO statements are superseded by the
  Task 05.4 results. The staged reports are:
  [TASK_05_1_REPORT.md](./TASK_05_1_REPORT.md),
  [TASK_05_2_REPORT.md](./TASK_05_2_REPORT.md),
  [TASK_05_3_REPORT.md](./TASK_05_3_REPORT.md), and
  [TASK_05_4_REPORT.md](./TASK_05_4_REPORT.md).
- Live images, JSON responses, and private diagnostic evidence reside in
  [task_05_evidence/](./task_05_evidence/). Internal diagnostic collision
  IDs/roles are for local debugging only and must never be sent to Claude.

### Task 06A — Claude integration plumbing (complete)

- Added an explicit Anthropic SDK adapter configured from environment
  variables. There is no default model ID, API key, pricing, or custom
  endpoint. Real mode refuses to start without the required organizer values.
- Added an explicit `--mock` mode that uses deterministic local tool decisions
  and does not construct an Anthropic SDK client. Automated integration tests
  also use a fake engine, so they make no engine or Anthropic network calls.
- The one-tool-per-decision loop validates the tool and arguments, executes
  through the existing HTTP API, returns the tool result to the next model
  request, and stops on terminal task state, failure, error, or maximum steps.
- Six tools are exposed: `look`, `move`, `turn`, `pickup`, `drop`, and
  `get_state`. Movement bounds are -1..1 m; turn bounds are -90..90 degrees.
  Parallel tool use is disabled in the Anthropic request.
- Claude vision input contains the actual latest `/look` JPEG as an image
  content block, plus the user command, permitted robot state, optional
  scalar depth, and concise recent action/result history. Prior images are
  removed; a new frame is captured after move/turn but not after pickup/drop.
  `look` uses the latest already captured frame.
- Run logs are JSONL with `step`, `timestamp`, `tool`, validated `args`,
  `result`, and `frame_path`; PNG camera frames are stored alongside each
  run's log. Credentials and internal scene metadata are not logged.
- Budget controls: 25-step default; unconditional 60-step cap; configurable
  timeout and max output tokens; automatic SDK retries disabled; API-attempt
  and token counters; optional cost estimate only when documented per-million
  token prices are configured.
- The final Task 06A validation result is **36 passed** (one existing
  Starlette/httpx deprecation warning), compileall passed, and `pip check`
  passed.
- No real Claude API call was made. No Membrane feedback API integration was
  started.

See [TASK_06A_REPORT.md](./TASK_06A_REPORT.md) for detailed implementation,
mock coverage, privacy audit, and remaining limitations.

### Task 06B — controlled real API preflight

- Audited the real execution path and found the organizer-provided model ID
  and API key missing. No real API call was made.
- Added a real-only one-decision mode that validates one tool response without
  executing it, then documented it in
  [TASK_06B_PREFLIGHT_REPORT.md](./TASK_06B_PREFLIGHT_REPORT.md).
- Current product direction pauses all real Claude execution. Task 07 mission
  workflows do not require or load credentials.

### Task 07 — mission manager and multi-task architecture

- Added structured `Mission` and `MissionTask` models, ordered queues,
  dependency validation, mission/task lifecycle tracking, aggregate progress,
  action/retry metrics, and in-memory task-boundary interruption/resumption.
- Added the additive `POST /task/start` boundary. It preserves robot pose,
  object transforms, physics, and collision diagnostics; resets only
  task-scoped state; rejects active/failed/holding transitions; and records
  process-local task IDs for idempotent duplicate requests.
- An old duplicate request reports the old task's recorded state separately
  from the actual current active task ID.
- Added a structured JSON mission CLI restricted to mock decisions. Tasks
  complete only after both the drop response and safe engine state verify a
  successful in-zone delivery. Failed tasks fail the mission and skip pending
  tasks.
- Natural-language decomposition, dashboard work, and real Claude calls
  remain unimplemented/paused. See
  [TASK_07_REPORT.md](./TASK_07_REPORT.md).

## Simulator architecture

The engine and agent are separate processes:

1. `run_engine.py` starts `engine.server`.
2. FastAPI owns a `Simulation` from `engine.simulation`, which owns a `World`
   from `engine.world`.
3. `agent.runner` uses `agent.client.EngineClient` to communicate only through
   the local HTTP API.
4. `agent.tools` defines Claude's tool schemas; it does not contain scene
   layout facts.

The room contains a floor, four boundary walls, a marked floor drop zone, a
kinematically controlled robot, and five movable floor objects. Scene truth
and object metadata remain internal to `World` and `Simulation`.

### Existing HTTP API

| Method and path | Purpose and permitted response |
|---|---|
| `GET /health` | Service health. |
| `GET /state` | State name, robot x/y/heading, holding flag, retry count, collision flag, and result. |
| `GET /look` | Actual forward-camera JPEG; no scene description or segmentation. |
| `GET /depth` | Optional single forward-ray distance scalar. |
| `POST /move` | Bounded signed distance in metres; movement/collision/recovery status. |
| `POST /turn` | Bounded turn in degrees; turn/collision status. |
| `POST /pickup` | Success boolean only. |
| `POST /drop` | Release flag, zone verdict, and final task result; no object ID/coordinates. |

Movement and turn input bounds are also enforced by FastAPI request schemas.
Invalid inputs are rejected with HTTP 422.

### Camera and motion invariants

- Image: 640×480 JPEG.
- Horizontal FOV: 90°; the vertical projection FOV is calculated for 4:3.
- Camera: 0.5 m above floor, 10° downward tilt, forward-facing.
- Depth: a forward ray; it reports one distance and does not identify a target.
- Heading: 0° points along +x; positive heading is clockwise viewed from
  above; reported heading is normalized to `[0°, 360°)`.
- Movement: metres; turn: degrees. Robot moves kinematically after collision
  geometry checks.
- Collision movement reports progress through the first colliding candidate
  pose and separately reports the approximately 0.1 m back-off. The retry
  maximum remains three.
- Pickup retains 0.5 m surface reach and ±30° alignment.
- Carried objects are attached behind the robot; their floor clearance is
  computed from collision geometry.
- A drop inside the zone returns `result: "pass"`; outside returns
  `fail_not_reached`. A no-held-object drop does not mark the task done.

## Privacy and logging rules for future work

Permitted agent/model observations:

- Actual latest camera pixels.
- Robot state fields (`state`, x, y, heading, holding, retry count, collision
  flag, and result).
- Optional forward depth scalar.
- User command and safe tool/action results.

Forbidden in any model request, tool description, or submitted run log:

- Object IDs/names; colour or shape as metadata; object positions/counts or
  internal states; distances to named targets; segmentation masks; drop-zone
  coordinates; internal collision body IDs/roles.

Camera pixels naturally show rendered appearances, including object shapes,
colours, and the green zone marker. The restriction is against exposing
privileged structured metadata or coordinates. Diagnostic logs under
`task_05_evidence/task05_4_diagnostics/` are local-only and must not be added
to Claude observations or judge-submitted logs.

## Current Task 06A configuration

The safe template is [.env.example](./.env.example). Copy it to a private
`.env` only when configuring the project; do not commit real credentials.

Required before the first real call:

- `ANTHROPIC_API_KEY`: organizer-issued key.
- `CLAUDE_MODEL`: exact organizer-supplied model identifier.

Set `ANTHROPIC_BASE_URL` only if organizers require a non-default endpoint.
Optional configuration includes `ENGINE_BASE_URL`, `LOG_DIR`,
`CLAUDE_MAX_STEPS`, `CLAUDE_TIMEOUT_SECONDS`, `CLAUDE_MAX_TOKENS`,
`CLAUDE_INCLUDE_DEPTH`, and documented input/output prices. No secret,
identifier, endpoint, or pricing value is currently supplied or assumed.

## Known limitations and cautions

- Real Claude vision/tool behavior has not been validated; only SDK-compatible
  request construction and mock responses have been tested.
- Mock-mode CLI tool calls still control the local simulator if it is running.
  The automated mock tests use a fake engine.
- Manual camera-guided trials establish simulator behavior on this fixed
  scene; they do not prove robustness to randomized layouts or physical
  hardware. Task 06A mock navigation is integration plumbing, not an
  autonomous navigation controller.
- Pylance has reported unresolved imports for Anthropic, dotenv, Pillow, and
  Requests despite successful imports from the project `.venv` and passing
  tests. Its workspace interpreter discovery has shown a global Python 3.14
  interpreter instead of the project Python 3.11 environment; treat this as
  an editor-analysis mismatch unless runtime checks fail.
- One existing Starlette/httpx deprecation warning remains in the test suite.
- The exact collision pair from the historical Task 05.3 retry-exhaustion
  trial was not recorded. The later Task 05.4 cone/floor issue was reproduced
  directly, fixed, and regression-tested.
- `TASK_05_REPORT.md` contains historical findings; use the later Task 05.x
  reports for current simulator status.

## Current status and next steps

**Tasks 01–06A and Task 07 complete. Task 06B remains preflight-only; no real
Claude API call has been made. Real API execution is paused.** The simulator
and existing single-task mock runner remain intact.

Recommended next work, subject to owner approval:

1. Add broader mission executor strategies without introducing a fake
   natural-language planner or weakening the validated tool/API boundaries.
2. Improve structured task execution and retry/recovery policy using the
   existing visual observations; preserve robot/object transforms on task
   boundaries and do not claim delivery without verified drops.
3. Validate multi-task sequences with the GUI simulator, including the case
   where task one succeeds and task two must continue from the preserved robot
   pose and environment.
4. Define dashboard scope only after the mission lifecycle and data model are
   accepted; dashboard implementation has not started.
5. Treat any future real Claude or Membrane feedback API work as a separately
   authorized phase. Do not configure or use credentials while it is paused.

## Important files and reports

- Project overview and run instructions: [README.md](./README.md)
- Scoped constraints: [VSCODE_AGENT_TASK.md](./VSCODE_AGENT_TASK.md)
- Dependencies/configuration: [requirements.txt](./requirements.txt),
  [.env.example](./.env.example)
- Engine: [engine/config.py](./engine/config.py),
  [engine/world.py](./engine/world.py),
  [engine/simulation.py](./engine/simulation.py),
  [engine/server.py](./engine/server.py)
- Agent: [agent/client.py](./agent/client.py),
  [agent/tools.py](./agent/tools.py),
  [agent/runner.py](./agent/runner.py),
  [agent/mission.py](./agent/mission.py),
  [run_agent.py](./run_agent.py), [run_mission.py](./run_mission.py)
- Tests: [tests/test_contract.py](./tests/test_contract.py),
  [tests/test_simulation.py](./tests/test_simulation.py),
  [tests/test_server_contract.py](./tests/test_server_contract.py),
  [tests/test_agent_runner.py](./tests/test_agent_runner.py),
  [tests/test_mission.py](./tests/test_mission.py)
- Task reports: [TASK_05_REPORT.md](./TASK_05_REPORT.md),
  [TASK_05_1_REPORT.md](./TASK_05_1_REPORT.md),
  [TASK_05_2_REPORT.md](./TASK_05_2_REPORT.md),
  [TASK_05_3_REPORT.md](./TASK_05_3_REPORT.md),
  [TASK_05_4_REPORT.md](./TASK_05_4_REPORT.md),
  [TASK_06A_REPORT.md](./TASK_06A_REPORT.md),
  [TASK_06B_PREFLIGHT_REPORT.md](./TASK_06B_PREFLIGHT_REPORT.md),
  [TASK_07_REPORT.md](./TASK_07_REPORT.md)
- Live simulator images/results and local diagnostics:
  [task_05_evidence/](./task_05_evidence/)
- This handoff: [PROJECT_HANDOFF.md](./PROJECT_HANDOFF.md)
