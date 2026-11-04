import math
import pybullet as p
from . import config


def _cone_mesh(radius, height, segments=24):
    vertices = [
        [
            radius * math.cos(2 * math.pi * index / segments),
            radius * math.sin(2 * math.pi * index / segments),
            -height / 2,
        ]
        for index in range(segments)
    ]
    vertices.append([0.0, 0.0, height / 2])
    indices = []
    for index in range(segments):
        next_index = (index + 1) % segments
        indices.extend([index, next_index, segments])
    for index in range(1, segments - 1):
        indices.extend([0, index + 1, index])
    return vertices, indices


class World:
    """Owns all privileged scene truth. Never serialize object metadata to agent."""

    def __init__(self, client_id: int):
        self.client = client_id
        self.object_ids = []
        self.object_truth = {}  # internal only: id -> descriptive metadata
        self.wall_ids = []
        self.drop_zone_id = None
        self.robot_id = None
        self.held_object_id = None
        self.floor_id = None
        self._build()

    def _visual_collision_box(self, half, pos, rgba):
        col = p.createCollisionShape(p.GEOM_BOX, halfExtents=half, physicsClientId=self.client)
        vis = p.createVisualShape(p.GEOM_BOX, halfExtents=half, rgbaColor=rgba, physicsClientId=self.client)
        return p.createMultiBody(0, col, vis, pos, physicsClientId=self.client)

    def _build(self):
        p.resetSimulation(physicsClientId=self.client)
        p.setGravity(0, 0, -9.81, physicsClientId=self.client)
        p.setTimeStep(config.DT, physicsClientId=self.client)
        p.setPhysicsEngineParameter(fixedTimeStep=config.DT, numSolverIterations=80, physicsClientId=self.client)

        plane_col = p.createCollisionShape(p.GEOM_BOX, halfExtents=[config.ROOM_HALF_SIZE, config.ROOM_HALF_SIZE, 0.05], physicsClientId=self.client)
        plane_vis = p.createVisualShape(p.GEOM_BOX, halfExtents=[config.ROOM_HALF_SIZE, config.ROOM_HALF_SIZE, 0.05], rgbaColor=[0.88, 0.89, 0.91, 1], physicsClientId=self.client)
        self.floor_id = p.createMultiBody(0, plane_col, plane_vis, [0, 0, -0.05], physicsClientId=self.client)

        # Four boundary walls. They are collision geometry, not objects.
        wall_h = 0.8
        wall_t = 0.12
        for x, y, hx, hy in [
            (0, config.ROOM_HALF_SIZE, config.ROOM_HALF_SIZE, wall_t),
            (0, -config.ROOM_HALF_SIZE, config.ROOM_HALF_SIZE, wall_t),
            (config.ROOM_HALF_SIZE, 0, wall_t, config.ROOM_HALF_SIZE),
            (-config.ROOM_HALF_SIZE, 0, wall_t, config.ROOM_HALF_SIZE),
        ]:
            self.wall_ids.append(
                self._visual_collision_box(
                    [hx, hy, wall_h], [x, y, wall_h], [0.72, 0.75, 0.80, 1]
                )
            )

        # Marked drop zone: visual square on floor. Coordinates remain engine-internal.
        dz_vis = p.createVisualShape(p.GEOM_BOX, halfExtents=[config.DROP_ZONE_HALF_SIZE, config.DROP_ZONE_HALF_SIZE, 0.012], rgbaColor=[0.1, 0.75, 0.25, 1], physicsClientId=self.client)
        self.drop_zone_id = p.createMultiBody(0, -1, dz_vis, [*config.DROP_ZONE_XY, 0.012], physicsClientId=self.client)

        self._make_robot()

        # 5 shapes; repeated colour and repeated shape are intentional per brief.
        specs = [
            ("cube", "red", [0.8, 0.12, 0.12, 1], [1.5, -1.7, 0.22]),
            ("sphere", "blue", [0.12, 0.25, 0.9, 1], [-1.8, -1.2, 0.22]),
            ("cylinder", "red", [0.8, 0.12, 0.12, 1], [-1.4, 1.5, 0.25]),
            ("cube", "yellow", [0.95, 0.75, 0.1, 1], [1.8, 1.2, 0.22]),
            ("cone", "purple", [0.55, 0.2, 0.75, 1], [0.0, 2.2, 0.28]),
        ]
        for shape, colour, rgba, pos in specs:
            oid = self._make_object(shape, rgba, pos)
            self.object_ids.append(oid)
            self.object_truth[oid] = {"shape": shape, "colour": colour, "initial_position": tuple(pos)}

    def _make_robot(self):
        # Capsule-like mobile base, forward direction is local +X.
        col = p.createCollisionShape(p.GEOM_CYLINDER, radius=0.24, height=0.42, physicsClientId=self.client)
        vis = p.createVisualShape(p.GEOM_CYLINDER, radius=0.24, length=0.42, rgbaColor=[0.12, 0.18, 0.24, 1], physicsClientId=self.client)
        # Movement is kinematic; simulation.py checks the collider before each step.
        self.robot_id = p.createMultiBody(0, col, vis, [0, 0, 0.22], physicsClientId=self.client)
        # Keep the GUI orientation marker behind the camera so it cannot occlude images.
        marker_vis = p.createVisualShape(p.GEOM_BOX, halfExtents=[0.09, 0.07, 0.05], rgbaColor=[0.15, 0.65, 0.95, 1], physicsClientId=self.client)
        self.camera_marker = p.createMultiBody(0, -1, marker_vis, [-0.15, 0, 0.42], physicsClientId=self.client)
        p.changeDynamics(self.robot_id, -1, lateralFriction=0.9, spinningFriction=0.02, rollingFriction=0.01, physicsClientId=self.client)

    def _make_object(self, shape, rgba, pos):
        if shape == "cube":
            col = p.createCollisionShape(p.GEOM_BOX, halfExtents=[0.22, 0.22, 0.22], physicsClientId=self.client)
            vis = p.createVisualShape(p.GEOM_BOX, halfExtents=[0.22, 0.22, 0.22], rgbaColor=rgba, physicsClientId=self.client)
        elif shape == "sphere":
            col = p.createCollisionShape(p.GEOM_SPHERE, radius=0.22, physicsClientId=self.client)
            vis = p.createVisualShape(p.GEOM_SPHERE, radius=0.22, rgbaColor=rgba, physicsClientId=self.client)
        elif shape == "cylinder":
            col = p.createCollisionShape(p.GEOM_CYLINDER, radius=0.2, height=0.48, physicsClientId=self.client)
            vis = p.createVisualShape(p.GEOM_CYLINDER, radius=0.2, length=0.48, rgbaColor=rgba, physicsClientId=self.client)
        elif shape == "cone":
            vertices, indices = _cone_mesh(radius=0.22, height=0.5)
            # This build lacks GEOM_CONE; a convex mesh supports movable objects.
            col = p.createCollisionShape(
                p.GEOM_MESH,
                vertices=vertices,
                indices=indices,
                physicsClientId=self.client,
            )
            vis = p.createVisualShape(
                p.GEOM_MESH,
                vertices=vertices,
                indices=indices,
                rgbaColor=rgba,
                physicsClientId=self.client,
            )
        else:
            raise ValueError(f"Unsupported object shape: {shape}")
        return p.createMultiBody(0.25, col, vis, pos, physicsClientId=self.client)

    def robot_pose(self):
        pos, quat = p.getBasePositionAndOrientation(self.robot_id, physicsClientId=self.client)
        yaw = p.getEulerFromQuaternion(quat)[2]
        return pos, yaw

    def update_camera_marker(self):
        pos, yaw = self.robot_pose()
        rear_x = pos[0] - 0.15 * math.cos(yaw)
        rear_y = pos[1] - 0.15 * math.sin(yaw)
        p.resetBasePositionAndOrientation(self.camera_marker, [rear_x, rear_y, 0.42], p.getQuaternionFromEuler([0, 0, yaw]), physicsClientId=self.client)

    def is_in_drop_zone(self, position):
        x, y = position[0], position[1]
        dx, dy = config.DROP_ZONE_XY
        return abs(x - dx) <= config.DROP_ZONE_HALF_SIZE and abs(y - dy) <= config.DROP_ZONE_HALF_SIZE
