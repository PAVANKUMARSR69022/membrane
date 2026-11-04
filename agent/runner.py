import argparse
import base64
import io
import json
import math
import os
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from PIL import Image

from agent.client import EngineClient
from agent.tools import TOOLS

HARD_MAX_STEPS = 60
DEFAULT_MAX_STEPS = 25
ALLOWED_STATE_FIELDS = {
    "state",
    "x",
    "y",
    "heading",
    "holding",
    "retry_count",
    "collided",
    "result",
}
SYSTEM_PROMPT = (
    "You control a robot using exactly one provided tool per decision. "
    "Identify the requested target and marked destination only from the actual "
    "camera image. Use only the user command, image pixels, permitted robot "
    "state, optional forward depth, and recent action results. Do not assume "
    "hidden scene information. After an unsuccessful or collided action, "
    "reassess the latest observations. Stop acting when the task result is "
    "available or the robot reports a terminal state."
)
OBSERVATION_TEXT = (
    "Latest permitted robot observation (the attached image is the unmodified "
    "camera frame):\n{}"
)


class AgentConfigurationError(ValueError):
    pass


class AgentRunError(RuntimeError):
    pass


@dataclass(frozen=True)
class AgentConfig:
    api_key: str | None = field(default=None, repr=False)
    model: str | None = None
    base_url: str | None = None
    timeout_seconds: float = 60.0
    max_steps: int = DEFAULT_MAX_STEPS
    include_depth: bool = True
    log_dir: Path = Path("logs")
    input_price_per_million: float | None = None
    output_price_per_million: float | None = None
    max_tokens: int = 1024

    @classmethod
    def from_env(cls, environ=None):
        values = os.environ if environ is None else environ

        def optional_price(name):
            raw = values.get(name, "").strip()
            if not raw:
                return None
            try:
                price = float(raw)
            except ValueError as exc:
                raise AgentConfigurationError(
                    f"{name} must be a non-negative number"
                ) from exc
            if not math.isfinite(price) or price < 0:
                raise AgentConfigurationError(
                    f"{name} must be a non-negative number"
                )
            return price

        raw_steps = values.get("CLAUDE_MAX_STEPS", str(DEFAULT_MAX_STEPS)).strip()
        try:
            requested_steps = int(raw_steps)
        except ValueError as exc:
            raise AgentConfigurationError(
                "CLAUDE_MAX_STEPS must be a positive integer"
            ) from exc
        if requested_steps < 1:
            raise AgentConfigurationError(
                "CLAUDE_MAX_STEPS must be a positive integer"
            )

        raw_timeout = values.get("CLAUDE_TIMEOUT_SECONDS", "60").strip()
        try:
            timeout = float(raw_timeout)
        except ValueError as exc:
            raise AgentConfigurationError(
                "CLAUDE_TIMEOUT_SECONDS must be a positive number"
            ) from exc
        if not math.isfinite(timeout) or timeout <= 0:
            raise AgentConfigurationError(
                "CLAUDE_TIMEOUT_SECONDS must be a positive number"
            )

        raw_depth = values.get("CLAUDE_INCLUDE_DEPTH", "true").strip().lower()
        if raw_depth not in {"true", "false", "1", "0", "yes", "no"}:
            raise AgentConfigurationError(
                "CLAUDE_INCLUDE_DEPTH must be true or false"
            )

        raw_tokens = values.get("CLAUDE_MAX_TOKENS", "1024").strip()
        try:
            max_tokens = int(raw_tokens)
        except ValueError as exc:
            raise AgentConfigurationError(
                "CLAUDE_MAX_TOKENS must be a positive integer"
            ) from exc
        if max_tokens < 1:
            raise AgentConfigurationError(
                "CLAUDE_MAX_TOKENS must be a positive integer"
            )

        return cls(
            api_key=values.get("ANTHROPIC_API_KEY", "").strip() or None,
            model=values.get("CLAUDE_MODEL", "").strip() or None,
            base_url=values.get("ANTHROPIC_BASE_URL", "").strip() or None,
            timeout_seconds=timeout,
            max_steps=min(requested_steps, HARD_MAX_STEPS),
            include_depth=raw_depth in {"true", "1", "yes"},
            log_dir=Path(values.get("LOG_DIR", "logs").strip() or "logs"),
            input_price_per_million=optional_price(
                "CLAUDE_INPUT_PRICE_PER_MILLION"
            ),
            output_price_per_million=optional_price(
                "CLAUDE_OUTPUT_PRICE_PER_MILLION"
            ),
            max_tokens=max_tokens,
        )

    def require_real_api_settings(self):
        missing = []
        if not self.model:
            missing.append(
                "CLAUDE_MODEL (the exact organizer-provided model ID; it will not be guessed)"
            )
        if not self.api_key:
            missing.append("ANTHROPIC_API_KEY")
        if missing:
            raise AgentConfigurationError(
                "Real API mode requires: " + ", ".join(missing) + "."
            )


class AnthropicDecisionClient:
    def __init__(self, config):
        config.require_real_api_settings()
        options = {
            "api_key": config.api_key,
            "timeout": config.timeout_seconds,
            "max_retries": 0,
        }
        if config.base_url:
            options["base_url"] = config.base_url
        self._client = anthropic.Anthropic(**options)
        self._model = config.model
        self._max_tokens = config.max_tokens

    def create_message(self, messages):
        return self._client.messages.create(
            model=self._model,
            max_tokens=self._max_tokens,
            system=SYSTEM_PROMPT,
            messages=messages,
            tools=TOOLS,
            tool_choice={
                "type": "any",
                "disable_parallel_tool_use": True,
            },
        )


def _mock_tool_use(name, arguments, tool_id):
    return {
        "id": tool_id,
        "type": "tool_use",
        "name": name,
        "input": arguments,
    }


class MockAnthropicClient:
    """Deterministic tool decisions; never constructs an Anthropic SDK client."""

    def __init__(self, responses=None):
        self.responses = list(responses) if responses is not None else [
            _mock_tool_use("look", {}, "mock-1"),
            _mock_tool_use("turn", {"degrees": -10}, "mock-2"),
            _mock_tool_use("move", {"distance": 0.1}, "mock-3"),
            _mock_tool_use("pickup", {}, "mock-4"),
            _mock_tool_use("move", {"distance": 0.1}, "mock-5"),
            _mock_tool_use("drop", {}, "mock-6"),
        ]
        self.requests = []
        self.call_count = 0

    def create_message(self, messages):
        self.requests.append(messages)
        self.call_count += 1
        if not self.responses:
            raise AgentRunError("Mock decision sequence is exhausted")
        content = self.responses.pop(0)
        if isinstance(content, Exception):
            raise content
        return {
            "content": [content],
            "usage": {"input_tokens": 0, "output_tokens": 0},
        }


def _field(value, name, default=None):
    if isinstance(value, dict):
        return value.get(name, default)
    return getattr(value, name, default)


def _image_block(image_bytes):
    if image_bytes.startswith(b"\xff\xd8"):
        media_type = "image/jpeg"
    elif image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        media_type = "image/png"
    else:
        raise AgentRunError("Engine camera returned an unsupported image format")
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": media_type,
            "data": base64.b64encode(image_bytes).decode("ascii"),
        },
    }


def _write_frame(image_bytes, path):
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            image.convert("RGB").save(path, format="PNG")
    except Exception as exc:
        raise AgentRunError("Could not save the robot camera frame") from exc


def _safe_state(raw_state):
    if not isinstance(raw_state, dict):
        raise AgentRunError("Engine returned an invalid state response")
    return {key: raw_state[key] for key in ALLOWED_STATE_FIELDS if key in raw_state}


def _observation(engine, config):
    state = _safe_state(engine.state())
    observation = {"state": state}
    if config.include_depth:
        observation["depth"] = engine.depth()
    return observation


def _validate_tool(name, arguments):
    if name not in {tool["name"] for tool in TOOLS}:
        raise AgentRunError("Claude requested an unsupported tool")
    if not isinstance(arguments, dict):
        raise AgentRunError(f"Invalid arguments for tool {name}: expected an object")

    if name in {"look", "get_state", "pickup", "drop"}:
        if arguments:
            raise AgentRunError(f"Invalid arguments for tool {name}: no arguments expected")
        return {}

    expected_key = "distance" if name == "move" else "degrees"
    if set(arguments) != {expected_key}:
        raise AgentRunError(
            f"Invalid arguments for tool {name}: expected only {expected_key}"
        )
    value = arguments[expected_key]
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise AgentRunError(f"Invalid {expected_key}: expected a number")
    if not math.isfinite(float(value)):
        raise AgentRunError(f"Invalid {expected_key}: expected a finite number")
    low, high = (-1.0, 1.0) if name == "move" else (-90.0, 90.0)
    if not low <= float(value) <= high:
        raise AgentRunError(f"Invalid {expected_key}: outside the allowed range")
    return {expected_key: float(value)}


def _extract_single_tool(response):
    if _field(response, "stop_reason") == "max_tokens":
        raise AgentRunError("Claude response reached the output-token limit")
    content = _field(response, "content", [])
    tool_calls = [block for block in content if _field(block, "type") == "tool_use"]
    if len(tool_calls) != 1:
        raise AgentRunError(
            "Claude must return exactly one tool call for each decision"
        )
    block = tool_calls[0]
    name = _field(block, "name")
    if not isinstance(name, str):
        raise AgentRunError("Claude returned a malformed tool name")
    return (
        _field(block, "id"),
        name,
        _field(block, "input"),
        content,
    )


def run_single_decision(engine, decision_client, config, command):
    """Request and validate one vision decision without executing its tool."""
    if not isinstance(command, str) or not command.strip():
        raise AgentConfigurationError("A non-empty user command is required")

    state = _safe_state(engine.state())
    if _terminal_status(state):
        raise AgentConfigurationError(
            "A controlled decision requires a non-terminal simulator state"
        )

    image = engine.look()
    observation = {"state": state}
    if config.include_depth:
        observation["depth"] = engine.depth()
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": command},
                {
                    "type": "text",
                    "text": OBSERVATION_TEXT.format(
                        json.dumps(
                            observation,
                            separators=(",", ":"),
                            allow_nan=False,
                        )
                    ),
                },
                _image_block(image),
            ],
        }
    ]
    response = decision_client.create_message(messages)
    usage = _field(response, "usage", {})
    _, tool_name, raw_args, _ = _extract_single_tool(response)
    arguments = _validate_tool(tool_name, raw_args)
    input_tokens = int(_field(usage, "input_tokens", 0) or 0)
    output_tokens = int(_field(usage, "output_tokens", 0) or 0)
    return {
        "status": "decision_ready",
        "api_calls": 1,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "estimated_cost": _cost_estimate(
            config, input_tokens, output_tokens
        ),
        "tool": tool_name,
        "args": arguments,
        "tool_executed": False,
    }


def _terminal_status(state):
    if state.get("result") is not None or state.get("state") == "Done":
        return "done"
    if state.get("state") in {"Failed", "Error"}:
        return "failed"
    if state.get("retry_count", 0) >= 3:
        return "failed"
    return None


def _tool_result(engine, name, arguments):
    if name == "look":
        return {"available": True, "source": "latest camera frame"}
    if name == "get_state":
        return _safe_state(engine.state())
    if name == "move":
        return engine.move(arguments["distance"])
    if name == "turn":
        return engine.turn(arguments["degrees"])
    if name == "pickup":
        return engine.pickup()
    if name == "drop":
        return engine.drop()
    raise AgentRunError(f"Unsupported tool: {name}")


def _cost_estimate(config, input_tokens, output_tokens):
    if (
        config.input_price_per_million is None
        or config.output_price_per_million is None
    ):
        return None
    return (
        input_tokens * config.input_price_per_million
        + output_tokens * config.output_price_per_million
    ) / 1_000_000


class AgentRunner:
    def __init__(self, engine, decision_client, config, run_dir=None):
        self.engine = engine
        self.decision_client = decision_client
        self.config = config
        run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "_" + uuid.uuid4().hex[:8]
        self.run_dir = Path(run_dir) if run_dir else config.log_dir / run_id
        self.run_dir.mkdir(parents=True, exist_ok=True)
        self.frame_dir = self.run_dir / "frames"
        self.frame_dir.mkdir(parents=True, exist_ok=True)
        self.log_path = self.run_dir / "steps.jsonl"

    def _log(self, step, tool, args, result, frame_path):
        record = {
            "step": step,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "tool": tool,
            "args": args,
            "result": result,
            "frame_path": str(frame_path.relative_to(self.run_dir)),
        }
        with self.log_path.open("a", encoding="utf-8") as file:
            file.write(json.dumps(record, separators=(",", ":"), allow_nan=False) + "\n")

    def _request_messages(self, command, history, latest_image):
        if not history:
            content = [{"type": "text", "text": command}, _image_block(latest_image)]
            observation = _observation(self.engine, self.config)
            content.insert(
                1,
                {
                    "type": "text",
                    "text": OBSERVATION_TEXT.format(
                        json.dumps(observation, separators=(",", ":"), allow_nan=False)
                    ),
                },
            )
            return [{"role": "user", "content": content}]

        messages = [{"role": "user", "content": [{"type": "text", "text": command}]}]
        for assistant_content, user_content in history:
            messages.append({"role": "assistant", "content": assistant_content})
            messages.append({"role": "user", "content": user_content})

        for message in messages:
            if message["role"] == "user":
                message["content"] = [
                    block
                    for block in message["content"]
                    if not (isinstance(block, dict) and block.get("type") == "image")
                ]
        latest_user = messages[-1]["content"]
        observation = _observation(self.engine, self.config)
        latest_user.append(
            {
                "type": "text",
                "text": OBSERVATION_TEXT.format(
                    json.dumps(observation, separators=(",", ":"), allow_nan=False)
                ),
            }
        )
        latest_user.append(_image_block(latest_image))
        return messages

    def run(self, command):
        if not isinstance(command, str) or not command.strip():
            raise AgentConfigurationError("A non-empty user command is required")
        initial_state = _safe_state(self.engine.state())
        initial_terminal = _terminal_status(initial_state)
        if initial_terminal:
            summary = self._summary(initial_terminal, 0, 0, 0, initial_state)
            summary["estimated_cost"] = 0.0 if (
                self.config.input_price_per_million is not None
                and self.config.output_price_per_million is not None
            ) else None
            summary["run_dir"] = str(self.run_dir)
            summary["log_path"] = str(self.log_path)
            return summary

        latest_image = self.engine.look()
        current_frame_path = self.frame_dir / "frame_000.png"
        _write_frame(latest_image, current_frame_path)
        history = []
        api_calls = input_tokens = output_tokens = steps = 0
        status = "max_steps"
        error = None
        final_state = initial_state

        for step in range(1, min(self.config.max_steps, HARD_MAX_STEPS) + 1):
            messages = self._request_messages(command, history, latest_image)
            api_calls += 1
            try:
                response = self.decision_client.create_message(messages)
                usage = _field(response, "usage", {})
                input_tokens += int(_field(usage, "input_tokens", 0) or 0)
                output_tokens += int(_field(usage, "output_tokens", 0) or 0)
                tool_id, tool_name, raw_args, assistant_content = _extract_single_tool(
                    response
                )
                arguments = _validate_tool(tool_name, raw_args)
            except AgentRunError as exc:
                error = str(exc)
                status = "error"
                steps = step
                try:
                    self._log(
                        step,
                        "invalid_tool_call",
                        {},
                        {"error": error},
                        current_frame_path,
                    )
                except (OSError, TypeError, ValueError):
                    error = "Could not write run log after an invalid tool call."
                    status = "logging_error"
                break
            except Exception as exc:
                error = (
                    "Claude request failed safely "
                    f"({type(exc).__name__}); check connectivity and configuration."
                )
                status = "api_error"
                steps = step
                try:
                    self._log(
                        step,
                        "claude_request",
                        {},
                        {"error": error},
                        current_frame_path,
                    )
                except (OSError, TypeError, ValueError):
                    error = "Could not write run log after a Claude request failure."
                    status = "logging_error"
                break

            try:
                result = _tool_result(self.engine, tool_name, arguments)
            except Exception as exc:
                error = (
                    "Engine tool request failed safely "
                    f"({type(exc).__name__}); check the local engine."
                )
                result = {"error": error}
                status = "engine_error"

            frame_for_step = current_frame_path
            steps = step
            try:
                self._log(step, tool_name, arguments, result, frame_for_step)
            except (OSError, TypeError, ValueError) as exc:
                error = f"Could not write run log ({type(exc).__name__})."
                status = "logging_error"
                break

            if status == "engine_error":
                break

            final_state = _safe_state(self.engine.state())
            if tool_name in {"move", "turn"}:
                try:
                    latest_image = self.engine.look()
                    current_frame_path = self.frame_dir / f"frame_{step:03d}.png"
                    _write_frame(latest_image, current_frame_path)
                except Exception as exc:
                    error = (
                        "Could not obtain the required post-action camera frame "
                        f"({type(exc).__name__})."
                    )
                    status = "engine_error"
                    break

            terminal = _terminal_status(final_state)
            if terminal:
                status = terminal
                break

            pending_user = [
                {
                    "type": "tool_result",
                    "tool_use_id": tool_id or f"step-{step}",
                    "content": json.dumps(result, separators=(",", ":"), allow_nan=False),
                }
            ]
            observation = _observation(self.engine, self.config)
            pending_user.append(
                {
                    "type": "text",
                    "text": OBSERVATION_TEXT.format(
                        json.dumps(observation, separators=(",", ":"), allow_nan=False)
                    ),
                }
            )
            pending_user.append(_image_block(latest_image))
            history.append((assistant_content, pending_user))
            history = history[-4:]
        summary = self._summary(
            status, steps, api_calls, input_tokens, final_state, output_tokens, error
        )
        summary["estimated_cost"] = _cost_estimate(
            self.config, input_tokens, output_tokens
        )
        summary["run_dir"] = str(self.run_dir)
        summary["log_path"] = str(self.log_path)
        return summary

    @staticmethod
    def _summary(
        status,
        steps,
        api_calls,
        input_tokens,
        state,
        output_tokens=0,
        error=None,
    ):
        return {
            "status": status,
            "steps": steps,
            "api_calls": api_calls,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "state": state,
            "error": error,
        }


def run_command(command, mock=False, max_steps=None, once=False):
    load_dotenv()
    try:
        if once and mock:
            raise AgentConfigurationError("--once requires --real")
        if once and max_steps is not None:
            raise AgentConfigurationError("--max-steps cannot be used with --once")
        config = AgentConfig.from_env()
        if max_steps is not None:
            if max_steps < 1:
                raise AgentConfigurationError("--max-steps must be positive")
            config = AgentConfig(
                api_key=config.api_key,
                model=config.model,
                base_url=config.base_url,
                timeout_seconds=config.timeout_seconds,
                max_steps=min(max_steps, HARD_MAX_STEPS),
                include_depth=config.include_depth,
                log_dir=config.log_dir,
                input_price_per_million=config.input_price_per_million,
                output_price_per_million=config.output_price_per_million,
                max_tokens=config.max_tokens,
            )
        decision_client = (
            MockAnthropicClient() if mock else AnthropicDecisionClient(config)
        )
        engine = EngineClient(
            base_url=os.getenv("ENGINE_BASE_URL", "http://127.0.0.1:8080"),
            timeout=config.timeout_seconds,
        )
        try:
            if once:
                result = run_single_decision(
                    engine, decision_client, config, command
                )
            else:
                result = AgentRunner(engine, decision_client, config).run(command)
        finally:
            engine.close()
        print(json.dumps(result, indent=2, allow_nan=False))
        return result
    except AgentConfigurationError as exc:
        print(str(exc), file=sys.stderr)
        return {"status": "configuration_error", "error": str(exc)}
    except AgentRunError as exc:
        print(f"Claude decision rejected safely: {exc}", file=sys.stderr)
        return {"status": "invalid_response", "error": str(exc)}
    except Exception as exc:
        print(
            f"Agent could not start safely ({type(exc).__name__}).",
            file=sys.stderr,
        )
        return {"status": "startup_error", "error": type(exc).__name__}


def main(argv=None):
    parser = argparse.ArgumentParser(description="Run the Membrane Robot agent")
    parser.add_argument("--command", required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--mock", action="store_true", help="use deterministic mock Claude decisions")
    mode.add_argument("--real", action="store_true", help="use the configured Anthropic API")
    parser.add_argument(
        "--once",
        action="store_true",
        help="with --real, request and validate one tool decision without executing it",
    )
    parser.add_argument("--max-steps", type=int)
    args = parser.parse_args(argv)
    if args.once and not args.real:
        parser.error("--once requires --real")
    result = run_command(
        args.command,
        mock=args.mock,
        max_steps=args.max_steps,
        once=args.once,
    )
    if args.once:
        return 0 if result.get("status") == "decision_ready" else 1
    succeeded = (
        result.get("status") == "done"
        and (result.get("state") or {}).get("result") == "pass"
    )
    return 0 if succeeded else 1


if __name__ == "__main__":
    raise SystemExit(main())
