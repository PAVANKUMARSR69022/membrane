import json
import math
import threading
import time
from pathlib import Path
import pybullet as p
from . import config
from .world import World


class TaskTransitionError(ValueError):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


class Simulation:
    def __init__(self, gui=True, diagnostics_dir=None):
        self.lock = threading.RLock()
        mode = p.GUI if gui else p.DIRECT
        self.client = p.connect(mode)
        if self.client < 0:
            raise RuntimeError("Could not connect to PyBullet")
        self.world = World(self.client)
        self.state_name = "Idle"
        self.result = None
        self.retry_count = 0
        self.last_collision = False
        self.last_action_time = time.monotonic()
        self._last_robot_xy = (0.0, 0.0)
        self._collision_events = []
        self._task_status_by_id = {}
        self._active_task_id = None
        self._diagnostics_dir = (
            Path(diagnostics_dir) if diagnostics_dir is not None else None
        )
        if self._diagnostics_dir is not None:
            self._diagnostics_dir.mkdir(parents=True, exist_ok=True)
        if gui:
            p.resetDebugVisualizerCamera(8.5, 45, -45, [0, 0, 0], physicsClientId=self.client)

    def start_task(self, task_id):
        with self.lock:
            previous_status = self._task_status_by_id.get(task_id)
            if previous_status is not None:
                return {
                    "status": "duplicate",
                    "task_id": task_id,
                    "task_status": previous_status,
                    "active_task_id": self._active_task_id,
                    "robot_state": self.state(),
                }

            if self.world.held_object_id is not None:
                raise TaskTransitionError("object_still_held")

            if self.state_name in {
                "Locate",
                "Go to object",
                "Carry",
                "Blocked",
            }:
                raise TaskTransitionError("task_in_progress")

            if self.state_name == "Failed" or (
                self.state_name == "Done" and self.result != "pass"
            ):
                raise TaskTransitionError("previous_task_not_successful")

            if not (
                (self.state_name == "Idle" and self.result is None)
                or (self.state_name == "Done" and self.result == "pass")
            ):
                raise TaskTransitionError("invalid_task_state")

            self.state_name = "Locate"
            self.result = None
            self.retry_count = 0
            self.last_collision = False
            self._task_status_by_id[task_id] = "running"
            self._active_task_id = task_id
            return {
                "status": "started",
                "task_id": task_id,
                "task_status": "running",
                "active_task_id": task_id,
                "robot_state": self.state(),
            }

    def _finish_active_task(self, status):
        if self._active_task_id is not None:
            self._task_status_by_id[self._active_task_id] = status
            self._active_task_id = None

    def _step(self):
        p.stepSimulation(physicsClientId=self.client)
        self.world.update_camera_marker()
        if p.isConnected(self.client):
            time.sleep(config.DT)

    def state(self):
        with self.lock:
            pos, yaw = self.world.robot_pose()
            return {
                "state": self.state_name,
                "x": round(pos[0], 3),
                "y": round(pos[1], 3),
                "heading": round((-math.degrees(yaw)) % 360, 1) % 360,
                "holding": self.world.held_object_id is not None,
                "retry_count": self.retry_count,
                "collided": self.last_collision,
                "result": self.result,
            }

    def camera_jpeg(self):
        with self.lock:
            pos, yaw = self.world.robot_pose()
            # Camera sits at the front of robot, 0.5m above floor, looking 10deg down.
            eye = [pos[0] + 0.25 * math.cos(yaw), pos[1] + 0.25 * math.sin(yaw), config.CAMERA_HEIGHT_METRES]
            pitch = math.radians(-config.CAMERA_TILT_DEGREES)
            target = [
                eye[0] + 3.0 * math.cos(yaw) * math.cos(pitch),
                eye[1] + 3.0 * math.sin(yaw) * math.cos(pitch),
                eye[2] + 3.0 * math.sin(pitch),
            ]
            up = [0, 0, 1]
            view = p.computeViewMatrix(eye, target, up)
            proj = p.computeProjectionMatrixFOV(config.CAMERA_VERTICAL_FOV_DEGREES, config.CAMERA_WIDTH / config.CAMERA_HEIGHT, config.CAMERA_NEAR, config.CAMERA_FAR)
            _, _, rgba, _, _ = p.getCameraImage(config.CAMERA_WIDTH, config.CAMERA_HEIGHT, view, proj, renderer=p.ER_TINY_RENDERER, physicsClientId=self.client)
            from PIL import Image
            import io
            img = Image.frombytes("RGBA", (config.CAMERA_WIDTH, config.CAMERA_HEIGHT), bytes(rgba)).convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=85)
            return buf.getvalue(), img

    def depth(self):
        with self.lock:
            pos, yaw = self.world.robot_pose()
            start = [
                pos[0] + 0.25 * math.cos(yaw),
                pos[1] + 0.25 * math.sin(yaw),
                config.DEPTH_RAY_HEIGHT_METRES,
            ]
            end = [
                start[0] + 10 * math.cos(yaw),
                start[1] + 10 * math.sin(yaw),
                start[2],
            ]
            hit = p.rayTest(start, end, physicsClientId=self.client)[0]
            if hit[0] < 0:
                return None
            return round(10.0 * hit[2], 3)

    def _body_role(self, body_id):
        if body_id == self.world.robot_id:
            return "robot"
        if body_id == self.world.held_object_id:
            return "held_object"
        if body_id == self.world.floor_id:
            return "floor"
        if body_id == self.world.drop_zone_id:
            return "drop_zone"
        if body_id in self.world.wall_ids:
            return "wall"
        if body_id in self.world.object_ids:
            return "scene_object"
        return "unknown"

    def _collision_pairs(self, moving_body_ids):
        obstacles = [
            self.world.floor_id,
            *self.world.wall_ids,
            *self.world.object_ids,
        ]
        pairs = []
        for moving_id in moving_body_ids:
            for obstacle_id in obstacles:
                if obstacle_id == moving_id:
                    continue
                if (
                    self.world.held_object_id is not None
                    and {moving_id, obstacle_id}
                    == {self.world.robot_id, self.world.held_object_id}
                ):
                    continue
                contacts = p.getClosestPoints(
                    moving_id,
                    obstacle_id,
                    distance=0,
                    physicsClientId=self.client,
                )
                if contacts:
                    pairs.append({
                        "body_a_id": int(moving_id),
                        "body_a_role": self._body_role(moving_id),
                        "body_b_id": int(obstacle_id),
                        "body_b_role": self._body_role(obstacle_id),
                        "closest_distance": round(
                            min(float(contact[8]) for contact in contacts), 6
                        ),
                    })
        return pairs

    def _record_collision_event(
        self,
        action,
        requested_movement,
        actual_movement,
        start_pose,
        actual_turn=0.0,
        backed_off=0.0,
        collision_pairs=(),
    ):
        after_pos, after_yaw = self.world.robot_pose()
        event = {
            "timestamp_ns": time.time_ns(),
            "action": action,
            "robot_position_before": [round(float(value), 6) for value in start_pose[0][:2]],
            "heading_before_degrees": round(
                (-math.degrees(start_pose[1])) % 360, 3
            ),
            "requested_movement": round(float(requested_movement), 6),
            "actual_movement_to_collision": round(float(actual_movement), 6),
            "actual_robot_displacement": [
                round(float(after_pos[0] - start_pose[0][0]), 6),
                round(float(after_pos[1] - start_pose[0][1]), 6),
            ],
            "actual_turn_degrees": round(float(actual_turn), 6),
            "backed_off": round(float(backed_off), 6),
            "robot_position_after_recovery": [
                round(float(after_pos[0]), 6),
                round(float(after_pos[1]), 6),
            ],
            "heading_after_recovery_degrees": round(
                (-math.degrees(after_yaw)) % 360, 3
            ),
            "holding": self.world.held_object_id is not None,
            "collision_pairs": list(collision_pairs),
            "camera_frame_path": None,
        }
        if self._diagnostics_dir is not None:
            self.world.update_camera_marker()
            image_bytes, _ = self.camera_jpeg()
            frame_path = self._diagnostics_dir / (
                f"collision_{event['timestamp_ns']}.jpg"
            )
            frame_path.write_bytes(image_bytes)
            event["camera_frame_path"] = str(frame_path)
            with (self._diagnostics_dir / "collision_events.jsonl").open(
                "a", encoding="utf-8"
            ) as event_file:
                event_file.write(json.dumps(event, sort_keys=True) + "\n")
        self._collision_events.append(event)

    def move(self, distance):
        """Return progress to collision; report the separate recovery offset as backed_off."""
        with self.lock:
            if self.state_name == "Failed" or self.retry_count >= config.MAX_COLLISION_RETRIES:
                self.state_name = "Failed"
                self._finish_active_task("failed")
                return {"moved": 0.0, "collided": False, "retry_count": self.retry_count, "failed": True}
            self.last_collision = False
            self.state_name = "Go to object" if self.world.held_object_id is None else "Carry"
            sign = 1 if distance >= 0 else -1
            remaining = abs(float(distance))
            moved = 0.0
            start_pos, start_yaw = self.world.robot_pose()
            start_pose = (tuple(start_pos), start_yaw)
            while remaining > 1e-6:
                step_dist = min(config.MOVE_SPEED_MPS * config.DT, remaining)
                cur_pos, cur_yaw = self.world.robot_pose()
                nx = cur_pos[0] + sign * step_dist * math.cos(cur_yaw)
                ny = cur_pos[1] + sign * step_dist * math.sin(cur_yaw)
                candidate_pos = [nx, ny, cur_pos[2]]
                candidate_orientation = p.getQuaternionFromEuler([0, 0, cur_yaw])
                p.resetBasePositionAndOrientation(
                    self.world.robot_id,
                    candidate_pos,
                    candidate_orientation,
                    physicsClientId=self.client,
                )
                if self.world.held_object_id is not None:
                    self._follow_held_object()
                held_id = self.world.held_object_id
                moving_body_ids = [self.world.robot_id]
                if held_id is not None:
                    moving_body_ids.append(held_id)
                collision_pairs = self._collision_pairs(moving_body_ids)
                if collision_pairs:
                    # moved is progress to the first colliding candidate pose; the
                    # separate back-off is applied once and reported separately.
                    moved += step_dist
                    backoff = 0.1
                    bx = nx - sign * backoff * math.cos(start_yaw)
                    by = ny - sign * backoff * math.sin(start_yaw)
                    p.resetBasePositionAndOrientation(
                        self.world.robot_id,
                        [bx, by, start_pos[2]],
                        p.getQuaternionFromEuler([0, 0, start_yaw]),
                        physicsClientId=self.client,
                    )
                    if held_id is not None:
                        self._follow_held_object()
                    self.world.update_camera_marker()
                    self.last_collision = True
                    self.retry_count += 1
                    failed = self.retry_count >= config.MAX_COLLISION_RETRIES
                    self.state_name = "Failed" if failed else "Blocked"
                    if failed:
                        self._finish_active_task("failed")
                    self._record_collision_event(
                        action="move",
                        requested_movement=sign * abs(float(distance)),
                        actual_movement=sign * moved,
                        start_pose=start_pose,
                        backed_off=backoff,
                        collision_pairs=collision_pairs,
                    )
                    return {
                        "moved": round(moved, 3),
                        "backed_off": backoff,
                        "collided": True,
                        "retry_count": self.retry_count,
                        "failed": failed,
                    }
                self._step()
                if held_id is not None:
                    self._follow_held_object()
                remaining -= step_dist
                moved += step_dist
            return {"moved": round(moved, 3), "collided": False, "retry_count": self.retry_count}

    def turn(self, degrees):
        with self.lock:
            if self.state_name == "Failed" or self.retry_count >= config.MAX_COLLISION_RETRIES:
                self.state_name = "Failed"
                self._finish_active_task("failed")
                return {"turned": 0.0, "collided": False, "failed": True}
            self.last_collision = False
            self.state_name = "Carry" if self.world.held_object_id is not None else "Locate"
            remaining = float(degrees)
            start_pos, start_yaw = self.world.robot_pose()
            start_pose = (tuple(start_pos), start_yaw)
            turned = 0.0
            while abs(remaining) > 1e-6:
                step = math.copysign(min(config.TURN_SPEED_DPS * config.DT, abs(remaining)), remaining)
                # Positive degrees means right/clockwise from above => negative mathematical yaw.
                candidate_turn = turned + step
                new_yaw = start_yaw - math.radians(candidate_turn)
                p.resetBasePositionAndOrientation(self.world.robot_id, start_pos, p.getQuaternionFromEuler([0, 0, new_yaw]), physicsClientId=self.client)
                if self.world.held_object_id is not None:
                    self._follow_held_object()
                moving_body_ids = [self.world.robot_id]
                if self.world.held_object_id is not None:
                    moving_body_ids.append(self.world.held_object_id)
                collision_pairs = self._collision_pairs(moving_body_ids)
                if collision_pairs:
                    restored_yaw = start_yaw - math.radians(turned)
                    p.resetBasePositionAndOrientation(
                        self.world.robot_id,
                        start_pos,
                        p.getQuaternionFromEuler([0, 0, restored_yaw]),
                        physicsClientId=self.client,
                    )
                    if self.world.held_object_id is not None:
                        self._follow_held_object()
                    self.world.update_camera_marker()
                    self.last_collision = True
                    self.retry_count += 1
                    failed = self.retry_count >= config.MAX_COLLISION_RETRIES
                    self.state_name = "Failed" if failed else "Blocked"
                    if failed:
                        self._finish_active_task("failed")
                    self._record_collision_event(
                        action="turn",
                        requested_movement=0.0,
                        actual_movement=0.0,
                        start_pose=start_pose,
                        actual_turn=turned,
                        collision_pairs=collision_pairs,
                    )
                    return {
                        "turned": round(float(turned), 2),
                        "collided": True,
                        "retry_count": self.retry_count,
                        "failed": failed,
                    }
                self._step()
                remaining -= step
                turned = candidate_turn
                if self.world.held_object_id is not None:
                    self._follow_held_object()
            return {"turned": round(float(degrees), 2), "collided": False}

    def _follow_held_object(self):
        if self.world.held_object_id is None:
            return
        pos, yaw = self.world.robot_pose()
        ox = pos[0] + config.ATTACHMENT_OFFSET_METRES * math.cos(yaw)
        oy = pos[1] + config.ATTACHMENT_OFFSET_METRES * math.sin(yaw)
        held_pos, _ = p.getBasePositionAndOrientation(
            self.world.held_object_id, physicsClientId=self.client
        )
        aabb_min, _ = p.getAABB(
            self.world.held_object_id, physicsClientId=self.client
        )
        local_bottom = aabb_min[2] - held_pos[2]
        held_z = config.ATTACHMENT_CLEARANCE_METRES - local_bottom
        p.resetBasePositionAndOrientation(
            self.world.held_object_id,
            [ox, oy, held_z],
            [0, 0, 0, 1],
            physicsClientId=self.client,
        )

    def pickup(self):
        with self.lock:
            if self.world.held_object_id is not None:
                return {"success": False}
            pos, yaw = self.world.robot_pose()
            candidates = []
            for oid in self.world.object_ids:
                op, _ = p.getBasePositionAndOrientation(oid, physicsClientId=self.client)
                dx, dy = op[0] - pos[0], op[1] - pos[1]
                center_distance = math.hypot(dx, dy)
                bearing = math.atan2(dy, dx)
                delta = (bearing - yaw + math.pi) % (2 * math.pi) - math.pi
                closest_points = p.getClosestPoints(
                    self.world.robot_id,
                    oid,
                    distance=config.PICKUP_REACH_METRES,
                    physicsClientId=self.client,
                )
                surface_distance = min(
                    (point[8] for point in closest_points),
                    default=math.inf,
                )
                if (
                    surface_distance <= config.PICKUP_REACH_METRES
                    and abs(math.degrees(delta))
                    <= config.PICKUP_HALF_ANGLE_DEGREES
                ):
                    candidates.append((center_distance, oid))
            if not candidates:
                return {"success": False}
            _, oid = min(candidates)
            self.world.held_object_id = oid
            p.setCollisionFilterPair(
                self.world.robot_id,
                oid,
                -1,
                -1,
                enableCollision=0,
                physicsClientId=self.client,
            )
            self._follow_held_object()
            self.state_name = "Carry"
            return {"success": True}

    def drop(self):
        with self.lock:
            if self.world.held_object_id is None:
                return {
                    "released": False,
                    "in_drop_zone": False,
                    "result": self.result,
                }
            oid = self.world.held_object_id
            pos, yaw = self.world.robot_pose()
            drop_pos = [
                pos[0] + config.ATTACHMENT_OFFSET_METRES * math.cos(yaw),
                pos[1] + config.ATTACHMENT_OFFSET_METRES * math.sin(yaw),
                0.25,
            ]
            p.resetBasePositionAndOrientation(oid, drop_pos, [0, 0, 0, 1], physicsClientId=self.client)
            p.setCollisionFilterPair(
                self.world.robot_id,
                oid,
                -1,
                -1,
                enableCollision=1,
                physicsClientId=self.client,
            )
            self.world.held_object_id = None
            in_zone = self.world.is_in_drop_zone(drop_pos)
            self.state_name = "Done"
            self.result = "pass" if in_zone else "fail_not_reached"
            self._finish_active_task(
                "completed" if self.result == "pass" else "failed"
            )
            return {
                "released": True,
                "in_drop_zone": bool(in_zone),
                "result": self.result,
            }

    def close(self):
        with self.lock:
            if p.isConnected(self.client):
                p.disconnect(self.client)
