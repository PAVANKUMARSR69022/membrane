import importlib
import sys
from types import ModuleType, SimpleNamespace

from fastapi.testclient import TestClient


simulation_module = sys.modules.get("engine.simulation")
server_module = sys.modules.pop("engine.server", None)
test_simulation_module = ModuleType("engine.simulation")
test_simulation_module.Simulation = object


class TaskTransitionError(ValueError):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


test_simulation_module.TaskTransitionError = TaskTransitionError
sys.modules["engine.simulation"] = test_simulation_module
try:
    server = importlib.import_module("engine.server")
finally:
    sys.modules.pop("engine.simulation", None)
    if simulation_module is not None:
        sys.modules["engine.simulation"] = simulation_module
    if server_module is not None:
        sys.modules["engine.server"] = server_module


def test_http_endpoints_keep_agent_responses_safe_and_enforce_tool_bounds(monkeypatch):
    sim = SimpleNamespace(
        state=lambda: {
            "state": "Idle",
            "x": 0.0,
            "y": 0.0,
            "heading": 0.0,
            "holding": False,
            "retry_count": 0,
            "collided": False,
            "result": None,
        },
        camera_jpeg=lambda: (b"\xff\xd8test\xff\xd9", None),
        depth=lambda: 0.75,
        move=lambda distance: {"moved": distance, "collided": False},
        turn=lambda degrees: {"turned": degrees, "collided": False},
        pickup=lambda: {"success": False},
        drop=lambda: {
            "released": False,
            "in_drop_zone": False,
            "result": None,
        },
        start_task=lambda task_id: {
            "status": "started",
            "task_id": task_id,
            "task_status": "running",
            "active_task_id": task_id,
            "robot_state": {
                "state": "Locate",
                "x": 0.0,
                "y": 0.0,
                "heading": 0.0,
                "holding": False,
                "retry_count": 0,
                "collided": False,
                "result": None,
            },
        },
    )
    monkeypatch.setattr(server, "_sim", sim)
    client = TestClient(server.app)

    assert client.get("/health").json() == {"ok": True}
    state_response = client.get("/state")
    assert state_response.status_code == 200
    assert set(state_response.json()) == {
        "state",
        "x",
        "y",
        "heading",
        "holding",
        "retry_count",
        "collided",
        "result",
    }
    image_response = client.get("/look")
    assert image_response.headers["content-type"] == "image/jpeg"
    assert image_response.content == b"\xff\xd8test\xff\xd9"
    assert client.get("/depth").json() == {"distance": 0.75}
    assert client.post("/move", json={"distance": 1.0}).status_code == 200
    assert client.post("/move", json={"distance": -1.0}).status_code == 200
    assert client.post("/move", json={"distance": 1.01}).status_code == 422
    assert client.post("/turn", json={"degrees": 90.0}).status_code == 200
    assert client.post("/turn", json={"degrees": -90.0}).status_code == 200
    assert client.post("/turn", json={"degrees": 90.01}).status_code == 422
    assert client.post("/pickup").json() == {"success": False}
    assert client.post("/drop").json() == {
        "released": False,
        "in_drop_zone": False,
        "result": None,
    }
    started = client.post("/task/start", json={"task_id": "mission-A"})
    assert started.status_code == 200
    assert started.json()["status"] == "started"
    assert started.json()["active_task_id"] == "mission-A"
    assert client.post(
        "/task/start",
        json={"task_id": "mission-A", "description": "extra fields rejected"},
    ).status_code == 422
    assert client.post("/task/start", json={"task_id": "../bad"}).status_code == 422


def test_task_start_maps_invalid_transitions_to_safe_conflict(monkeypatch):
    sim = SimpleNamespace(
        start_task=lambda _: (_ for _ in ()).throw(
            server.TaskTransitionError("task_in_progress")
        )
    )
    monkeypatch.setattr(server, "_sim", sim)

    response = TestClient(server.app).post(
        "/task/start", json={"task_id": "mission-B"}
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "task_in_progress"}
