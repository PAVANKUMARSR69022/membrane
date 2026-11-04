import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Box, Eye, RotateCcw, Compass, MapPin, RefreshCw, Layers } from 'lucide-react';
import { PanelContainer } from '../common/PanelContainer';
import { RobotState } from '../../types/robot';

interface SimulationPanelProps {
  robotState: RobotState;
}

// Scene objects mirroring backend engine/world.py
interface SceneObject {
  id: string;
  type: 'cube' | 'sphere' | 'cylinder' | 'cone';
  label: string;
  color: number;
  pos: [number, number, number];
  mesh?: THREE.Mesh;
}

const INITIAL_OBJECTS: Omit<SceneObject, 'mesh'>[] = [
  { id: 'red_cube',      type: 'cube',     label: 'Red Cube',      color: 0xcc2020, pos: [1.5, -1.7, 0.22] },
  { id: 'blue_sphere',   type: 'sphere',   label: 'Blue Sphere',   color: 0x2050e0, pos: [-1.8, -1.2, 0.22] },
  { id: 'red_cylinder',  type: 'cylinder', label: 'Red Cylinder',  color: 0xcc2020, pos: [-1.4, 1.5, 0.25] },
  { id: 'yellow_cube',   type: 'cube',     label: 'Yellow Cube',   color: 0xf0c010, pos: [1.8, 1.2, 0.22] },
  { id: 'purple_cone',   type: 'cone',     label: 'Purple Cone',   color: 0x8c33bf, pos: [0.0, 2.2, 0.28] },
];

function randomizePositions(objects: Omit<SceneObject, 'mesh'>[]): Omit<SceneObject, 'mesh'>[] {
  const placed: [number, number][] = [];
  return objects.map(obj => {
    let nx = 0, ny = 0, tries = 0;
    do {
      nx = (Math.random() - 0.5) * 7.0;
      ny = (Math.random() - 0.5) * 7.0;
      tries++;
    } while (tries < 50 && (
      Math.hypot(nx, ny) < 0.7 ||
      (Math.hypot(nx - 2.8, ny - 2.8) < 1.0) ||
      placed.some(([px, py]) => Math.hypot(nx - px, ny - py) < 0.6)
    ));
    placed.push([nx, ny]);
    return { ...obj, pos: [nx, ny, obj.pos[2]] as [number, number, number] };
  });
}

function createObjectMesh(type: SceneObject['type'], color: number): THREE.Mesh {
  let geo: THREE.BufferGeometry;
  switch (type) {
    case 'cube':
      geo = new THREE.BoxGeometry(0.44, 0.44, 0.44);
      break;
    case 'sphere':
      geo = new THREE.SphereGeometry(0.22, 16, 12);
      break;
    case 'cylinder':
      geo = new THREE.CylinderGeometry(0.2, 0.2, 0.48, 20);
      break;
    case 'cone':
      geo = new THREE.ConeGeometry(0.22, 0.5, 18);
      break;
  }
  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.1,
    roughness: 0.5,
    emissive: color,
    emissiveIntensity: 0.1,
  });
  return new THREE.Mesh(geo, mat);
}

function buildRoverGroup(holding: boolean): THREE.Group {
  const roverGroup = new THREE.Group();

  // ── Chassis ──────────────────────────────────────────────
  const chassisGeo = new THREE.BoxGeometry(0.6, 0.35, 0.18);
  const chassisMat = new THREE.MeshStandardMaterial({ color: 0x2a2d35, metalness: 0.7, roughness: 0.4 });
  const chassis = new THREE.Mesh(chassisGeo, chassisMat);
  chassis.position.set(0, 0, 0.18);
  chassis.castShadow = true;
  roverGroup.add(chassis);

  // ── Chassis top detail plate ──────────────────────────────
  const topPlateGeo = new THREE.BoxGeometry(0.52, 0.28, 0.04);
  const topPlateMat = new THREE.MeshStandardMaterial({ color: 0x1e2128, metalness: 0.8, roughness: 0.3 });
  const topPlate = new THREE.Mesh(topPlateGeo, topPlateMat);
  topPlate.position.set(0, 0, 0.29);
  roverGroup.add(topPlate);

  // ── Amber status light strip ──────────────────────────────
  const stripGeo = new THREE.BoxGeometry(0.5, 0.03, 0.02);
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
  const strip = new THREE.Mesh(stripGeo, stripMat);
  strip.position.set(0, -0.19, 0.19);
  roverGroup.add(strip);

  // ── 4 Wheels ─────────────────────────────────────────────
  const wheelPositions: [number, number][] = [
    [ 0.26,  0.21],
    [ 0.26, -0.21],
    [-0.26,  0.21],
    [-0.26, -0.21],
  ];
  wheelPositions.forEach(([wx, wy]) => {
    const tyreGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.07, 18);
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const tyre = new THREE.Mesh(tyreGeo, tyreMat);
    tyre.rotation.x = Math.PI / 2;
    tyre.position.set(wx, wy, 0.1);
    tyre.castShadow = true;
    roverGroup.add(tyre);

    const hubGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.075, 12);
    const hubMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4b, metalness: 0.9 });
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(wx, wy, 0.1);
    roverGroup.add(hub);
  });

  // ── Sensor Mast ───────────────────────────────────────────
  const mastGeo = new THREE.CylinderGeometry(0.025, 0.028, 0.28, 10);
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4b, metalness: 0.8 });
  const mast = new THREE.Mesh(mastGeo, mastMat);
  mast.position.set(-0.1, 0, 0.44);
  roverGroup.add(mast);

  // LiDAR dome on mast
  const lidarGeo = new THREE.SphereGeometry(0.065, 12, 10);
  const lidarMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.95 });
  const lidar = new THREE.Mesh(lidarGeo, lidarMat);
  lidar.position.set(-0.1, 0, 0.6);
  roverGroup.add(lidar);

  // LiDAR ring emitter
  const lidarRingGeo = new THREE.TorusGeometry(0.065, 0.008, 8, 24);
  const lidarRingMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
  const lidarRing = new THREE.Mesh(lidarRingGeo, lidarRingMat);
  lidarRing.position.set(-0.1, 0, 0.6);
  roverGroup.add(lidarRing);

  // Camera eye
  const camGeo = new THREE.BoxGeometry(0.08, 0.05, 0.05);
  const camMat = new THREE.MeshStandardMaterial({ color: 0x0d1117, metalness: 0.9 });
  const cam = new THREE.Mesh(camGeo, camMat);
  cam.position.set(0.28, 0, 0.3);
  roverGroup.add(cam);

  // Camera lens
  const lensGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.02, 12);
  const lensMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const lens = new THREE.Mesh(lensGeo, lensMat);
  lens.rotation.z = Math.PI / 2;
  lens.position.set(0.33, 0, 0.3);
  roverGroup.add(lens);

  // ── Grabber Arm ───────────────────────────────────────────
  const turretGeo = new THREE.CylinderGeometry(0.05, 0.065, 0.09, 14);
  const turretMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4b, metalness: 0.85 });
  const turret = new THREE.Mesh(turretGeo, turretMat);
  turret.position.set(0.28, 0, 0.2);
  roverGroup.add(turret);

  const armGroup = new THREE.Group();
  armGroup.position.set(0.28, 0, 0.26);

  const upperArmGeo = new THREE.BoxGeometry(0.04, 0.04, 0.22);
  const upperArmMat = new THREE.MeshStandardMaterial({ color: 0x2a2d35, metalness: 0.7 });
  const upperArm = new THREE.Mesh(upperArmGeo, upperArmMat);
  upperArm.position.set(0.1, 0, 0.11);
  upperArm.rotation.y = 0;
  upperArm.rotation.z = holding ? -Math.PI / 6 : -Math.PI / 10;
  armGroup.add(upperArm);

  const forearmGeo = new THREE.BoxGeometry(0.03, 0.03, 0.18);
  const forearm = new THREE.Mesh(forearmGeo, upperArmMat);
  forearm.position.set(0.2, 0, 0.19);
  forearm.rotation.z = holding ? -Math.PI / 8 : 0;
  armGroup.add(forearm);

  const fingerGeo = new THREE.BoxGeometry(0.015, 0.07, 0.08);
  const fingerMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9 });
  const spread = holding ? 0.015 : 0.04;

  const lFinger = new THREE.Mesh(fingerGeo, fingerMat);
  lFinger.position.set(0.28, spread, 0.14);
  armGroup.add(lFinger);

  const rFinger = new THREE.Mesh(fingerGeo, fingerMat);
  rFinger.position.set(0.28, -spread, 0.14);
  armGroup.add(rFinger);

  roverGroup.add(armGroup);

  // ── Heading Arrow ─────────────────────────────────────────
  const arrowDir = new THREE.Vector3(1, 0, 0);
  const arrow = new THREE.ArrowHelper(arrowDir, new THREE.Vector3(0, 0, 0.2), 0.75, 0x10b981, 0.2, 0.12);
  roverGroup.add(arrow);

  // ── Camera FOV Lines ──────────────────────────────────────
  const fovGeo = new THREE.BufferGeometry();
  const fovV = new Float32Array([
    0.3, 0, 0.3,  2.2, -1.5, 0.1,
    0.3, 0, 0.3,  2.2,  1.5, 0.1,
    0.3, 0, 0.3,  2.2, -1.5, 0.9,
    0.3, 0, 0.3,  2.2,  1.5, 0.9,
    2.2, -1.5, 0.1, 2.2,  1.5, 0.1,
    2.2,  1.5, 0.1, 2.2,  1.5, 0.9,
    2.2,  1.5, 0.9, 2.2, -1.5, 0.9,
    2.2, -1.5, 0.9, 2.2, -1.5, 0.1,
  ]);
  fovGeo.setAttribute('position', new THREE.BufferAttribute(fovV, 3));
  const fovMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.25 });
  const fovLines = new THREE.LineSegments(fovGeo, fovMat);
  roverGroup.add(fovLines);

  return roverGroup;
}

export const SimulationPanel: React.FC<SimulationPanelProps> = ({ robotState }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const robotGroupRef = useRef<THREE.Group | null>(null);
  const objectMeshesRef = useRef<THREE.Group | null>(null);
  const animIdRef = useRef<number>(0);

  const [viewMode, setViewMode] = useState<'perspective' | 'top'>('perspective');
  const [sceneObjects, setSceneObjects] = useState<Omit<SceneObject, 'mesh'>[]>(INITIAL_OBJECTS);

  const rebuildObjects = useCallback((scene: THREE.Scene, objs: Omit<SceneObject, 'mesh'>[]) => {
    if (objectMeshesRef.current) {
      scene.remove(objectMeshesRef.current);
      objectMeshesRef.current.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
    }

    const objGroup = new THREE.Group();
    objectMeshesRef.current = objGroup;

    objs.forEach(obj => {
      const mesh = createObjectMesh(obj.type, obj.color);
      mesh.position.set(obj.pos[0], obj.pos[1], obj.pos[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      objGroup.add(mesh);

      const light = new THREE.PointLight(obj.color, 0.8, 1.2);
      light.position.set(obj.pos[0], obj.pos[1], obj.pos[2] + 0.3);
      objGroup.add(light);
    });

    scene.add(objGroup);
  }, []);

  // Initial Three.js setup
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight || 380;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x111215);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(6.5, -7.5, 6.0);
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    while (container.firstChild) container.removeChild(container.firstChild);
    container.appendChild(renderer.domElement);

    // Lighting — warm industrial tones
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xfff8e0, 1.4);
    dirLight.position.set(5, -5, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const fillLight = new THREE.PointLight(0xf59e0b, 0.6, 15);
    fillLight.position.set(-3, 3, 5);
    scene.add(fillLight);

    // Floor
    const floorGeo = new THREE.PlaneGeometry(8.0, 8.0);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x16171b, roughness: 0.9, metalness: 0.1 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.receiveShadow = true;
    scene.add(floor);

    // Grid — industrial tinted
    const grid = new THREE.GridHelper(8, 16, 0x2e323b, 0x1c1e24);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = 0.004;
    scene.add(grid);

    // Axes
    const axes = new THREE.AxesHelper(1.0);
    axes.position.z = 0.015;
    scene.add(axes);

    // Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.8, transparent: true, opacity: 0.55 });
    const wallWireMat = new THREE.LineBasicMaterial({ color: 0x2e323b });
    const wallSpecs = [
      { size: [8.0, 0.12, 0.8] as [number,number,number], pos: [0, 4.0, 0.4] as [number,number,number] },
      { size: [8.0, 0.12, 0.8] as [number,number,number], pos: [0, -4.0, 0.4] as [number,number,number] },
      { size: [0.12, 8.0, 0.8] as [number,number,number], pos: [4.0, 0, 0.4] as [number,number,number] },
      { size: [0.12, 8.0, 0.8] as [number,number,number], pos: [-4.0, 0, 0.4] as [number,number,number] },
    ];
    wallSpecs.forEach(({ size, pos }) => {
      const geo = new THREE.BoxGeometry(...size);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(...pos);
      scene.add(mesh);
      const edges = new THREE.EdgesGeometry(geo);
      const wire = new THREE.LineSegments(edges, wallWireMat);
      wire.position.set(...pos);
      scene.add(wire);
    });

    // Drop Zone
    const dropZoneGeo = new THREE.PlaneGeometry(1.1, 1.1);
    const dropZoneMat = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
    const dropZone = new THREE.Mesh(dropZoneGeo, dropZoneMat);
    dropZone.position.set(2.8, 2.8, 0.01);
    scene.add(dropZone);
    const dropZoneEdgesGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.1, 1.1));
    const dropZoneEdgesMat = new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.5 });
    const dropZoneEdges = new THREE.LineSegments(dropZoneEdgesGeo, dropZoneEdgesMat);
    dropZoneEdges.position.set(2.8, 2.8, 0.012);
    scene.add(dropZoneEdges);

    // Scene objects
    rebuildObjects(scene, INITIAL_OBJECTS);

    // Rover robot
    const roverGroup = buildRoverGroup(false);
    robotGroupRef.current = roverGroup;
    scene.add(roverGroup);

    // Mouse drag orbit
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    const handleMouseDown = (e: MouseEvent) => { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY }; };
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !cameraRef.current) return;
      const dx = (e.clientX - prevMouse.x) * 0.005;
      const dy = (e.clientY - prevMouse.y) * 0.005;
      const cam = cameraRef.current;
      const r = Math.hypot(cam.position.x, cam.position.y);
      const angle = Math.atan2(cam.position.y, cam.position.x) - dx;
      const z = Math.max(1.5, Math.min(15, cam.position.z + dy * 4));
      cam.position.x = r * Math.cos(angle);
      cam.position.y = r * Math.sin(angle);
      cam.position.z = z;
      cam.lookAt(0, 0, 0);
      prevMouse = { x: e.clientX, y: e.clientY };
    };
    const handleMouseUp = () => { isDragging = false; };
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!cameraRef.current) return;
      cameraRef.current.position.multiplyScalar(e.deltaY > 0 ? 1.08 : 0.92);
      cameraRef.current.lookAt(0, 0, 0);
    };
    const dom = renderer.domElement;
    dom.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    dom.addEventListener('wheel', handleWheel, { passive: false });

    // Animate
    const animate = () => {
      animIdRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight || 380;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animIdRef.current);
      dom.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      dom.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [rebuildObjects]);

  // Rebuild objects when sceneObjects state changes (Respawn button)
  useEffect(() => {
    if (sceneRef.current) {
      rebuildObjects(sceneRef.current, sceneObjects);
    }
  }, [sceneObjects, rebuildObjects]);

  // Sync rover position + rebuild arm based on holding state
  useEffect(() => {
    if (!robotGroupRef.current || !sceneRef.current) return;
    const scene = sceneRef.current;
    const { x, y, heading, holding } = robotState;

    scene.remove(robotGroupRef.current);
    robotGroupRef.current.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });

    const newRover = buildRoverGroup(holding);
    newRover.position.set(x, y, 0);
    newRover.rotation.z = -THREE.MathUtils.degToRad(heading);
    scene.add(newRover);
    robotGroupRef.current = newRover;
  }, [robotState]);

  const setPerspectiveView = () => {
    setViewMode('perspective');
    if (!cameraRef.current) return;
    cameraRef.current.position.set(6.5, -7.5, 6.0);
    cameraRef.current.up.set(0, 0, 1);
    cameraRef.current.lookAt(0, 0, 0);
  };

  const setTopView = () => {
    setViewMode('top');
    if (!cameraRef.current) return;
    cameraRef.current.position.set(0, 0.001, 11);
    cameraRef.current.up.set(0, 1, 0);
    cameraRef.current.lookAt(0, 0, 0);
  };

  const handleRespawn = () => {
    const randomized = randomizePositions(sceneObjects);
    setSceneObjects(randomized);
  };

  const LEGEND = [
    { label: 'Red Cube',      color: 'bg-red-500' },
    { label: 'Blue Sphere',   color: 'bg-blue-500' },
    { label: 'Red Cylinder',  color: 'bg-red-400' },
    { label: 'Yellow Cube',   color: 'bg-yellow-400' },
    { label: 'Purple Cone',   color: 'bg-purple-500' },
    { label: 'Drop Zone',     color: 'bg-emerald-500' },
  ];

  return (
    <PanelContainer
      title="Digital Twin 3D Arena"
      subtitle="Semantic Memory Visualization — 8.0m × 8.0m Workspace"
      icon={<Box size={16} />}
      actions={
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <button
            onClick={setPerspectiveView}
            className={`px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${
              viewMode === 'perspective'
                ? 'bg-amber-950/50 border-amber-500/50 text-amber-300'
                : 'bg-[#1c1e24] border-[#2e323b] text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye size={12} />
            <span>Perspective</span>
          </button>
          <button
            onClick={setTopView}
            className={`px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${
              viewMode === 'top'
                ? 'bg-amber-950/50 border-amber-500/50 text-amber-300'
                : 'bg-[#1c1e24] border-[#2e323b] text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass size={12} />
            <span>Top-Down</span>
          </button>
          <button
            onClick={handleRespawn}
            className="px-2 py-0.5 rounded border border-[#2e323b] bg-[#1c1e24] hover:bg-[#22252d] text-slate-400 hover:text-amber-300 transition-colors flex items-center gap-1"
            title="Randomize object positions (visualization only)"
          >
            <RefreshCw size={11} />
            <span>Respawn</span>
          </button>
          <button
            onClick={() => viewMode === 'top' ? setTopView() : setPerspectiveView()}
            className="p-1 rounded border border-[#2e323b] bg-[#1c1e24] hover:bg-[#22252d] text-slate-400 hover:text-amber-300 transition-colors"
            title="Reset Camera"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      }
    >
      <div className="relative w-full h-[380px] rounded border border-[#2e323b] overflow-hidden bg-[#111215]">
        {/* Three.js Canvas */}
        <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Top-left info badge */}
        <div className="absolute top-2.5 left-3 bg-black/70 border border-[#2e323b] px-2.5 py-1 rounded backdrop-blur-sm pointer-events-none font-mono text-[10px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-amber-300 font-semibold">DIGITAL TWIN ACTIVE</span>
          </div>
          <div className="text-[9px] text-slate-500 mt-0.5">PyBullet Physics Authoritative • Room [±4m]</div>
        </div>

        {/* Object legend */}
        <div className="absolute top-2.5 right-3 bg-black/70 border border-[#2e323b] px-2 py-1.5 rounded backdrop-blur-sm pointer-events-none font-mono">
          <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Layers size={8} />LEGEND
          </div>
          <div className="space-y-0.5">
            {LEGEND.map(item => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-sm ${item.color}`} />
                <span className="text-[9px] text-slate-400">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom coordinate badge */}
        <div className="absolute bottom-2.5 left-3 bg-black/75 border border-[#2e323b] px-3 py-1.5 rounded backdrop-blur-sm pointer-events-none font-mono text-[11px] text-slate-300 flex items-center gap-3">
          <div className="flex items-center gap-1">
            <MapPin size={12} className="text-emerald-400" />
            <span className="text-slate-500">POS:</span>
            <span className="text-emerald-300 font-semibold">
              X={robotState.x.toFixed(2)}m Y={robotState.y.toFixed(2)}m
            </span>
          </div>
          <div className="h-3 w-[1px] bg-slate-700" />
          <div>
            <span className="text-slate-500">HDG:</span>{' '}
            <span className="text-amber-300 font-semibold">{robotState.heading.toFixed(1)}°</span>
          </div>
          {robotState.holding && (
            <>
              <div className="h-3 w-[1px] bg-slate-700" />
              <div className="text-amber-400 font-bold text-[10px] animate-pulse">▲ HOLDING OBJECT</div>
            </>
          )}
        </div>

        {/* Bottom right hint */}
        <div className="absolute bottom-2.5 right-3 bg-black/50 px-2 py-0.5 rounded text-[9px] font-mono text-slate-500 pointer-events-none">
          Drag to Orbit • Scroll to Zoom • Respawn for new layout
        </div>
      </div>
    </PanelContainer>
  );
};
