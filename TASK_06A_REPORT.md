# Task 06A — Claude Vision and Tool Integration

## 1. Files changed

- `agent/client.py` — made HTTP errors explicit, verified camera media type, and added session cleanup.
- `agent/tools.py` — added `get_state`; defined six scene-independent tools with strict JSON schemas and input ranges.
- `agent/runner.py` — added environment configuration, explicit real/mock modes, the bounded single-tool loop, real Anthropic SDK adapter, test mock, vision message construction, frame conversion, safe logging, usage/cost accounting, and terminal/error handling.
- `run_agent.py` — routed CLI arguments through the new explicit-mode parser.
- `.env.example` — documented required/optional settings without credentials or assumed prices.
- `README.md` — documented architecture, environment variables, mock and real invocation, and budget controls.
- `tests/test_agent_runner.py` — added offline integration, endpoint mapping, boundary, error, and hard-limit tests.
- `TASK_06A_REPORT.md` — this report.

No simulator physics, camera geometry, engine API response, dependency, or requirement file was changed. The installed Anthropic SDK was already declared by `requirements.txt`; environment inspection found Anthropic SDK 0.125.0 in the project `.venv`.

## 2. Claude integration architecture

The local API remains the only route between agent and simulator. `EngineClient` raises on unsuccessful HTTP responses. The runner obtains safe robot state and optional depth, then sends one Claude Messages request per decision with tool choice set to `any` and parallel tool use disabled. It accepts exactly one `tool_use` block, validates the tool name and arguments locally, invokes only its matching existing engine operation, and places the result in the next Claude request.

The loop stops on `Done`/task result, `Failed`, retry exhaustion, an API/engine/validation error, or the configured step limit. The configured default is 25 steps; both environment and CLI values are capped at 60. SDK retries are disabled, and request timeouts are configurable.

The engine advances only when `/move` or `/turn` is invoked. A camera frame is captured initially and after each move or turn. Pickup and drop do not trigger extra camera requests. A `look` tool uses the already supplied latest camera frame, avoiding redundant consecutive captures.

## 3. Tool definitions

Claude receives only these six tools:

| Tool | Engine operation | Arguments |
|---|---|---|
| `look` | Use latest `/look` frame already supplied | none |
| `move` | `POST /move` | `distance`, finite number in `[-1, 1]` metres |
| `turn` | `POST /turn` | `degrees`, finite number in `[-90, 90]` |
| `pickup` | `POST /pickup` | none |
| `drop` | `POST /drop` | none |
| `get_state` | `GET /state` | none |

Empty-argument tools reject extra properties; numeric tools reject booleans, non-numbers, non-finite values, extra keys, and out-of-range values. Unsupported names and invalid arguments stop the run without executing an engine action. The existing HTTP mappings are covered by a recording-session regression test.

## 4. Vision image handling

The runner sends the actual JPEG bytes returned by `/look` as a base64 Anthropic image content block with `media_type: image/jpeg`. It does not derive or send a caption or scene summary. PNG copies are saved locally under each run's `frames/` directory; each JSONL entry points to the frame used for that decision. Previous images are stripped from conversation history before a new request, so only one latest image is sent per request. Historical text is bounded to the most recent four tool/result turns.

## 5. Mock test results

All integration tests use deterministic mock Claude responses and a fake engine; there were no Anthropic network calls. Mock coverage exercises initial image observation, a look decision, turn, forward movement, pickup, carrying movement, drop, terminal `Done`/`pass`, returned tool results, API exception, invalid arguments, unsupported tool rejection, and the 60-step hard stop. The mock test also prevents Anthropic client construction, checks the transmitted vision payload decodes to the actual camera JPEG, verifies one image per request, and checks that camera captures occur only initially and after movement/turning. An SDK 0.125.0 `ToolUseBlock` response object is also tested through the same parser used by the live adapter.

Final validation:

- `pytest -q`: **36 passed**, with one existing Starlette/httpx deprecation warning.
- `python -m compileall engine agent tests`: **passed**.
- `python -m pip check`: **No broken requirements found**.
- `python run_agent.py --help`: **passed**; the CLI requires explicit `--mock` or `--real`.
- Anthropic SDK signatures were inspected in the `.venv` without making a request; SDK 0.125.0 supports the configured `Messages.create` call and `ToolChoiceAnyParam` with `disable_parallel_tool_use`.

## 6. Information-boundary audit

The only state fields included in Claude messages or `get_state` results are `state`, robot `x`, `y`, `heading`, `holding`, `retry_count`, `collided`, and `result`. Optional `/depth` is one scalar. Camera input is pixels only. User command and recent action/tool results are also sent.

Tool schemas, message construction, state filtering, and logs contain no engine object IDs, names, metadata, positions, counts, named-object distances, segmentation masks, or drop-zone coordinates. The unsupported tool name is deliberately not copied into logs. Per-run logs contain only step, timestamp, tool, validated args, safe result, and generic frame path; API keys and user commands are not logged. PNGs contain the permitted camera view.

## 7. Budget and safety controls

- Maximum run steps configurable by `CLAUDE_MAX_STEPS`, default 25, hard-capped at 60 (also overrideable with capped `--max-steps`).
- Maximum output tokens configurable by `CLAUDE_MAX_TOKENS`.
- Claude request timeout configurable by `CLAUDE_TIMEOUT_SECONDS`; SDK automatic retries disabled.
- API attempt counter and provider usage-token totals returned in the run summary.
- Estimated cost is reported only when both `CLAUDE_INPUT_PRICE_PER_MILLION` and `CLAUDE_OUTPUT_PRICE_PER_MILLION` are supplied as documented USD-per-million-token rates. Otherwise cost is `null`; no pricing is assumed.
- Real mode is opt-in. Mock mode does not construct an Anthropic SDK client. Unit tests use a fake engine and make no HTTP requests.
- Errors are reported without echoing exception text that might contain credentials or request details.

## 8. Remaining limitations

- No organizer-provided model ID, API key, or custom base URL was available; real API calls were intentionally not made. Vision/tool-use behavior has not been validated against an actual Claude response.
- Mock mode uses deterministic decisions and is for integration plumbing, not proof of autonomous navigation. When launched as a CLI against the running engine, its local actions still control the simulator.
- Cost estimates require organizer/provider pricing values; until configured, cost is intentionally unknown.
- One existing dependency warning remains: Starlette deprecates its current httpx TestClient integration. It did not fail tests and was not changed as unrelated to the requested integration.
- Pylance continues to report unresolved imports for `anthropic`, `dotenv`, `PIL`, and `requests` in editor diagnostics after the workspace interpreter was set to `.venv`. The explicitly selected `.venv` interpreter successfully imports Anthropic 0.125.0 and the full test suite passes; this appears to be an editor-analysis environment mismatch, not a runtime dependency failure.

## 9. Exact configuration needed for the first real Claude call

Obtain from the organizers and enter into the private `.env` file:

1. `ANTHROPIC_API_KEY` — the issued credential.
2. `CLAUDE_MODEL` — the exact model identifier supplied by the organizers.
3. `ANTHROPIC_BASE_URL` only if they specify a non-default API endpoint.
4. Optional published input/output USD price rates if cost estimates are wanted.

No credential, model identifier, endpoint, or pricing value has been invented. The engine must be running locally before invoking `python run_agent.py --real --command "<user task>"`. Until the required organizer values are provided, real mode refuses to start.
