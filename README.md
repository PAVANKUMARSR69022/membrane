# Membrane Robot — Build 01

A Python/PyBullet implementation scaffold based on the supplied 7-page Membrane Robot brief.

## Important implementation boundary

The simulation engine owns all scene/object truth. The agent and Claude must only receive:
- `/state`: state, robot x/y, heading, holding flag, retry count, and final task result (when available)
- `/look`: robot camera JPEG
- `/depth`: optional single-ray distance
- movement/pickup/drop results

Never add object names, IDs, colours, shapes, positions, counts, target distances, segmentation masks, or drop-zone coordinates to agent-facing responses, prompts, tool descriptions, filenames, or logs.

This project uses PyBullet as a proposed simulator because the brief does not mandate a specific engine. If organizers provide a required simulator or starter engine, adapt this scaffold rather than forcing PyBullet.

## Recommended Python version

Use **Python 3.11** for the initial setup. PyBullet wheels can be less predictable on very new Python versions.

## Windows setup (PowerShell)

```powershell
py -3.11 -m venv .venv
.\\.venv\\Scripts\\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

If activation is blocked in PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\\.venv\\Scripts\\Activate.ps1
```

If `py -3.11` is unavailable, install Python 3.11 x64 first, then retry.

On Windows, PyPI does not provide a prebuilt `pybullet==3.2.7` wheel. Installing
the requirements may therefore try to compile PyBullet and require Microsoft
C++ Build Tools 14.0 or later. Python 3.11 alone does not remove that build
requirement.

## Linux setup

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

## Run the simulation engine

```bash
python run_engine.py
```

The PyBullet GUI opens and the HTTP API listens at `http://127.0.0.1:8080`.

Open `http://127.0.0.1:8080/docs` to inspect the local API.

## Smoke-test the engine

In a second terminal (with the same venv activated):

```bash
python scripts/smoke_test.py
```

The smoke test checks state, camera image, depth, movement, turning, pickup and drop endpoints. It does not expose scene object metadata.

## Existing agent architecture (real API paused)

The agent is a separate process from the simulator. The existing Task 06A
real-mode path can send the latest actual camera JPEG (not a generated
description), user command, permitted robot state, optional scalar depth, and
recent action results to the Anthropic Messages API. Real API execution is
paused and is not used by Task 07. The agent's six bounded tools are `look`,
`move`, `turn`, `pickup`, `drop`, and `get_state`; actions use the existing
engine HTTP endpoints.

The engine remains the only owner of scene truth. No object IDs, metadata,
coordinates, counts, segmentation, or drop-zone coordinates are included in
Claude's observations, tool descriptions, or run logs. Camera PNGs and a
JSONL action log are stored under `LOG_DIR` in a per-run directory.

The existing Task 06A real-mode configuration remains documented in
`.env.example`, but is paused for the current development focus. Task 07 uses
only mock decisions and requires no API key or model ID.

### Mock mode (no Anthropic network calls)

Start the engine in one terminal:

```powershell
python run_engine.py
```

In another terminal, with `.venv` active:

```powershell
python run_agent.py --mock --command "Fetch the requested item"
```

Mock mode uses deterministic simulated Claude tool decisions, but tool actions
still go to the running local engine and can move the simulated robot. It
never constructs the Anthropic SDK client. The integration tests use a fake
engine as well, so they do not call either the Anthropic API or a live engine:

```powershell
python -m pytest -q tests/test_agent_runner.py
```

### Structured multi-task missions (Task 07, mock only)

Task 07 adds an agent-side mission manager for explicitly supplied, ordered
tasks. It does not decompose natural-language commands or use Claude. Create a
JSON file containing the original user command and structured task records:

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

Start the engine as above, then run the structured mission:

```powershell
python run_mission.py --mock --mission mission.json
```

The manager runs tasks in queue order, starts each through the additive
`POST /task/start` boundary, and only marks a Fetch task completed after a
drop response and final state both confirm `released: true`,
`in_drop_zone: true`, and `result: "pass"`. Failed tasks stop the mission and
leave later tasks skipped. Collision/recovery retries are tracked per task;
the existing executor handles recovery and the simulator's retry limit is
unchanged. Mission interruption is honored at task boundaries; resumption is
available in memory on the same manager instance. Mission JSON does not
include simulator object metadata.

The mock decision sequence is deterministic plumbing, not a planner. Task
descriptions are structured input and are not interpreted by an AI planner;
a mock run may fail to complete a Fetch, and the manager will report that
failure instead of claiming success. Task 07 does not read or require Claude
credentials and does not make API calls. The existing single-task
`run_agent.py --mock` path remains available and does not call
`POST /task/start`.

### Real API integration status

Real Claude API execution is paused. Do not configure or use credentials for
Task 07. The existing Task 06A client and controlled one-shot path are retained
in the codebase but are not used by the mission manager or its tests. Any
future real-API work requires a separately approved task.

## VS Code Agent instructions

Open `VSCODE_AGENT_TASK.md and ask your VS Code coding agent to inspect the project. It contains scoped tasks and non-negotiable rules. Do not ask it to rewrite the whole project in one shot.

## Known initial simplifications

- The robot is represented by a wheeled capsule-like body and is controlled kinematically through bounded movement commands.
- Pickup is a snap/attachment, as explicitly permitted by the brief; full grasping physics is not implemented.
- Scene clock advances during movement/turn commands and remains paused while the agent is thinking.
- The engine runs a 30 Hz step loop while executing movement/turn commands.
- `/depth` is a single forward ray and does not identify the object.
- The room and objects are randomized only if the scene seed is changed. Do not expose seed or object metadata to Claude.

## Safety and compliance checklist

- Keep `.env` private; never commit API keys.
- Do not log engine-internal object state.
- Do not use hidden simulator state to help Claude identify targets.
- `/pickup` returns success/failure only.
- `/drop` reports `released`, `in_drop_zone`, and `result` separately. A release
  inside the zone completes with `result: "pass"`; a release outside completes
  with `result: "fail_not_reached"`. Dropping without holding an object is a
  state-preserving no-op and does not report a passing result.
- Save image frames as PNG and tool steps as JSONL when running the agent.
