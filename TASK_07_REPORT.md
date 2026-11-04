# Task 07 — Mission Manager and Multi-Task Architecture

## Status

**Task 07 implementation complete; Claude API integration remains paused.**
The single-task executor remains available. Mission input is structured JSON;
there is no natural-language decomposition or pretend planner. The simulator's
physics, camera geometry, movement speed, pickup reach, collision rules, and
existing HTTP contracts were not changed.

## Architecture

The mission manager is an agent-side orchestration layer in
`agent/mission.py`. It owns mission/task descriptions, ordered queue state,
dependencies, lifecycle timestamps, counters, interruption, and resumption.
It delegates each task to an injected task executor. The CLI currently supplies
`MockMissionTaskExecutor`, which reuses `AgentRunner` and its validated robot
tools with deterministic offline `MockAnthropicClient` decisions.

No AI planner parses free-form natural language. The `original_command` is
preserved for context, while each task is explicitly supplied with a
description and optional target/destination descriptions.

### Task-boundary API

The additive `POST /task/start` endpoint accepts:

```json
{"task_id": "mission-2026-01:task-A"}
```

Only the caller-provided `task_id` is accepted; extra body properties are
rejected. IDs are used for process-local idempotency and are not object IDs.
A new task is accepted only from initial `Idle`/no-result or after `Done` with
`result: "pass"`, and only when the simulator confirms that no object is held.
The transition is atomic under the simulation lock.

New-start example:

```json
{
  "status": "started",
  "task_id": "mission-2026-01:task-A",
  "task_status": "running",
  "active_task_id": "mission-2026-01:task-A",
  "robot_state": {
    "state": "Locate",
    "x": 0.0,
    "y": 0.0,
    "heading": 0.0,
    "holding": false,
    "retry_count": 0,
    "collided": false,
    "result": null
  }
}
```

The task transition resets only `state_name`, `result`, `retry_count`, and
`last_collision`, and updates task-ID bookkeeping. It preserves robot position
and orientation, all object transforms, the world/physics connection,
collision diagnostics, and mission history and aggregate metrics. The
simulator does not teleport the robot or move objects.

Task IDs are idempotent for the lifetime of the simulator process. A duplicate
of a completed Task A while Task B is active returns Task A's recorded
`task_status: "completed"` and identifies Task B separately as the
`active_task_id`; it cannot report A as active. A duplicate of the currently
active task reports `task_status: "running"` and that same active ID. Reusing
an ID never starts a new task.

Invalid transitions return HTTP 409 with a safe error code such as
`object_still_held`, `task_in_progress`, `previous_task_not_successful`, or
`invalid_task_state`. Invalid request bodies return HTTP 422. No object or
drop-zone metadata is included. Existing endpoints are unchanged.

### Data models and lifecycle

`MissionTask` stores:

- Task ID and description.
- Optional target and destination descriptions.
- Ordered dependencies.
- Status: `pending`, `running`, `completed`, `failed`, or `skipped`.
- Retry count and configured task retry limit.
- Safe result summary and created/started/completed timestamps.

`Mission` stores:

- Mission ID and original user command.
- Ordered tasks and current task ID.
- Status: `pending`, `running`, `completed`, `failed`, or `interrupted`.
- Created/started/completed timestamps.
- Total action-decision steps, total collision retries, and computed progress.

Dependencies must refer to earlier tasks in the supplied ordered queue.
Unknown, self, duplicate, or forward dependencies are rejected.

Each task transitions from `pending` to `running`, then to `completed` only if
the executor completed and both the drop result and current engine state verify
`released: true`, `in_drop_zone: true`, and `result: "pass"`. Pickup success
alone is insufficient. A failed task fails the mission and remaining pending
tasks become `skipped`.

The existing executor handles collision recovery and stops at the simulator's
unchanged retry limit. The manager records each task's retry count and
aggregates it at mission level. Retry exhaustion fails the task and mission;
the mission layer does not retry by resetting a failed physical task.

`request_interrupt()` is honored after the current task completes, at a safe
task boundary. `resume()` continues pending tasks on the same in-memory
manager/mission instance. Interrupting midway through an action sequence or
resuming after process restart is not supported.

## Mock multi-task usage

Start the engine in one terminal:

```powershell
python run_engine.py
```

Create `mission.json` with explicitly structured tasks. Example:

```json
{
  "mission_id": "mission-2026-01",
  "original_command": "Deliver two requested items in order.",
  "tasks": [
    {
      "task_id": "task-A",
      "description": "Deliver the first requested item.",
      "target_description": "red cube behind yellow cylinder",
      "destination_description": "green square"
    },
    {
      "task_id": "task-B",
      "description": "Deliver the second requested item.",
      "target_description": "blue sphere",
      "destination_description": "green square",
      "dependencies": ["task-A"]
    }
  ]
}
```

Run the mock-only mission CLI in another terminal:

```powershell
python run_mission.py --mock --mission mission.json
```

This mode does not load or require API credentials and does not create an
Anthropic SDK client. Its deterministic mock decisions are integration
plumbing, not a planner and not guaranteed to complete arbitrary scene tasks.
The mission manager reports actual failed/unverified tasks rather than
claiming success. The existing `python run_agent.py --mock --command "..."`
single-task behavior remains unchanged and does not call `POST /task/start`.

## Information boundary

Mission descriptions and user-supplied target/destination language remain
agent-side. The manager uses the existing safe engine client and reads only
public task result/state/retry fields. Task-start responses use the existing
permitted robot state shape. It does not retrieve or serialize object IDs,
object metadata/positions/counts, named target distances, segmentation, or
drop-zone coordinates. No Claude calls, credentials, or real API integrations
are used by Task 07.

## Files changed

- `engine/simulation.py` — guarded task transition and process-local
  idempotency/status tracking.
- `engine/server.py` — additive `/task/start` route and strict request model.
- `agent/client.py` — `start_task()` client method.
- `agent/mission.py` — mission/task models, queue validation, mock executor,
  sequential manager, retry/progress accounting, and boundary interruption/
  resumption.
- `run_mission.py` — structured JSON mission CLI restricted to mock decisions.
- `tests/test_simulation.py` — successful/invalid/duplicate transitions and
  reset/preservation checks.
- `tests/test_server_contract.py` — route validation and safe conflict mapping.
- `tests/test_agent_runner.py` — existing executor compatibility and endpoint
  client mapping coverage.
- `tests/test_mission.py` — mission lifecycle, sequential execution,
  delivery-verification, retry exhaustion, dependencies, interruption/
  resumption, privacy, and credential-independent mock configuration.
- `README.md` — Task 07 architecture, mock mission usage, and paused real API
  status.
- `PROJECT_HANDOFF.md` — updated project direction, Task 07 progress, and
  current follow-up recommendations.
- `TASK_07_REPORT.md` — this report.

Pre-existing uncommitted Task 06B changes were preserved; no files were
reverted.

## Validation

Run from the project root using the existing Python 3.11 `.venv`:

- `pytest -q`: **66 passed**, with one existing Starlette/httpx deprecation
  warning.
- `python -m compileall engine agent tests`: **passed**.
- `python -m pip check`: **No broken requirements found**.
- `python run_mission.py --help`: **passed**; the CLI requires explicit
  `--mock` mode.
- Pylance diagnostics for changed Python files: **no errors**.

## Limitations and next work

- Arbitrary natural-language command decomposition is intentionally not
  implemented; callers must provide structured tasks.
- Deterministic mock tool decisions are not a navigation planner and can fail
  on the live scene.
- Mission state/resumption is in memory only and only at task boundaries.
- A failed/held task requires a separate recovery design; the manager will not
  silently drop an object, teleport the robot, or reset the world.
- The project dashboard has not started.
- Real Claude API integration is paused and was not used.
