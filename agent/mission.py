import json
import re
import threading
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from agent.runner import AgentConfig, AgentRunner, MockAnthropicClient


TASK_STATUSES = {"pending", "running", "completed", "failed", "skipped"}
MISSION_STATUSES = {"pending", "running", "completed", "failed", "interrupted"}
DEFAULT_TASK_RETRY_LIMIT = 3
_TASK_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")


class MissionValidationError(ValueError):
    pass


class MissionExecutionError(RuntimeError):
    pass


def _timestamp():
    return datetime.now(timezone.utc).isoformat()


@dataclass
class MissionTask:
    task_id: str
    description: str
    target_description: str = ""
    destination_description: str = ""
    dependencies: list[str] = field(default_factory=list)
    status: str = "pending"
    retry_count: int = 0
    max_retries: int = DEFAULT_TASK_RETRY_LIMIT
    result: dict | None = None
    created_at: str = field(default_factory=_timestamp)
    started_at: str | None = None
    completed_at: str | None = None

    def __post_init__(self):
        if (
            not isinstance(self.task_id, str)
            or not _TASK_ID_PATTERN.fullmatch(self.task_id)
        ):
            raise MissionValidationError("Task IDs must use the supported ID format")
        if not isinstance(self.description, str) or not self.description.strip():
            raise MissionValidationError("Task descriptions must be non-empty")
        if not isinstance(self.target_description, str) or not isinstance(
            self.destination_description, str
        ):
            raise MissionValidationError(
                "Target and destination descriptions must be strings"
            )
        if not isinstance(self.dependencies, list) or not all(
            isinstance(dependency, str) for dependency in self.dependencies
        ):
            raise MissionValidationError("Task dependencies must be a list of IDs")
        if self.status not in TASK_STATUSES:
            raise MissionValidationError("Invalid task status")
        if (
            isinstance(self.max_retries, bool)
            or not isinstance(self.max_retries, int)
            or self.max_retries < 0
        ):
            raise MissionValidationError("max_retries must be a non-negative integer")
        if (
            isinstance(self.retry_count, bool)
            or not isinstance(self.retry_count, int)
            or self.retry_count < 0
        ):
            raise MissionValidationError("retry_count must be a non-negative integer")
        if len(set(self.dependencies)) != len(self.dependencies):
            raise MissionValidationError("Task dependencies must be unique")

    def to_dict(self):
        return asdict(self)


@dataclass
class Mission:
    mission_id: str
    original_command: str
    tasks: list[MissionTask]
    status: str = "pending"
    current_task_id: str | None = None
    created_at: str = field(default_factory=_timestamp)
    started_at: str | None = None
    completed_at: str | None = None
    total_actions: int = 0
    total_retries: int = 0

    def __post_init__(self):
        if (
            not isinstance(self.mission_id, str)
            or not _TASK_ID_PATTERN.fullmatch(self.mission_id)
        ):
            raise MissionValidationError("Mission ID must use the supported ID format")
        if not isinstance(self.original_command, str) or not self.original_command.strip():
            raise MissionValidationError("Mission command must be non-empty")
        if not self.tasks:
            raise MissionValidationError("A mission must contain at least one task")
        if not all(isinstance(task, MissionTask) for task in self.tasks):
            raise MissionValidationError("Mission tasks must be MissionTask instances")
        if self.status not in MISSION_STATUSES:
            raise MissionValidationError("Invalid mission status")
        _validate_task_queue(self.tasks)
        if any(len(f"{self.mission_id}:{task.task_id}") > 128 for task in self.tasks):
            raise MissionValidationError(
                "Combined engine task IDs must not exceed 128 characters"
            )

    def to_dict(self):
        data = asdict(self)
        data["progress"] = self.progress
        return data

    @property
    def progress(self):
        completed = sum(task.status == "completed" for task in self.tasks)
        return {
            "completed_tasks": completed,
            "total_tasks": len(self.tasks),
            "progress_percent": round(100 * completed / len(self.tasks), 1),
        }


def _validate_task_queue(tasks):
    seen = set()
    for task in tasks:
        if task.task_id in seen:
            raise MissionValidationError(f"Duplicate task ID: {task.task_id}")
        for dependency in task.dependencies:
            if dependency == task.task_id:
                raise MissionValidationError("A task cannot depend on itself")
            if dependency not in seen:
                raise MissionValidationError(
                    "Dependencies must reference an earlier task in the ordered queue"
                )
        seen.add(task.task_id)


def mission_from_dict(payload):
    if not isinstance(payload, dict):
        raise MissionValidationError("Mission input must be a JSON object")
    allowed = {"mission_id", "original_command", "tasks"}
    if set(payload) - allowed:
        raise MissionValidationError("Mission input contains unsupported fields")
    if "original_command" not in payload or "tasks" not in payload:
        raise MissionValidationError("Mission input requires original_command and tasks")
    if not isinstance(payload["tasks"], list):
        raise MissionValidationError("Mission tasks must be a list")
    tasks = []
    task_fields = {
        "task_id",
        "description",
        "target_description",
        "destination_description",
        "dependencies",
        "max_retries",
    }
    for item in payload["tasks"]:
        if not isinstance(item, dict) or set(item) - task_fields:
            raise MissionValidationError("Each task must be a supported task object")
        if "task_id" not in item or "description" not in item:
            raise MissionValidationError("Each task requires task_id and description")
        dependencies = item.get("dependencies", [])
        if not isinstance(dependencies, list) or not all(
            isinstance(dependency, str) for dependency in dependencies
        ):
            raise MissionValidationError("Task dependencies must be a list of IDs")
        tasks.append(
            MissionTask(
                task_id=item["task_id"],
                description=item["description"],
                target_description=item.get("target_description", ""),
                destination_description=item.get("destination_description", ""),
                dependencies=dependencies,
                max_retries=item.get("max_retries", DEFAULT_TASK_RETRY_LIMIT),
            )
        )
    return Mission(
        mission_id=payload.get("mission_id") or str(uuid.uuid4()),
        original_command=payload["original_command"],
        tasks=tasks,
    )


class MockMissionTaskExecutor:
    """Runs the existing bounded executor with deterministic offline decisions."""

    def __init__(self, engine, config=None):
        self.engine = engine
        self.config = config or AgentConfig.from_env()

    def __call__(self, task):
        command = task.description
        if task.target_description:
            command += f"\nTarget: {task.target_description}"
        if task.destination_description:
            command += f"\nDestination: {task.destination_description}"
        runner = AgentRunner(
            self.engine,
            MockAnthropicClient(),
            self.config,
        )
        summary = runner.run(command)
        delivery = None
        if runner.log_path.exists():
            rows = [
                json.loads(line)
                for line in runner.log_path.read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
            for row in reversed(rows):
                if row.get("tool") == "drop":
                    delivery = row.get("result")
                    break
        return {
            "status": summary["status"],
            "steps": summary["steps"],
            "state": summary["state"],
            "delivery": delivery,
        }


class MissionManager:
    def __init__(self, engine, task_executor):
        self.engine = engine
        self.task_executor = task_executor
        self._interrupt_requested = threading.Event()
        self._run_lock = threading.Lock()

    def request_interrupt(self):
        """Pause after the current task reaches a safe task boundary."""
        self._interrupt_requested.set()

    def resume(self, mission):
        if mission.status != "interrupted":
            raise MissionExecutionError("Only an interrupted mission can resume")
        if any(task.status == "running" for task in mission.tasks):
            raise MissionExecutionError(
                "A mission interrupted during an active task cannot resume safely"
            )
        self._interrupt_requested.clear()
        mission.status = "running"
        mission.completed_at = None
        return self.run(mission)

    def run(self, mission):
        if not isinstance(mission, Mission):
            raise MissionValidationError("run requires a Mission instance")
        if mission.status not in {"pending", "running"}:
            raise MissionExecutionError(
                "Only pending or explicitly resumed missions can run"
            )
        if not self._run_lock.acquire(blocking=False):
            raise MissionExecutionError("This mission is already running")
        try:
            return self._run_locked(mission)
        finally:
            self._run_lock.release()

    def _run_locked(self, mission):
        mission.status = "running"
        if mission.started_at is None:
            mission.started_at = _timestamp()

        for task in mission.tasks:
            if task.status == "completed":
                continue
            if self._interrupt_requested.is_set():
                mission.status = "interrupted"
                mission.current_task_id = None
                return mission
            if task.status != "pending":
                raise MissionExecutionError(
                    "Mission contains a task that cannot be resumed safely"
                )
            if any(
                next(candidate for candidate in mission.tasks if candidate.task_id == dependency).status
                != "completed"
                for dependency in task.dependencies
            ):
                task.status = "skipped"
                task.completed_at = _timestamp()
                task.result = {"reason": "dependency_not_completed"}
                continue

            engine_task_id = f"{mission.mission_id}:{task.task_id}"
            task.status = "running"
            task.started_at = _timestamp()
            mission.current_task_id = task.task_id
            try:
                boundary = self.engine.start_task(engine_task_id)
                if boundary.get("status") not in {"started", "duplicate"}:
                    raise MissionExecutionError("Engine rejected task transition")
                if boundary.get("active_task_id") != engine_task_id:
                    raise MissionExecutionError(
                        "Engine reports a different task as active"
                    )
                if (
                    boundary.get("status") == "duplicate"
                    and boundary.get("task_status") != "running"
                ):
                    raise MissionExecutionError(
                        "Engine reports this task ID as already completed"
                    )
                outcome = self.task_executor(task)
            except Exception as exc:
                task.retry_count = self._current_retry_count()
                mission.total_retries += task.retry_count
                task.status = "failed"
                task.result = {
                    "status": "error",
                    "error_type": type(exc).__name__,
                    "retry_count": task.retry_count,
                }
                task.completed_at = _timestamp()
                self._fail_remaining(mission, task)
                return mission

            state_error = None
            try:
                state = self.engine.state()
            except Exception as exc:
                state = None
                state_error = type(exc).__name__
            if state is None and isinstance(outcome, dict):
                state = outcome.get("state")
            if not isinstance(state, dict):
                state = {}
            task.retry_count = self._retry_count(state)
            mission.total_retries += task.retry_count
            if isinstance(outcome, dict):
                mission.total_actions += self._action_count(outcome)

            delivery = outcome.get("delivery") if isinstance(outcome, dict) else None
            delivered = (
                isinstance(delivery, dict)
                and delivery.get("released") is True
                and delivery.get("in_drop_zone") is True
                and delivery.get("result") == "pass"
                and state.get("result") == "pass"
                and outcome.get("status") == "done"
                and state_error is None
            )
            task.result = {
                "status": outcome.get("status") if isinstance(outcome, dict) else "error",
                "task_result": state.get("result"),
                "delivery_verified": delivered,
                "retry_count": task.retry_count,
            }
            if state_error is not None:
                task.result["state_verification_error"] = state_error
            task.completed_at = _timestamp()
            mission.current_task_id = None
            exhausted = (
                task.retry_count > 0
                and task.retry_count >= task.max_retries
            )
            if not delivered or exhausted:
                task.status = "failed"
                if exhausted:
                    task.result["failure_reason"] = "retry_exhausted"
                elif state_error is not None:
                    task.result["failure_reason"] = "final_state_unavailable"
                else:
                    task.result["failure_reason"] = "delivery_not_verified"
                self._fail_remaining(mission, task)
                return mission

            task.status = "completed"
            if self._interrupt_requested.is_set():
                mission.status = "interrupted"
                return mission

        mission.status = (
            "completed"
            if all(task.status == "completed" for task in mission.tasks)
            else "failed"
        )
        mission.completed_at = _timestamp()
        mission.current_task_id = None
        return mission

    def _fail_remaining(self, mission, failed_task):
        failed_task.status = "failed"
        mission.current_task_id = None
        for task in mission.tasks:
            if task.status == "pending":
                task.status = "skipped"
                task.completed_at = _timestamp()
                task.result = {"reason": "mission_failed"}
        mission.status = "failed"
        mission.completed_at = _timestamp()

    def _current_retry_count(self):
        try:
            return self._retry_count(self.engine.state())
        except Exception:
            return 0

    @staticmethod
    def _retry_count(state):
        value = state.get("retry_count", 0) if isinstance(state, dict) else 0
        return (
            max(0, value)
            if isinstance(value, int) and not isinstance(value, bool)
            else 0
        )

    @staticmethod
    def _action_count(outcome):
        value = outcome.get("steps", outcome.get("api_calls", 0))
        return (
            max(0, value)
            if isinstance(value, int) and not isinstance(value, bool)
            else 0
        )
