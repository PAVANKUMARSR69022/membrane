import argparse
import json
import os
import sys
from pathlib import Path

from agent.client import EngineClient
from agent.mission import (
    MissionManager,
    MissionValidationError,
    MockMissionTaskExecutor,
    mission_from_dict,
)
from agent.runner import AgentConfig, AgentConfigurationError


MOCK_CONFIG_KEYS = (
    "CLAUDE_MAX_STEPS",
    "CLAUDE_TIMEOUT_SECONDS",
    "CLAUDE_MAX_TOKENS",
    "CLAUDE_INCLUDE_DEPTH",
    "LOG_DIR",
    "CLAUDE_INPUT_PRICE_PER_MILLION",
    "CLAUDE_OUTPUT_PRICE_PER_MILLION",
)


def _mock_config_from_environment():
    settings = {
        name: os.environ[name]
        for name in MOCK_CONFIG_KEYS
        if name in os.environ
    }
    return AgentConfig.from_env(settings)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Run a structured multi-task mission with mock decisions"
    )
    parser.add_argument("--mission", required=True, help="path to a structured mission JSON file")
    parser.add_argument(
        "--mock",
        action="store_true",
        required=True,
        help="use deterministic offline decisions; no Claude API client is created",
    )
    args = parser.parse_args(argv)

    try:
        payload = json.loads(
            Path(args.mission).read_text(encoding="utf-8")
        )
        mission = mission_from_dict(payload)
        config = _mock_config_from_environment()
        engine = EngineClient(
            base_url=os.getenv("ENGINE_BASE_URL", "http://127.0.0.1:8080"),
            timeout=config.timeout_seconds,
        )
        try:
            manager = MissionManager(
                engine,
                MockMissionTaskExecutor(engine, config),
            )
            result = manager.run(mission)
        finally:
            engine.close()
        print(json.dumps(result.to_dict(), indent=2, allow_nan=False))
        return 0 if result.status == "completed" else 1
    except (OSError, json.JSONDecodeError, MissionValidationError, AgentConfigurationError) as exc:
        print(f"Mission could not start safely ({type(exc).__name__}): {exc}", file=sys.stderr)
        return 2
    except Exception as exc:
        print(
            f"Mission execution failed safely ({type(exc).__name__}).",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
