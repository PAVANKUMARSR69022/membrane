# Task 06B — Controlled Claude API Preflight

**Date:** 2026-11-04
**Status:** NOT READY for a real Claude decision. No real API call was made.

## Files inspected

- Project guidance and history: `PROJECT_HANDOFF.md`, `TASK_06A_REPORT.md`,
  `README.md`, and `requirements.txt`.
- Configuration: `.env.example`, `agent/runner.py` environment loading and
  configuration code. No project `.env` file was present.
- Agent: `agent/client.py`, `agent/tools.py`, `agent/runner.py`, and
  `run_agent.py`.
- Engine/API boundary: `engine/config.py`, `engine/server.py`,
  `engine/simulation.py`, and `engine/world.py`.
- Tests: `tests/test_agent_runner.py`, `tests/test_contract.py`,
  `tests/test_server_contract.py`, and `tests/test_simulation.py`.

The simulator configuration, physics, camera geometry, and HTTP contracts
were not changed.

## Real API configuration status

Only presence was checked; no credential or configured value was displayed.

| Variable | Status |
|---|---|
| `ANTHROPIC_API_KEY` | **Missing** |
| `CLAUDE_MODEL` | **Missing** |

Both variables were missing from the current process, user, and machine
environment scopes. No project `.env` or ancestor `.env` file was present on
the loader's search path. The template contains blank placeholders. No model
identifier was guessed or substituted.

Before a real request, obtain the API key and exact model identifier from the
organizers and put them directly into a private, ignored project `.env` file.
Do not send credentials through chat or add them to reports. Set
`ANTHROPIC_BASE_URL` only if organizers require a custom endpoint. Published
provider prices can optionally be entered in the two pricing variables;
otherwise cost estimation remains unavailable.

## Real execution-path audit

- `load_dotenv()` loads local configuration when the CLI starts. Real mode
  requires both `ANTHROPIC_API_KEY` and `CLAUDE_MODEL`; there is no fallback
  model or credential.
- The Anthropic SDK module is imported by `agent.runner`, but the SDK client
  is constructed only by `AnthropicDecisionClient`, selected for real mode.
  Mock mode selects `MockAnthropicClient` and works without API credentials.
- The real adapter sends the configured model, configured output-token limit,
  tool definitions from `agent/tools.py`, and
  `tool_choice={type: "any", disable_parallel_tool_use: true}`. SDK retries
  are set to zero and the configured timeout is passed to the SDK.
- The engine client checks that `/look` returns JPEG. Vision content is made
  from those actual camera bytes as a base64 `image/jpeg` block. No caption,
  scene summary, or synthetic image description is created.
- State is filtered through `ALLOWED_STATE_FIELDS` (`state`, robot `x`, `y`,
  `heading`, `holding`, `retry_count`, `collided`, and `result`). If enabled,
  depth is one scalar. The current command and permitted observation accompany
  the image.
- Exactly one `tool_use` block is accepted. Its name must be in the six-tool
  allowlist, and its arguments are validated against the same strict
  argument/range constraints before execution in the full runner. Unsupported
  tools, extra or malformed arguments, and multiple tool calls are rejected.
- `max_tokens` is passed to the SDK, and responses with
  `stop_reason="max_tokens"` are now rejected rather than treated as usable
  decisions. API exceptions are reported by type without echoing exception
  text. The 60-step hard cap remains enforced in both configuration and the
  loop.
- The full runner logs only step, timestamp, tool, validated args, safe
  endpoint result, and frame path; it does not log the key. The controlled
  one-shot mode reports only the selected tool, validated arguments, call and
  token counts, and cost estimate (if configured). It does not persist the
  image, send it to a log, or execute the selected tool.
- The engine HTTP surface returns only the permitted robot state, camera
  pixels, scalar depth, and safe action results. Tool descriptions contain
  controls rather than scene contents. Internal object metadata remains
  engine-only.

## Controlled one-decision path

The former `--real` CLI always entered the autonomous loop and could execute a
tool immediately. It therefore did not provide a safe way to make only one
real decision. A real-only `--once` mode was added:

```powershell
.\.venv\Scripts\python.exe run_agent.py --real --once --command "This is a one-decision test. Use the current image and permitted observations to choose exactly one next robot-control tool for a Fetch task. The tool will not be executed."
```

It reads the current permitted state, captures one current camera frame (and
the optional depth scalar), makes exactly one model request, validates exactly
one supported tool and its arguments, prints the selected tool and arguments,
and exits. The mode cannot be combined with `--mock` or `--max-steps`. It does
not invoke move, turn, pickup, drop, or any other selected tool. It does not
start a Fetch loop. The original `--real` behavior remains the full runner and
must not be used for this preflight decision.

The one-shot code path was tested only with local mock responses. The command
above was **not** run with valid credentials and has not made a real API call.

## Privacy and security findings

- The configuration audit did not reveal or print any credential values.
- `ANTHROPIC_API_KEY` is held in an `AgentConfig` field excluded from its
  representation; API exceptions are not copied verbatim to output or logs.
- Robot state filtering, tool schemas, endpoint response shapes, and
  information-boundary tests exclude structured object identity/metadata,
  object positions/counts, named-object distances, segmentation, and
  drop-zone coordinates.
- Camera pixels naturally show rendered appearances. No separate privileged
  camera or structured image description is supplied.
- The one-shot response is not executed, even when it selects a valid
  movement or manipulation tool.
- No simulator changes, real credentials, API calls, or autonomous run were
  made.

## Offline validation

Using the project `.venv` with Python 3.11.9:

- `pytest -q`: **40 passed**, with one existing Starlette/httpx deprecation
  warning.
- `python -m compileall engine agent tests`: **passed**.
- `python -m pip check`: **No broken requirements found**.
- `python run_agent.py --help`: **passed** and shows the one-shot mode.
- `python run_agent.py --real --once ...` with configuration missing:
  **refused before client construction or any API request**; it reported only
  the missing variable names.

The VS Code `runTests` helper did not discover this project’s tests, so the
suite was run directly with the project virtual environment. The direct
pytest run completed successfully.

## Problems and readiness gate

**Blocking configuration:** both required settings are missing:
`ANTHROPIC_API_KEY` and the exact organizer-provided `CLAUDE_MODEL`.

The engine was not started or contacted during this preflight. It must be
started and its local health/state/camera endpoints checked before the
controlled call. The existing Pylance interpreter mismatch noted in
`PROJECT_HANDOFF.md` remains an editor-analysis limitation; it did not prevent
runtime tests in the Python 3.11.9 project environment. The existing
Starlette/httpx deprecation warning is non-blocking for this request.

## Exact steps for the first controlled real test

1. Obtain the exact API key and model identifier from the organizers. Do not
   guess either value and do not paste the key into chat.
2. In the project root, copy `.env.example` to `.env` and set
   `ANTHROPIC_API_KEY` and `CLAUDE_MODEL` there. Set a custom base URL only if
   organizers specify one. Leave step, retry, and token limits unchanged.
3. Keep `.env` private; verify that it remains ignored by Git without printing
   its contents.
4. Start the GUI engine from the project root using the existing Python 3.11
   environment:

   ```powershell
   .\.venv\Scripts\python.exe run_engine.py
   ```

5. In another terminal, confirm `GET /health`, `/state`, `/look`, and `/depth`
   work locally. Confirm `/look` returns the current robot camera image.
6. After explicit owner approval for one billable real API request, run only
   the `.venv\Scripts\python.exe ... --real --once` command above. Inspect its
   JSON output, especially `api_calls`, `tool`, `args`, and
   `tool_executed: false`. If saving the output under `logs/`, use a `.json`
   file; runtime JSON logs there are ignored by Git. Stop after that response;
   do not launch `--real` without `--once`.
7. Review the returned tool/arguments and information boundary before deciding
   whether to authorize any later action or autonomous run.

## Files changed for this preflight

- `agent/runner.py` — added the non-executing one-decision mode and rejection
  of token-truncated responses.
- `.gitignore` — excludes saved one-shot JSON output under `logs/`.
- `tests/test_agent_runner.py` — added offline coverage for one-shot vision
  payloads, privacy filtering, no tool execution, multi-tool rejection,
  token-limit rejection, and SDK request settings.
- `README.md` — documented the controlled real-mode command.
- `TASK_06B_PREFLIGHT_REPORT.md` — this report.

## Recommendation

**NOT READY for the first controlled real Claude API decision.** The one-shot
software path and offline regression tests are ready, but the required
organizer-provided API key and exact model ID are missing, and the engine has
not been checked running. Configure the required values privately, verify the
engine, and obtain explicit approval before making the one permitted real API
request. No real API call or full Fetch has been made.
