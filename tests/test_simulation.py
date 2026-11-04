import math
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image


p = pytest.importorskip("pybullet")

from engine import config
from engine.simulation import Simulation, TaskTransitionError


@pytest.fixture
def simulation(monkeypatch):
    monkeypatch.setattr("engine.simulation.time.sleep", lambda _: None)
    sim = Simulation(gui=False)
    yield sim
    sim.close()


def _set_robot_pose(sim, x, y, yaw=0.0):
    p.resetBasePositionAndOrientation(
        sim.world.robot_id,
        [x, y, 0.22],
        p.getQuaternionFromEuler([0, 0, yaw]),
        physicsClientId=sim.client,
    )


def test_world_creates_all_floor_objects_and_cone_mesh_geometry(simulation):
    cone_id = next(
        object_id
        for object_id, truth in simulation.world.object_truth.items()
        if truth["shape"] == "cone"
    )
    collision_shapes = p.getCollisionShapeData(
        cone_id, -1, physicsClientId=simulation.client
    )
    visual_shapes = p.getVisualShapeData(
        cone_id, physicsClientId=simulation.client
    )
    aabb_min, aabb_max = p.getAABB(cone_id, -1, physicsClientId=simulation.client)

    assert p.getNumBodies(physicsClientId=simulation.client) == 13
    assert len(simulation.world.object_ids) == 5
    assert sorted(
        truth["shape"] for truth in simulation.world.object_truth.values()
    ) == ["cone", "cube", "cube", "cylinder", "sphere"]
    assert len(collision_shapes) == 1
    assert collision_shapes[0][2] == p.GEOM_MESH
    assert len(visual_shapes) == 1
    assert visual_shapes[0][2] == p.GEOM_MESH
    assert visual_shapes[0][7] == pytest.approx((0.55, 0.2, 0.75, 1.0))
    assert (aabb_min[0], aabb_min[1], aabb_min[2]) == pytest.approx(
        (-0.22, 1.98, 0.03), abs=0.0011
    )
    assert (aabb_max[0], aabb_max[1], aabb_max[2]) == pytest.approx(
        (0.22, 2.42, 0.53), abs=0.0011
    )


def test_camera_image_is_640x480_jpeg_and_fov_is_horizontal(simulation):
    image_bytes, _ = simulation.camera_jpeg()
    image = Image.open(BytesIO(image_bytes))
    horizontal_fov = math.degrees(
        2
        * math.atan(
            math.tan(math.radians(config.CAMERA_VERTICAL_FOV_DEGREES / 2))
            * config.CAMERA_WIDTH
            / config.CAMERA_HEIGHT
        )
    )

    assert image.size == (640, 480)
    assert image.format == "JPEG"
    assert image_bytes.startswith(b"\xff\xd8")
    assert horizontal_fov == pytest.approx(90.0)
    colors = image.convert("RGB").getcolors(maxcolors=640 * 480)
    assert colors is not None and len(colors) > 1
    band_bytes = image.convert("RGB").crop((0, 335, 640, 378)).tobytes()
    blue_band_pixels = sum(
        1
        for index in range(0, len(band_bytes), 3)
        if band_bytes[index + 2] > 180
        and band_bytes[index + 1] > 100
        and band_bytes[index] < 100
    )
    assert blue_band_pixels < 1000


def test_depth_ray_detects_object_ahead(simulation):
    object_id = simulation.world.object_ids[0]
    p.resetBasePositionAndOrientation(
        object_id, [1.5, 0.0, 0.22], [0, 0, 0, 1], physicsClientId=simulation.client
    )

    distance = simulation.depth()

    assert distance is not None
    assert 0.0 < distance < 2.0


def test_move_and_turn_follow_requested_units(simulation):
    moved = simulation.move(0.1)
    turned = simulation.turn(90)

    assert moved["moved"] == pytest.approx(0.1)
    assert moved["collided"] is False
    assert turned["turned"] == pytest.approx(90)
    assert simulation.state()["heading"] == pytest.approx(90, abs=0.2)


def test_turn_direction_remains_consistent_across_heading_wrap(simulation):
    headings = []
    for _ in range(4):
        response = simulation.turn(90)
        assert response["turned"] == pytest.approx(90)
        headings.append(simulation.state()["heading"])

    assert headings == pytest.approx([90, 180, 270, 0], abs=0.1)


@pytest.mark.parametrize(
    ("heading", "expected"),
    [(0, 0), (360, 0), (720, 0), (-90, 270), (450, 90)],
)
def test_state_heading_is_normalized_without_changing_orientation(
    simulation, heading, expected
):
    p.resetBasePositionAndOrientation(
        simulation.world.robot_id,
        [0, 0, 0.22],
        p.getQuaternionFromEuler([0, 0, -math.radians(heading)]),
        physicsClientId=simulation.client,
    )
    orientation_before = p.getBasePositionAndOrientation(
        simulation.world.robot_id, physicsClientId=simulation.client
    )[1]

    reported = simulation.state()["heading"]

    orientation_after = p.getBasePositionAndOrientation(
        simulation.world.robot_id, physicsClientId=simulation.client
    )[1]
    assert reported == pytest.approx(expected, abs=0.1)
    assert orientation_after == orientation_before
    assert 0 <= reported < 360


def test_collision_backs_off_exactly_tenth_metre_and_fails_after_three(simulation):
    start_x = 3.62
    _set_robot_pose(simulation, start_x, 0.0)

    first = simulation.move(0.2)
    after_backoff_x = simulation.world.robot_pose()[0][0]

    assert first["collided"] is True
    assert first["backed_off"] == pytest.approx(0.1)
    assert first["retry_count"] == 1
    assert first["failed"] is False
    collision_x = start_x + first["moved"]
    assert collision_x - after_backoff_x == pytest.approx(first["backed_off"], abs=0.001)
    assert after_backoff_x - start_x == pytest.approx(
        first["moved"] - first["backed_off"], abs=0.001
    )

    second = simulation.move(0.2)
    third = simulation.move(0.2)
    assert second["retry_count"] == 2
    assert third["retry_count"] == config.MAX_COLLISION_RETRIES
    assert third["failed"] is True
    assert simulation.state()["state"] == "Failed"
    assert simulation.move(0.2)["failed"] is True
    assert simulation.turn(90)["failed"] is True


def test_attached_object_does_not_collide_with_robot_but_blocks_at_walls(simulation):
    object_id = simulation.world.object_ids[0]
    p.resetBasePositionAndOrientation(
        object_id, [0.5, 0.0, 0.22], [0, 0, 0, 1], physicsClientId=simulation.client
    )
    assert simulation.pickup() == {"success": True}
    assert simulation.move(0.1)["collided"] is False

    _set_robot_pose(simulation, 3.6, 0.0)
    simulation._follow_held_object()
    result = simulation.move(0.1)

    assert result["collided"] is True
    assert simulation.world.held_object_id is not None
    assert result["backed_off"] == pytest.approx(0.1)
    assert simulation.world.robot_pose()[0][0] == pytest.approx(
        3.6 + result["moved"] - result["backed_off"], abs=0.001
    )
    carried_pos = p.getBasePositionAndOrientation(
        simulation.world.held_object_id, physicsClientId=simulation.client
    )[0]
    assert carried_pos[0] == pytest.approx(
        simulation.world.robot_pose()[0][0] + config.ATTACHMENT_OFFSET_METRES
    )
    assert carried_pos[1] == pytest.approx(simulation.world.robot_pose()[0][1])


def test_collision_diagnostics_capture_internal_pair_and_camera_frame(
    simulation, tmp_path
):
    simulation._diagnostics_dir = tmp_path
    _set_robot_pose(simulation, 3.62, 0.0)

    response = simulation.move(0.2)

    event = simulation._collision_events[-1]
    pair = event["collision_pairs"][0]
    frame_path = Path(event["camera_frame_path"])
    log_path = tmp_path / "collision_events.jsonl"

    assert response["collided"] is True
    assert pair["body_a_role"] == "robot"
    assert pair["body_b_role"] == "wall"
    assert event["requested_movement"] == pytest.approx(0.2)
    assert event["holding"] is False
    assert event["robot_position_after_recovery"] == pytest.approx(
        [3.62 + response["moved"] - response["backed_off"], 0.0], abs=0.001
    )
    assert frame_path.is_file()
    assert log_path.is_file()
    assert "collision_pairs" not in response
    assert "collision_events" not in simulation.state()


def test_turn_stops_before_carried_object_sweeps_into_scene_object(simulation):
    held_id = _place_object_in_front(simulation, 0.5)
    assert simulation.pickup() == {"success": True}
    blocker_id = next(
        object_id for object_id in simulation.world.object_ids if object_id != held_id
    )
    p.resetBasePositionAndOrientation(
        blocker_id,
        [-0.22, 0.5, 0.22],
        [0, 0, 0, 1],
        physicsClientId=simulation.client,
    )
    start_yaw = simulation.world.robot_pose()[1]

    result = simulation.turn(90)

    pair = simulation._collision_events[-1]["collision_pairs"][0]
    assert result["collided"] is True
    assert 0 < result["turned"] < 90
    assert pair["body_a_role"] == "held_object"
    assert pair["body_b_role"] == "scene_object"
    assert simulation.world.robot_pose()[1] == pytest.approx(
        start_yaw - math.radians(result["turned"]), abs=0.01
    )
    held_pos = p.getBasePositionAndOrientation(
        held_id, physicsClientId=simulation.client
    )[0]
    robot_pos = simulation.world.robot_pose()[0]
    yaw = simulation.world.robot_pose()[1]
    assert held_pos[0] == pytest.approx(
        robot_pos[0] + config.ATTACHMENT_OFFSET_METRES * math.cos(yaw), abs=0.01
    )
    assert held_pos[1] == pytest.approx(
        robot_pos[1] + config.ATTACHMENT_OFFSET_METRES * math.sin(yaw), abs=0.01
    )


def test_turn_does_not_treat_attached_object_as_robot_obstacle(simulation):
    _place_object_in_front(simulation, 0.5)
    assert simulation.pickup() == {"success": True}

    result = simulation.turn(90)

    assert result["turned"] == pytest.approx(90)
    assert result["collided"] is False
    assert simulation.state()["retry_count"] == 0


def test_carried_cone_clears_floor_and_can_turn_without_false_collision(simulation):
    cone_id = next(
        object_id
        for object_id, truth in simulation.world.object_truth.items()
        if truth["shape"] == "cone"
    )
    p.resetBasePositionAndOrientation(
        cone_id, [0.5, 0.0, 0.28], [0, 0, 0, 1], physicsClientId=simulation.client
    )

    assert simulation.pickup() == {"success": True}
    aabb_min, _ = p.getAABB(cone_id, physicsClientId=simulation.client)
    result = simulation.turn(60)

    assert aabb_min[2] == pytest.approx(config.ATTACHMENT_CLEARANCE_METRES)
    assert result["turned"] == pytest.approx(60)
    assert result["collided"] is False
    assert simulation.state()["retry_count"] == 0


def _place_object_in_front(simulation, distance, angle_degrees=0.0):
    object_id = simulation.world.object_ids[0]
    angle = math.radians(angle_degrees)
    p.resetBasePositionAndOrientation(
        object_id,
        [distance * math.cos(angle), distance * math.sin(angle), 0.22],
        [0, 0, 0, 1],
        physicsClientId=simulation.client,
    )
    return object_id


def test_pickup_uses_object_surface_distance_within_half_metre(simulation):
    object_id = _place_object_in_front(simulation, 0.8)

    result = simulation.pickup()

    assert result == {"success": True}
    assert simulation.world.held_object_id == object_id


def test_pickup_rejects_object_beyond_half_metre_surface_reach(simulation):
    _place_object_in_front(simulation, 1.1)

    result = simulation.pickup()

    assert result == {"success": False}
    assert simulation.world.held_object_id is None


def test_pickup_rejects_object_outside_alignment_tolerance(simulation):
    _place_object_in_front(simulation, 0.8, angle_degrees=31)

    result = simulation.pickup()

    assert result == {"success": False}
    assert simulation.world.held_object_id is None


def test_collision_backoff_leaves_object_in_pickup_surface_reach(simulation):
    object_id = _place_object_in_front(simulation, 0.7)

    movement = simulation.move(0.4)
    robot_pos = simulation.world.robot_pose()[0]
    object_pos = p.getBasePositionAndOrientation(
        object_id, physicsClientId=simulation.client
    )[0]
    center_distance = math.hypot(
        object_pos[0] - robot_pos[0], object_pos[1] - robot_pos[1]
    )
    closest = p.getClosestPoints(
        simulation.world.robot_id,
        object_id,
        distance=config.PICKUP_REACH_METRES,
        physicsClientId=simulation.client,
    )
    surface_distance = min(point[8] for point in closest)

    assert movement["collided"] is True
    assert movement["backed_off"] == pytest.approx(0.1)
    assert center_distance > config.PICKUP_REACH_METRES
    assert surface_distance == pytest.approx(0.073, abs=0.01)
    assert simulation.pickup() == {"success": True}
    assert simulation.world.held_object_id == object_id


def test_staged_visible_target_can_be_picked_up_after_collision_backoff(simulation):
    object_id = _place_object_in_front(simulation, 0.7)
    image = simulation.camera_jpeg()[1]
    assert len(image.getcolors(maxcolors=640 * 480) or []) > 1

    movement = simulation.move(0.4)
    assert movement["collided"] is True
    assert simulation.pickup() == {"success": True}
    assert simulation.world.held_object_id == object_id


def test_carried_object_attaches_behind_robot_and_camera_view_is_unoccluded(simulation):
    object_id = _place_object_in_front(simulation, 0.5)
    assert simulation.pickup() == {"success": True}
    image = simulation.camera_jpeg()[1]
    robot_pos = simulation.world.robot_pose()[0]
    object_pos = p.getBasePositionAndOrientation(
        object_id, physicsClientId=simulation.client
    )[0]
    attachment_dx = object_pos[0] - robot_pos[0]

    assert attachment_dx == pytest.approx(config.ATTACHMENT_OFFSET_METRES)
    assert config.ATTACHMENT_OFFSET_METRES < 0
    assert image.size == (config.CAMERA_WIDTH, config.CAMERA_HEIGHT)
    assert len(image.getcolors(maxcolors=640 * 480) or []) > 1


@pytest.mark.parametrize(
    ("robot_x", "robot_y", "expected_in_zone"),
    [(3.3, 2.8, True), (1.0, 1.0, False)],
)
def test_drop_reports_release_zone_and_final_outcome(
    simulation, robot_x, robot_y, expected_in_zone
):
    object_id = simulation.world.object_ids[0]
    p.resetBasePositionAndOrientation(
        object_id, [0.5, 0.0, 0.22], [0, 0, 0, 1], physicsClientId=simulation.client
    )
    assert simulation.pickup() == {"success": True}
    _set_robot_pose(simulation, robot_x, robot_y)
    simulation._follow_held_object()

    result = simulation.drop()

    expected_result = "pass" if expected_in_zone else "fail_not_reached"
    assert result == {
        "released": True,
        "in_drop_zone": expected_in_zone,
        "result": expected_result,
    }
    assert simulation.world.held_object_id is None
    state = simulation.state()
    assert state["state"] == "Done"
    assert state["result"] == expected_result


def test_drop_without_holding_preserves_state_and_does_not_pass(simulation):
    simulation.state_name = "Locate"
    simulation.result = None

    result = simulation.drop()

    assert result == {
        "released": False,
        "in_drop_zone": False,
        "result": None,
    }
    assert simulation.state()["state"] == "Locate"
    assert simulation.state()["result"] is None


def _scene_transforms(simulation):
    body_ids = [
        simulation.world.robot_id,
        *simulation.world.object_ids,
    ]
    return {
        body_id: p.getBasePositionAndOrientation(
            body_id, physicsClientId=simulation.client
        )
        for body_id in body_ids
    }


def _complete_current_task_successfully(simulation):
    object_id = _place_object_in_front(simulation, 0.5)
    assert simulation.pickup() == {"success": True}
    _set_robot_pose(simulation, 3.3, 2.8, yaw=0.0)
    simulation._follow_held_object()
    result = simulation.drop()
    assert result["result"] == "pass"


def test_task_start_clears_only_task_state_and_preserves_simulation(simulation):
    _set_robot_pose(simulation, 0.75, -1.25, yaw=math.radians(37))
    simulation.retry_count = 2
    simulation.last_collision = True
    simulation._collision_events.append({"diagnostic": "preserve"})
    simulation.last_action_time = 123.0
    simulation._last_robot_xy = (0.25, 0.5)
    transforms_before = _scene_transforms(simulation)

    response = simulation.start_task("mission-123-task-001")

    assert response == {
        "status": "started",
        "task_id": "mission-123-task-001",
        "task_status": "running",
        "active_task_id": "mission-123-task-001",
        "robot_state": {
            "state": "Locate",
            "x": 0.75,
            "y": -1.25,
            "heading": 323.0,
            "holding": False,
            "retry_count": 0,
            "collided": False,
            "result": None,
        },
    }
    assert _scene_transforms(simulation) == transforms_before
    assert simulation._collision_events == [{"diagnostic": "preserve"}]
    assert simulation.last_action_time == 123.0
    assert simulation._last_robot_xy == (0.25, 0.5)


def test_task_start_after_pass_preserves_robot_and_all_object_positions(simulation):
    simulation.start_task("task-A")
    _complete_current_task_successfully(simulation)
    transforms_before = _scene_transforms(simulation)
    simulation.retry_count = 1
    simulation.last_collision = True

    response = simulation.start_task("task-B")

    assert response["status"] == "started"
    assert response["task_id"] == "task-B"
    assert response["robot_state"]["state"] == "Locate"
    assert response["robot_state"]["result"] is None
    assert response["robot_state"]["retry_count"] == 0
    assert response["robot_state"]["collided"] is False
    assert _scene_transforms(simulation) == transforms_before


def test_old_duplicate_task_reports_its_status_not_new_active_task(simulation):
    simulation.start_task("task-A")
    _complete_current_task_successfully(simulation)
    simulation.start_task("task-B")
    simulation.retry_count = 1
    simulation.last_collision = True
    transforms_before = _scene_transforms(simulation)

    response = simulation.start_task("task-A")

    assert response["status"] == "duplicate"
    assert response["task_id"] == "task-A"
    assert response["task_status"] == "completed"
    assert response["active_task_id"] == "task-B"
    assert response["robot_state"]["state"] == "Locate"
    assert response["robot_state"]["retry_count"] == 1
    assert response["robot_state"]["collided"] is True
    assert simulation._active_task_id == "task-B"
    assert _scene_transforms(simulation) == transforms_before


@pytest.mark.parametrize(
    ("state_name", "result", "expected_error"),
    [
        ("Locate", None, "task_in_progress"),
        ("Go to object", None, "task_in_progress"),
        ("Carry", None, "task_in_progress"),
        ("Blocked", None, "task_in_progress"),
        ("Failed", None, "previous_task_not_successful"),
        ("Done", "fail_not_reached", "previous_task_not_successful"),
        ("Unexpected", None, "invalid_task_state"),
    ],
)
def test_task_start_rejects_invalid_transitions_without_resetting_state(
    simulation, state_name, result, expected_error
):
    simulation.state_name = state_name
    simulation.result = result
    simulation.retry_count = 2
    simulation.last_collision = True
    transforms_before = _scene_transforms(simulation)

    with pytest.raises(TaskTransitionError) as error:
        simulation.start_task("new-task")

    assert error.value.code == expected_error
    assert simulation.state_name == state_name
    assert simulation.result == result
    assert simulation.retry_count == 2
    assert simulation.last_collision is True
    assert simulation._task_status_by_id == {}
    assert _scene_transforms(simulation) == transforms_before


def test_task_start_rejects_held_object_without_moving_any_body(simulation):
    object_id = _place_object_in_front(simulation, 0.5)
    assert simulation.pickup() == {"success": True}
    transforms_before = _scene_transforms(simulation)
    held_id_before = simulation.world.held_object_id
    retry_count_before = simulation.retry_count

    with pytest.raises(TaskTransitionError) as error:
        simulation.start_task("next-task")

    assert error.value.code == "object_still_held"
    assert simulation.world.held_object_id == held_id_before == object_id
    assert simulation.state_name == "Carry"
    assert simulation.retry_count == retry_count_before
    assert _scene_transforms(simulation) == transforms_before


def test_duplicate_of_current_active_task_is_idempotent(simulation):
    simulation.start_task("task-A")
    simulation.retry_count = 2
    simulation.last_collision = True
    transforms_before = _scene_transforms(simulation)

    response = simulation.start_task("task-A")

    assert response["status"] == "duplicate"
    assert response["task_id"] == "task-A"
    assert response["task_status"] == "running"
    assert response["active_task_id"] == "task-A"
    assert response["robot_state"]["retry_count"] == 2
    assert response["robot_state"]["collided"] is True
    assert _scene_transforms(simulation) == transforms_before
