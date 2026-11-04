import copy

import pytest

from agent.mission import (
    Mission,
    MissionExecutionError,
    MissionManager,
    MissionTask,
    MissionValidationError,
    mission_from_dict,
)
from run_mission import _mock_config_from_environment


class MissionEngine:
    def __init__(self):
        self.value = {
            "state": "Idle",
            "x": 1.25,
            "y": -0.5,
            "heading": 90.0,
            "holding": False,
            "retry_count": 0,
            "collided": False,
            "result": None,
            "object_ids": ["engine-private"],
            "drop_zone_coordinates": [9, 9],
        }
        self.active_task_id = None
        self.started_task_ids = []

    def start_task(self, task_id):
        self.started_task_ids.append(task_id)
        if self.active_task_id == task_id:
            return {
                "status": "duplicate",
                "task_id": task_id,
                "task_status": "running",
                "active_task_id": task_id,
                "robot_state": self.state(),
            }
        if self.value["state"] not in {"Idle", "Done"}:
            raise RuntimeError("transition rejected")
        if self.value["state"] == "Done" and self.value["result"] != "pass":
            raise RuntimeError("previous task failed")
        if self.value["holding"]:
            raise RuntimeError("object held")
        self.active_task_id = task_id
        self.value.update(
            state="Locate",
            retry_count=0,
            collided=False,
            result=None,
        )
        return {
            "status": "started",
            "task_id": task_id,
            "task_status": "running",
            "active_task_id": task_id,
            "robot_state": self.state(),
        }

    def state(self):
        return dict(self.value)

    def finish(self, result="pass", retries=0):
        self.value.update(
            state="Done" if result else "Failed",
            holding=False,
            retry_count=retries,
            result=result,
        )
        self.active_task_id = None


def _mission(*tasks):
    return Mission(
        mission_id="mission-test",
        original_command="Perform the supplied tasks in order.",
        tasks=list(tasks),
    )


def _success_executor(engine, calls, interrupt=None):
    def execute(task):
        calls.append(task.task_id)
        engine.finish()
        if interrupt is not None and task.task_id == "task-A":
            interrupt.request_interrupt()
        return {
            "status": "done",
            "steps": 4,
            "state": engine.state(),
            "delivery": {
                "released": True,
                "in_drop_zone": True,
                "result": "pass",
            },
        }

    return execute


def test_create_structured_mission_with_multiple_ordered_tasks():
    mission = mission_from_dict(
        {
            "mission_id": "mission-7",
            "original_command": "Deliver two requested items in order.",
            "tasks": [
                {
                    "task_id": "task-A",
                    "description": "Deliver the first requested item.",
                    "target_description": "first requested item",
                    "destination_description": "marked square",
                },
                {
                    "task_id": "task-B",
                    "description": "Deliver the second requested item.",
                    "target_description": "second requested item",
                    "destination_description": "marked square",
                    "dependencies": ["task-A"],
                },
            ],
        }
    )

    assert mission.status == "pending"
    assert mission.current_task_id is None
    assert [task.task_id for task in mission.tasks] == ["task-A", "task-B"]
    assert mission.tasks[1].dependencies == ["task-A"]
    assert mission.tasks[0].status == mission.tasks[1].status == "pending"
    assert mission.tasks[0].created_at
    assert mission.to_dict()["total_actions"] == 0


def test_mission_tasks_execute_sequentially_and_complete_only_after_delivery():
    engine = MissionEngine()
    calls = []
    mission = _mission(
        MissionTask("task-A", "Deliver first item."),
        MissionTask("task-B", "Deliver second item.", dependencies=["task-A"]),
    )
    manager = MissionManager(engine, _success_executor(engine, calls))

    result = manager.run(mission)

    assert result.status == "completed"
    assert result.current_task_id is None
    assert calls == ["task-A", "task-B"]
    assert engine.started_task_ids == [
        "mission-test:task-A",
        "mission-test:task-B",
    ]
    assert [task.status for task in result.tasks] == ["completed", "completed"]
    assert all(task.started_at and task.completed_at for task in result.tasks)
    assert all(task.result["delivery_verified"] for task in result.tasks)
    assert result.total_actions == 8
    assert result.total_retries == 0
    assert result.progress == {
        "completed_tasks": 2,
        "total_tasks": 2,
        "progress_percent": 100.0,
    }
    assert result.started_at and result.completed_at


def test_pickup_or_unverified_drop_does_not_complete_task_or_mission():
    engine = MissionEngine()
    mission = _mission(
        MissionTask("task-A", "Deliver an item."),
        MissionTask("task-B", "Deliver another item.", dependencies=["task-A"]),
    )

    def pickup_only(_task):
        engine.value.update(state="Carry", holding=True)
        return {
            "status": "max_steps",
            "steps": 2,
            "state": engine.state(),
            "delivery": None,
            "pickup": {"success": True},
        }

    result = MissionManager(engine, pickup_only).run(mission)

    assert result.status == "failed"
    assert result.tasks[0].status == "failed"
    assert result.tasks[0].result["delivery_verified"] is False
    assert result.tasks[0].result["failure_reason"] == "delivery_not_verified"
    assert result.tasks[1].status == "skipped"
    assert result.tasks[1].result["reason"] == "mission_failed"


def test_failed_task_and_retry_exhaustion_skip_remaining_tasks():
    engine = MissionEngine()
    mission = _mission(
        MissionTask("task-A", "Deliver an item."),
        MissionTask("task-B", "Deliver another item."),
    )

    def exhausted(_task):
        engine.finish(result=None, retries=3)
        return {
            "status": "failed",
            "steps": 7,
            "state": engine.state(),
            "delivery": None,
        }

    result = MissionManager(engine, exhausted).run(mission)

    assert result.status == "failed"
    assert result.tasks[0].status == "failed"
    assert result.tasks[0].retry_count == 3
    assert result.tasks[0].result["failure_reason"] == "retry_exhausted"
    assert result.tasks[1].status == "skipped"
    assert result.total_retries == 3
    assert result.total_actions == 7


@pytest.mark.parametrize(
    "tasks",
    [
        [
            MissionTask("task-A", "A", dependencies=["missing"]),
        ],
        [
            MissionTask("task-A", "A", dependencies=["task-A"]),
        ],
        [
            MissionTask("task-A", "A", dependencies=["task-B"]),
            MissionTask("task-B", "B"),
        ],
        [
            MissionTask("task-A", "A"),
            MissionTask("task-A", "Duplicate ID"),
        ],
    ],
)
def test_invalid_task_dependencies_and_ids_are_rejected(tasks):
    with pytest.raises(MissionValidationError):
        _mission(*tasks)


def test_mission_can_pause_between_tasks_and_resume_safely():
    engine = MissionEngine()
    calls = []
    mission = _mission(
        MissionTask("task-A", "Deliver first item."),
        MissionTask("task-B", "Deliver second item."),
    )
    manager = MissionManager(
        engine,
        _success_executor(engine, calls, interrupt=None),
    )
    first_task_executor = manager.task_executor

    def interrupt_after_first(task):
        result = first_task_executor(task)
        if task.task_id == "task-A":
            manager.request_interrupt()
        return result

    manager.task_executor = interrupt_after_first
    interrupted = manager.run(mission)

    assert interrupted.status == "interrupted"
    assert interrupted.tasks[0].status == "completed"
    assert interrupted.tasks[1].status == "pending"
    assert interrupted.current_task_id is None
    assert calls == ["task-A"]

    resumed = manager.resume(mission)

    assert resumed.status == "completed"
    assert [task.status for task in resumed.tasks] == ["completed", "completed"]
    assert calls == ["task-A", "task-B"]


def test_mission_manager_rejects_resuming_an_active_task():
    mission = _mission(MissionTask("task-A", "Deliver an item."))
    mission.status = "interrupted"
    mission.tasks[0].status = "running"
    manager = MissionManager(MissionEngine(), lambda _: {})

    with pytest.raises(MissionExecutionError):
        manager.resume(mission)


def test_mission_output_does_not_copy_engine_private_metadata():
    engine = MissionEngine()
    mission = _mission(MissionTask("task-A", "Deliver the requested item."))
    result = MissionManager(engine, _success_executor(engine, [])).run(mission)

    serialized = str(result.to_dict())
    assert "engine-private" not in serialized
    assert "drop_zone_coordinates" not in serialized
    assert "object_ids" not in serialized


def test_mission_model_serialization_does_not_mutate_task_history():
    mission = _mission(MissionTask("task-A", "Deliver item."))
    snapshot = copy.deepcopy(mission.to_dict())

    assert mission.to_dict() == snapshot


def test_mock_mission_configuration_does_not_read_or_require_api_credentials(
    monkeypatch,
):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "must-not-be-read")
    monkeypatch.setenv("CLAUDE_MODEL", "must-not-be-read")

    config = _mock_config_from_environment()

    assert config.api_key is None
    assert config.model is None
