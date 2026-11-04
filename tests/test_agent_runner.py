import base64
import json
from types import SimpleNamespace

from anthropic.types import ToolUseBlock
from PIL import Image

from agent.client import EngineClient
from agent.runner import (
    AnthropicDecisionClient,
    AgentConfig,
    AgentRunner,
    MockAnthropicClient,
    _extract_single_tool,
    main,
    run_single_decision,
)
from agent.tools import TOOLS


def _jpeg_bytes():
    import io

    image = Image.new("RGB", (16, 12), (40, 100, 160))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


class FakeEngine:
    def __init__(self):
        self.camera_calls = 0
        self.move_calls = []
        self.turn_calls = []
        self.pickup_calls = 0
        self.drop_calls = 0
        self.state_value = {
            "state": "Locate",
            "x": 0.0,
            "y": 0.0,
            "heading": 0.0,
            "holding": False,
            "retry_count": 0,
            "collided": False,
            "result": None,
        }

    def state(self):
        return dict(self.state_value)

    def look(self):
        self.camera_calls += 1
        return _jpeg_bytes()

    def depth(self):
        return 1.25

    def move(self, distance):
        self.move_calls.append(distance)
        self.state_value["x"] += distance
        return {"moved": distance, "collided": False, "retry_count": 0}

    def turn(self, degrees):
        self.turn_calls.append(degrees)
        self.state_value["heading"] = (self.state_value["heading"] - degrees) % 360
        return {"turned": degrees, "collided": False}

    def pickup(self):
        self.pickup_calls += 1
        self.state_value["holding"] = True
        self.state_value["state"] = "Carry"
        return {"success": True}

    def drop(self):
        self.drop_calls += 1
        self.state_value["holding"] = False
        self.state_value["state"] = "Done"
        self.state_value["result"] = "pass"
        return {"released": True, "in_drop_zone": True, "result": "pass"}


def _tool(name, arguments, tool_id="tool-id"):
    return {
        "id": tool_id,
        "type": "tool_use",
        "name": name,
        "input": arguments,
    }


def test_mock_visual_fetch_uses_one_tool_per_call_and_latest_actual_image(
    tmp_path, monkeypatch
):
    monkeypatch.setattr(
        "agent.runner.anthropic.Anthropic",
        lambda **_: (_ for _ in ()).throw(AssertionError("network client created")),
    )
    decisions = [
        _tool("look", {}),
        _tool("turn", {"degrees": -10}),
        _tool("move", {"distance": 0.2}),
        _tool("pickup", {}),
        _tool("move", {"distance": 0.1}),
        _tool("drop", {}),
    ]
    mock = MockAnthropicClient(decisions)
    engine = FakeEngine()
    config = AgentConfig(max_steps=25, log_dir=tmp_path)

    result = AgentRunner(engine, mock, config, run_dir=tmp_path).run(
        "Fetch the requested item."
    )

    assert result["status"] == "done"
    assert result["steps"] == 6
    assert result["api_calls"] == mock.call_count == 6
    assert result["state"]["result"] == "pass"
    assert engine.turn_calls == [-10.0]
    assert engine.move_calls == [0.2, 0.1]
    assert engine.pickup_calls == engine.drop_calls == 1
    assert engine.camera_calls == 4  # initial, after turn, and after each move

    for request_messages in mock.requests:
        image_blocks = [
            block
            for message in request_messages
            for block in message["content"]
            if block["type"] == "image"
        ]
        assert len(image_blocks) == 1
        source = image_blocks[0]["source"]
        assert source["type"] == "base64"
        assert source["media_type"] == "image/jpeg"
        assert base64.b64decode(source["data"]) == _jpeg_bytes()

    second_request = mock.requests[1]
    tool_results = [
        block
        for message in second_request
        for block in message["content"]
        if block["type"] == "tool_result"
    ]
    assert json.loads(tool_results[-1]["content"]) == {
        "available": True,
        "source": "latest camera frame",
    }
    expected_tool_results = [
        {"turned": -10.0, "collided": False},
        {"moved": 0.2, "collided": False, "retry_count": 0},
        {"success": True},
        {"moved": 0.1, "collided": False, "retry_count": 0},
    ]
    for request_messages, expected in zip(mock.requests[2:6], expected_tool_results):
        returned = [
            block
            for message in request_messages
            for block in message["content"]
            if block["type"] == "tool_result"
        ]
        assert json.loads(returned[-1]["content"]) == expected
    assert len(list((tmp_path / "frames").glob("*.png"))) == 4
    log_rows = [
        json.loads(line)
        for line in (tmp_path / "steps.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert len(log_rows) == 6
    assert set(log_rows[0]) == {
        "step",
        "timestamp",
        "tool",
        "args",
        "result",
        "frame_path",
    }
    assert log_rows[-1]["result"]["result"] == "pass"


def test_state_tool_and_schemas_do_not_expose_privileged_scene_data(tmp_path):
    mock = MockAnthropicClient([_tool("get_state", {})])
    engine = FakeEngine()

    result = AgentRunner(
        engine, mock, AgentConfig(max_steps=1, log_dir=tmp_path), run_dir=tmp_path
    ).run("Check robot state.")

    assert result["steps"] == 1
    user_text = "\n".join(
        block.get("text", "")
        for message in mock.requests[0]
        for block in message["content"]
        if block["type"] == "text"
    )
    serialized_tools = json.dumps(TOOLS).lower()
    for forbidden in (
        "object_id",
        "object_positions",
        "drop_zone_coordinates",
        "get_nearest_target",
        "segmentation",
    ):
        assert forbidden not in user_text.lower()
        assert forbidden not in serialized_tools

    assert {tool["name"] for tool in TOOLS} == {
        "look",
        "move",
        "turn",
        "pickup",
        "drop",
        "get_state",
    }


def test_invalid_tool_arguments_stop_before_engine_action(tmp_path):
    engine = FakeEngine()
    mock = MockAnthropicClient([_tool("move", {"distance": 1.01})])

    result = AgentRunner(
        engine, mock, AgentConfig(max_steps=5, log_dir=tmp_path), run_dir=tmp_path
    ).run("Move.")

    assert result["status"] == "error"
    assert result["steps"] == 1
    assert result["api_calls"] == 1
    assert engine.move_calls == []
    row = json.loads((tmp_path / "steps.jsonl").read_text(encoding="utf-8"))
    assert row["tool"] == "invalid_tool_call"
    assert "outside the allowed range" in row["result"]["error"]


def test_unsupported_tool_is_rejected_without_engine_action(tmp_path):
    engine = FakeEngine()
    mock = MockAnthropicClient([_tool("get_object_positions", {})])

    result = AgentRunner(
        engine, mock, AgentConfig(max_steps=5, log_dir=tmp_path), run_dir=tmp_path
    ).run("Fetch.")

    assert result["status"] == "error"
    assert engine.move_calls == engine.turn_calls == []
    assert engine.pickup_calls == engine.drop_calls == 0
    logged = json.loads((tmp_path / "steps.jsonl").read_text(encoding="utf-8"))
    assert logged["tool"] == "invalid_tool_call"
    assert "get_object_positions" not in json.dumps(logged)


def test_api_error_is_reported_without_echoing_exception_secrets(tmp_path):
    engine = FakeEngine()
    mock = MockAnthropicClient([RuntimeError("request used API key secret-value")])

    result = AgentRunner(
        engine, mock, AgentConfig(max_steps=5, log_dir=tmp_path), run_dir=tmp_path
    ).run("Fetch.")

    assert result["status"] == "api_error"
    assert result["api_calls"] == 1
    assert "secret-value" not in json.dumps(result)
    log = (tmp_path / "steps.jsonl").read_text(encoding="utf-8")
    assert "secret-value" not in log
    assert json.loads(log)["tool"] == "claude_request"


def test_hard_maximum_is_sixty_even_if_configured_higher(tmp_path):
    engine = FakeEngine()
    decisions = [_tool("move", {"distance": 0.01}, f"move-{i}") for i in range(61)]
    mock = MockAnthropicClient(decisions)
    config = AgentConfig(max_steps=100, log_dir=tmp_path)

    result = AgentRunner(engine, mock, config, run_dir=tmp_path).run("Keep moving.")

    assert result["status"] == "max_steps"
    assert result["steps"] == 60
    assert result["api_calls"] == mock.call_count == 60
    assert len(engine.move_calls) == 60
    assert len((tmp_path / "steps.jsonl").read_text(encoding="utf-8").splitlines()) == 60


def test_config_requires_exact_real_model_and_clamps_step_limit():
    config = AgentConfig.from_env(
        {
            "CLAUDE_MAX_STEPS": "999",
            "CLAUDE_INCLUDE_DEPTH": "false",
            "CLAUDE_INPUT_PRICE_PER_MILLION": "",
            "CLAUDE_OUTPUT_PRICE_PER_MILLION": "",
        }
    )
    assert config.max_steps == 60
    assert config.include_depth is False
    try:
        config.require_real_api_settings()
    except ValueError as exc:
        assert "organizer-provided model ID" in str(exc)
        assert "ANTHROPIC_API_KEY" in str(exc)
    else:
        raise AssertionError("Missing organizer model must block real API mode")


def test_single_decision_sends_current_vision_and_never_executes_tool():
    engine = FakeEngine()
    engine.state_value["object_ids"] = [101]
    engine.state_value["drop_zone_coordinates"] = [2.8, 2.8]
    mock = MockAnthropicClient([_tool("move", {"distance": 0.2})])

    result = run_single_decision(
        engine,
        mock,
        AgentConfig(include_depth=True),
        "Look for the requested item.",
    )

    assert result["status"] == "decision_ready"
    assert result["api_calls"] == mock.call_count == 1
    assert result["tool"] == "move"
    assert result["args"] == {"distance": 0.2}
    assert result["tool_executed"] is False
    assert engine.camera_calls == 1
    assert engine.move_calls == engine.turn_calls == []
    assert engine.pickup_calls == engine.drop_calls == 0

    messages = mock.requests[0]
    content = messages[0]["content"]
    assert [block["type"] for block in content].count("image") == 1
    image = next(block for block in content if block["type"] == "image")
    assert base64.b64decode(image["source"]["data"]) == _jpeg_bytes()
    text = "\n".join(
        block["text"] for block in content if block["type"] == "text"
    )
    assert '"depth":1.25' in text
    assert "object_ids" not in text
    assert "drop_zone_coordinates" not in text
    assert '"x":0.0' in text


def test_single_decision_rejects_multiple_tools_and_output_truncation():
    engine = FakeEngine()
    class MultipleToolClient:
        def create_message(self, messages):
            return {
                "content": [
                    _tool("look", {}),
                    _tool("move", {"distance": 0.1}),
                ]
            }

    try:
        run_single_decision(
            engine,
            MultipleToolClient(),
            AgentConfig(),
            "Observe.",
        )
    except RuntimeError as exc:
        assert "exactly one tool call" in str(exc)
    else:
        raise AssertionError("Multiple tool calls must be rejected")
    assert engine.move_calls == []

    truncated = SimpleNamespace(
        stop_reason="max_tokens",
        content=[_tool("move", {"distance": 0.1})],
    )
    try:
        _extract_single_tool(truncated)
    except RuntimeError as exc:
        assert "output-token limit" in str(exc)
    else:
        raise AssertionError("A token-truncated response must be rejected")


def test_real_sdk_adapter_sends_tools_with_parallel_use_disabled(monkeypatch):
    observed = {}

    class FakeMessages:
        def create(self, **kwargs):
            observed["request"] = kwargs
            return {"content": []}

    class FakeSDK:
        def __init__(self, **kwargs):
            observed["client_options"] = kwargs
            self.messages = FakeMessages()

    monkeypatch.setattr("agent.runner.anthropic.Anthropic", FakeSDK)
    config = AgentConfig(
        api_key="test-only-credential",
        model="configured-model-id",
        timeout_seconds=7,
        max_tokens=321,
    )
    client = AnthropicDecisionClient(config)
    client.create_message([{"role": "user", "content": []}])

    assert observed["client_options"]["api_key"] == "test-only-credential"
    assert observed["client_options"]["timeout"] == 7
    assert observed["client_options"]["max_retries"] == 0
    request = observed["request"]
    assert request["model"] == "configured-model-id"
    assert request["max_tokens"] == 321
    assert request["tools"] == TOOLS
    assert request["tool_choice"] == {
        "type": "any",
        "disable_parallel_tool_use": True,
    }


def test_single_decision_cli_returns_success_without_running_a_fetch(monkeypatch):
    observed = {}

    def fake_run_command(command, **kwargs):
        observed["command"] = command
        observed.update(kwargs)
        return {
            "status": "decision_ready",
            "tool": "look",
            "args": {},
            "tool_executed": False,
        }

    monkeypatch.setattr("agent.runner.run_command", fake_run_command)

    assert main(
        [
            "--real",
            "--once",
            "--command",
            "Select one next robot control.",
        ]
    ) == 0
    assert observed == {
        "command": "Select one next robot control.",
        "mock": False,
        "max_steps": None,
        "once": True,
    }


def test_official_sdk_tool_block_is_parsed_for_next_tool_result():
    block = ToolUseBlock(
        id="sdk-tool-id",
        input={"distance": 0.1},
        name="move",
        type="tool_use",
    )
    tool_id, name, arguments, assistant_content = _extract_single_tool(
        SimpleNamespace(content=[block])
    )

    assert tool_id == "sdk-tool-id"
    assert name == "move"
    assert arguments == {"distance": 0.1}
    assert assistant_content == [block]


def test_engine_client_maps_tools_to_existing_http_endpoints():
    class Response:
        headers = {"content-type": "image/jpeg"}
        content = _jpeg_bytes()

        def raise_for_status(self):
            return None

        def json(self):
            return {"distance": 1.0}

    class RecordingSession:
        def __init__(self):
            self.calls = []

        def get(self, url, **kwargs):
            self.calls.append(("GET", url, kwargs.get("json")))
            return Response()

        def post(self, url, **kwargs):
            self.calls.append(("POST", url, kwargs.get("json")))
            return Response()

        def close(self):
            return None

    engine = EngineClient("http://engine.test")
    session = RecordingSession()
    engine.session = session

    engine.state()
    engine.look()
    engine.depth()
    engine.move(0.1)
    engine.turn(-5)
    engine.pickup()
    engine.drop()
    engine.start_task("mission:task-A")

    assert session.calls == [
        ("GET", "http://engine.test/state", None),
        ("GET", "http://engine.test/look", None),
        ("GET", "http://engine.test/depth", None),
        ("POST", "http://engine.test/move", {"distance": 0.1}),
        ("POST", "http://engine.test/turn", {"degrees": -5}),
        ("POST", "http://engine.test/pickup", None),
        ("POST", "http://engine.test/drop", None),
        ("POST", "http://engine.test/task/start", {"task_id": "mission:task-A"}),
    ]
