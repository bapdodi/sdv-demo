import * as THREE from 'three';
import { MAP, node } from '../data/map';
import { ROAD_WIDTH as ROAD_W } from './roads';

// ── 공유 차량 리소스 ─────────────────────────────────────────────────
// fleet 차량마다 새 지오메트리/머티리얼을 만들지 않고 재사용 (GPU 메모리 절약).
// 바디 색만 차량별로 달라지므로 색상 기준으로 캐시한다.
const CAR_GEO = {
  body:  new THREE.BoxGeometry(2.0, 0.75, 4.5),
  cabin: new THREE.BoxGeometry(1.8, 0.52, 2.2),
  glass: new THREE.BoxGeometry(1.55, 0.44, 0.06),
  wheel: new THREE.CylinderGeometry(0.35, 0.35, 0.25, 8),
};
const CAR_MAT = {
  glass: new THREE.MeshPhongMaterial({ color: 0x2a3a50, transparent: true, opacity: 0.72, shininess: 140 }),
  dark:  new THREE.MeshPhongMaterial({ color: 0x111111 }),
};
const carBodyMatCache = new Map<number, THREE.MeshPhongMaterial>();
function bodyMaterial(color: number): THREE.MeshPhongMaterial {
  let mat = carBodyMatCache.get(color);
  if (!mat) {
    mat = new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0x333333 });
    carBodyMatCache.set(color, mat);
  }
  return mat;
}

export function initScene(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7eb4d8);
  scene.fog = new THREE.Fog(0x7eb4d8, 250, 900);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 1200);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.72));
  const sun = new THREE.DirectionalLight(0xfff5e0, 0.78);
  sun.position.set(400, 500, 200);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xc8ddf0, 0.20);
  fill.position.set(-200, 200, -100);
  scene.add(fill);

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(850, 550),
    new THREE.MeshLambertMaterial({ color: 0x5a7845 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(375, -0.06, 232.5);
  scene.add(ground);

  // Materials
  const roadMat: Record<string, THREE.Material> = {
    highway:  new THREE.MeshLambertMaterial({ color: 0x2a2a38 }),
    arterial: new THREE.MeshLambertMaterial({ color: 0x2e2e3a }),
    urban:    new THREE.MeshLambertMaterial({ color: 0x333340 }),
  };
  const lineMat      = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
  const yellowLineMat = new THREE.MeshLambertMaterial({ color: 0xddcc44 });
  const shoulderMat  = new THREE.MeshLambertMaterial({ color: 0x4a4a52 });
  const intMat       = new THREE.MeshLambertMaterial({ color: 0x3a3a44 });
  const ringMat      = new THREE.MeshBasicMaterial({ color: 0x5a5a5a, side: THREE.DoubleSide });

  // Node radii
  const nodeRadii: Record<number, number> = {};
  MAP.nodes.forEach(n => {
    let maxW = 0, connCount = 0;
    MAP.edges.forEach(e => {
      if (e.from === n.id || e.to === n.id) {
        maxW = Math.max(maxW, ROAD_W[e.type] || ROAD_W.urban);
        connCount++;
      }
    });
    nodeRadii[n.id] = maxW / 2 + 2.5 + (connCount - 2) * 3.5;
  });

  // Road segments
  MAP.edges.forEach(edge => {
    const from = node(edge.from);
    const to   = node(edge.to);
    const dx = to.x - from.x;
    const dz = to.y - from.y;
    const fullLen = Math.sqrt(dx*dx + dz*dz);
    const rA = nodeRadii[edge.from] || 6;
    const rB = nodeRadii[edge.to] || 6;
    const trimLen = fullLen - rA - rB;
    if (trimLen < 1.0) return;
    const angle  = Math.atan2(dx, dz);
    const midX   = from.x + dx * (rA + trimLen/2) / fullLen;
    const midZ   = from.y + dz * (rA + trimLen/2) / fullLen;
    const rw     = ROAD_W[edge.type] || ROAD_W.urban;
    const rMat   = roadMat[edge.type] || roadMat.urban;

    const group = new THREE.Group();

    const roadMesh = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.06, trimLen), rMat);
    roadMesh.position.y = 0.03;
    roadMesh.receiveShadow = true;
    group.add(roadMesh);

    for (const s of [-1, 1]) {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, trimLen), shoulderMat);
      sh.position.set(s * (rw/2 + 0.75), 0.01, 0);
      group.add(sh);
    }

    for (const s of [-1, 1]) {
      const el = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, trimLen), lineMat);
      el.position.set(s * rw/2, 0.07, 0);
      group.add(el);
    }

    const dashL = 3.0, gapL = 6.0, cycle = dashL + gapL;
    const nDash = Math.floor(trimLen / cycle);
    const cLineMat = edge.type === 'highway' ? yellowLineMat : lineMat;
    for (let i = 0; i < nDash; i++) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.011, dashL), cLineMat);
      d.position.set(0, 0.07, -trimLen/2 + i * cycle + dashL/2);
      group.add(d);
    }

    group.position.set(midX, 0, midZ);
    group.rotation.y = angle;
    scene.add(group);
  });

  // Intersections
  MAP.nodes.forEach(n => {
    const r = nodeRadii[n.id] || 5.5;
    const circle = new THREE.Mesh(new THREE.CircleGeometry(r, 28), intMat);
    circle.rotation.x = -Math.PI/2;
    circle.position.set(n.x, 0.025, n.y);
    scene.add(circle);
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.25, r, 36), ringMat);
    ring.rotation.x = -Math.PI/2;
    ring.position.set(n.x, 0.032, n.y);
    scene.add(ring);
  });

  // Guardrails (instanced) — 수백 개의 레일/기둥을 InstancedMesh 2개로 합쳐 그린다.
  // 단위 박스를 만들고 길이는 인스턴스 스케일(z)로 표현.
  const instDummy = new THREE.Object3D();
  const railMat3 = new THREE.MeshPhongMaterial({ color: 0x8899aa, shininess: 55 });
  const railUnitGeo = new THREE.BoxGeometry(0.1, 0.45, 1);
  const postUnitGeo = new THREE.BoxGeometry(0.1, 1.0, 0.1);
  const railXf: { x: number; z: number; angle: number; len: number }[] = [];
  const postXf: { x: number; z: number }[] = [];

  MAP.edges.forEach(edge => {
    const from = node(edge.from);
    const to   = node(edge.to);
    const dx = to.x - from.x;
    const dz = to.y - from.y;
    const fullLen = Math.sqrt(dx*dx + dz*dz);
    const rA = nodeRadii[edge.from] || 6;
    const rB = nodeRadii[edge.to] || 6;
    if (fullLen < rA + rB + 2) return;
    const angle  = Math.atan2(dx, dz);
    const trimLen = fullLen - rA - rB;
    const midX   = from.x + dx * (rA + trimLen/2) / fullLen;
    const midZ   = from.y + dz * (rA + trimLen/2) / fullLen;
    const rw     = ROAD_W[edge.type] || ROAD_W.urban;
    const perpX  = -dz / fullLen;
    const perpZ  =  dx / fullLen;

    for (const s of [-1, 1]) {
      const offset = rw/2 + 1.8;
      const rx = midX + perpX * s * offset;
      const rz = midZ + perpZ * s * offset;
      railXf.push({ x: rx, z: rz, angle, len: trimLen * 0.94 });
      for (let d = -trimLen/2 + 4; d < trimLen/2 - 2; d += 8) {
        const px = midX + dx * (d / fullLen) + perpX * s * offset;
        const pz = midZ + dz * (d / fullLen) + perpZ * s * offset;
        postXf.push({ x: px, z: pz });
      }
    }
  });

  const railMesh = new THREE.InstancedMesh(railUnitGeo, railMat3, railXf.length);
  railXf.forEach((r, i) => {
    instDummy.position.set(r.x, 0.52, r.z);
    instDummy.rotation.set(0, r.angle, 0);
    instDummy.scale.set(1, 1, r.len);
    instDummy.updateMatrix();
    railMesh.setMatrixAt(i, instDummy.matrix);
  });
  railMesh.instanceMatrix.needsUpdate = true;
  scene.add(railMesh);

  const postMesh = new THREE.InstancedMesh(postUnitGeo, railMat3, postXf.length);
  postXf.forEach((p, i) => {
    instDummy.position.set(p.x, 0.5, p.z);
    instDummy.rotation.set(0, 0, 0);
    instDummy.scale.set(1, 1, 1);
    instDummy.updateMatrix();
    postMesh.setMatrixAt(i, instDummy.matrix);
  });
  postMesh.instanceMatrix.needsUpdate = true;
  scene.add(postMesh);

  // Vehicle mesh factory — 공유 지오메트리/머티리얼 재사용. 호출 시 scene 에 추가.
  function createCarMesh(bodyColor: number = 0x2255cc) {
    const car = new THREE.Group();
    const bodyMat = bodyMaterial(bodyColor);

    const body = new THREE.Mesh(CAR_GEO.body, bodyMat);
    body.position.y = 0.8; body.castShadow = true; car.add(body);

    const cabin = new THREE.Mesh(CAR_GEO.cabin, bodyMat);
    cabin.position.set(0, 1.35, -0.15); car.add(cabin);

    const windshield = new THREE.Mesh(CAR_GEO.glass, CAR_MAT.glass);
    windshield.position.set(0, 1.35, 0.92); car.add(windshield);

    const rearGlass = new THREE.Mesh(CAR_GEO.glass, CAR_MAT.glass);
    rearGlass.position.set(0, 1.35, -1.22); car.add(rearGlass);

    for (const [wx, wz] of [[-1.05,1.55], [1.05,1.55], [-1.05,-1.55], [1.05,-1.55]]) {
      const wheel = new THREE.Mesh(CAR_GEO.wheel, CAR_MAT.dark);
      wheel.rotation.z = Math.PI/2;
      wheel.position.set(wx, 0.35, wz);
      car.add(wheel);
    }
    scene.add(car);
    return car;
  }

  // Traffic vehicles
  function makeTrafficVehicle(color: number, type: string) {
    const grp = new THREE.Group();
    const bodyMat = new THREE.MeshPhongMaterial({ color, shininess: 70 });
    const darkMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
    if (type === 'truck') {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.3, 2.8), bodyMat);
      cab.position.set(0, 1.15, -1.5); grp.add(cab);
      const trailer = new THREE.Mesh(new THREE.BoxGeometry(2.35, 2.7, 8.2), bodyMat);
      trailer.position.set(0, 1.35, 2.7); grp.add(trailer);
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 4.4), bodyMat);
      body.position.y = 0.65; grp.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 2.2), bodyMat);
      cabin.position.set(0, 1.5, -0.2); grp.add(cabin);
    }
    const wGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.22, 8);
    const wheelPos = type === 'truck'
      ? [[-1.2,-2.3],[1.2,-2.3],[-1.2,0.8],[1.2,0.8],[-1.2,4.0],[1.2,4.0],[-1.2,5.6],[1.2,5.6]]
      : [[-1.05,1.5],[1.05,1.5],[-1.05,-1.5],[1.05,-1.5]];
    wheelPos.forEach(([wx, wz]) => {
      const w = new THREE.Mesh(wGeo, darkMat);
      w.rotation.z = Math.PI/2;
      w.position.set(wx, 0.35, wz);
      grp.add(w);
    });
    return grp;
  }

  const placements = [
    { ei:0,  t:0.35, lat: 0,              color:0x1a5a80, type:'car'   },
    { ei:1,  t:0.55, lat: ROAD_W.urban/3,    color:0x224466, type:'car'   },
    { ei:5,  t:0.42, lat:-ROAD_W.arterial/3, color:0xbb3322, type:'truck' },
    { ei:3,  t:0.68, lat: 0,                 color:0x183050, type:'car'   },
    { ei:12, t:0.25, lat: ROAD_W.highway/3,   color:0x224455, type:'car'   },
    { ei:6,  t:0.52, lat:-ROAD_W.arterial/3,  color:0x334466, type:'car'   },
    { ei:9,  t:0.38, lat: 0,                  color:0x552211, type:'truck' },
    { ei:14, t:0.58, lat:-ROAD_W.highway/3,   color:0x1a3040, type:'car'   },
    { ei:2,  t:0.72, lat: ROAD_W.urban/3,     color:0x2a4050, type:'car'   },
    { ei:7,  t:0.30, lat:-ROAD_W.urban/3,     color:0x304050, type:'car'   },
  ];
  placements.forEach(p => {
    const edge = MAP.edges[p.ei];
    if (!edge) return;
    const from = node(edge.from), to = node(edge.to);
    const dx = to.x - from.x, dz = to.y - from.y;
    const length = Math.sqrt(dx*dx + dz*dz);
    const angle  = Math.atan2(dx, dz);
    const perpX  = -dz / length, perpZ = dx / length;
    const cx = from.x + dx * p.t;
    const cz = from.y + dz * p.t;
    const v = makeTrafficVehicle(p.color, p.type);
    v.position.set(cx + perpX * p.lat, 0, cz + perpZ * p.lat);
    v.rotation.y = angle;
    scene.add(v);
  });

  // Trees (instanced) — 줄기/잎을 각각 InstancedMesh 1개로. 크기는 인스턴스 스케일.
  const trunkMat   = new THREE.MeshLambertMaterial({ color: 0x5c3a18 });
  const foliageMat = new THREE.MeshLambertMaterial({ color: 0x3a6428 });
  const trunkGeo   = new THREE.CylinderGeometry(0.18, 0.28, 2.4, 5);
  const foliageGeo = new THREE.ConeGeometry(1.5, 4.2, 6);
  const treeXf: { x: number; z: number; sc: number }[] = [];
  MAP.edges.forEach(edge => {
    const from = node(edge.from), to = node(edge.to);
    const dx = to.x - from.x, dz = to.y - from.y;
    const fullLen = Math.sqrt(dx*dx + dz*dz);
    const rA = nodeRadii[edge.from] || 6;
    const rB = nodeRadii[edge.to] || 6;
    if (fullLen < rA + rB + 6) return;
    const perpX  = -dz / fullLen;
    const perpZ  =  dx / fullLen;
    const rw     = ROAD_W[edge.type] || ROAD_W.urban;
    for (let dist = rA + 4; dist < fullLen - rB - 4; dist += 14 + Math.random() * 14) {
      const t = dist / fullLen;
      const cx = from.x + dx * t;
      const cz = from.y + dz * t;
      for (const s of [-1, 1]) {
        if (Math.random() > 0.6) continue;
        const offset = rw/2 + 7 + Math.random() * 8;
        treeXf.push({
          x: cx + perpX * s * offset,
          z: cz + perpZ * s * offset,
          sc: 0.7 + Math.random() * 0.6,
        });
      }
    }
  });

  const trunkMesh   = new THREE.InstancedMesh(trunkGeo, trunkMat, treeXf.length);
  const foliageMesh = new THREE.InstancedMesh(foliageGeo, foliageMat, treeXf.length);
  treeXf.forEach((tr, i) => {
    instDummy.rotation.set(0, 0, 0);
    instDummy.scale.set(tr.sc, tr.sc, tr.sc);
    instDummy.position.set(tr.x, 1.2 * tr.sc, tr.z);
    instDummy.updateMatrix();
    trunkMesh.setMatrixAt(i, instDummy.matrix);
    instDummy.position.set(tr.x, 4.3 * tr.sc, tr.z);
    instDummy.updateMatrix();
    foliageMesh.setMatrixAt(i, instDummy.matrix);
  });
  trunkMesh.instanceMatrix.needsUpdate = true;
  foliageMesh.instanceMatrix.needsUpdate = true;
  scene.add(trunkMesh, foliageMesh);

  // Buildings (instanced) — 단위 박스 1개 지오메트리 + 인스턴스별 스케일/색상.
  const bldColors = [0x8899aa, 0x99aabb, 0x778899, 0xaabbcc, 0x667788, 0x8899aa, 0x9aabbb];
  const bldUnitGeo = new THREE.BoxGeometry(1, 1, 1);
  const bldMat = new THREE.MeshPhongMaterial(); // 흰색 기본 × instanceColor = 최종 색
  const bldXf: { x: number; z: number; bw: number; bh: number; bd: number; color: number }[] = [];
  MAP.edges.filter(e => e.type === 'urban' || e.type === 'arterial').forEach(edge => {
    const from = node(edge.from), to = node(edge.to);
    const dx = to.x - from.x, dz = to.y - from.y;
    const fullLen = Math.sqrt(dx*dx + dz*dz);
    const rA = nodeRadii[edge.from] || 6;
    const rB = nodeRadii[edge.to] || 6;
    if (fullLen < rA + rB + 12) return;
    const perpX  = -dz / fullLen;
    const perpZ  =  dx / fullLen;
    const rw     = ROAD_W[edge.type] || ROAD_W.urban;
    for (let dist = rA + 6; dist < fullLen - rB - 6; dist += 25 + Math.random() * 30) {
      const t = dist / fullLen;
      const cx = from.x + dx * t;
      const cz = from.y + dz * t;
      for (const s of [-1, 1]) {
        if (Math.random() > 0.45) continue;
        const offset = rw/2 + 6 + Math.random() * 9;
        bldXf.push({
          x: cx + perpX * s * offset,
          z: cz + perpZ * s * offset,
          bw: 3 + Math.random() * 5,
          bh: 4 + Math.random() * 20,
          bd: 3 + Math.random() * 5,
          color: bldColors[Math.floor(Math.random() * bldColors.length)],
        });
      }
    }
  });

  const bldMesh = new THREE.InstancedMesh(bldUnitGeo, bldMat, bldXf.length);
  const bldColor = new THREE.Color();
  bldXf.forEach((b, i) => {
    instDummy.rotation.set(0, 0, 0);
    instDummy.position.set(b.x, b.bh / 2, b.z);
    instDummy.scale.set(b.bw, b.bh, b.bd);
    instDummy.updateMatrix();
    bldMesh.setMatrixAt(i, instDummy.matrix);
    bldMesh.setColorAt(i, bldColor.setHex(b.color));
  });
  bldMesh.instanceMatrix.needsUpdate = true;
  if (bldMesh.instanceColor) bldMesh.instanceColor.needsUpdate = true;
  bldMesh.castShadow = true;
  scene.add(bldMesh);

  // Mountains
  const mountainMat = new THREE.MeshLambertMaterial({ color: 0x6e7e8a });
  [
    [-60,40,28,22],[-30,20,32,26],[10,60,26,20],[60,10,30,24],[100,50,24,20],
    [150,80,18,15],[200,30,22,18],[300,60,20,16],[400,10,28,22],[500,70,25,20],
    [600,20,22,18],[700,50,18,14],[750,90,20,16],[50,400,24,20],[700,400,22,18]
  ].forEach(([x,z,h,w]) => {
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(w as number, h as number, 4), mountainMat);
    mtn.position.set(x as number, (h as number)/2-2, z as number);
    scene.add(mtn);
  });

  // Resize handler
  const onResize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  const dispose = () => {
    window.removeEventListener('resize', onResize);
    renderer.dispose();
    scene.clear();
  };

  return { scene, camera, renderer, createCarMesh, dispose };
}

export function updateCarAndCamera(
  camera: THREE.PerspectiveCamera,
  carMesh: THREE.Group,
  x: number, y: number, angle: number
) {
  carMesh.position.set(x, 0, y);
  carMesh.rotation.y = Math.PI/2 - angle;

  const camDist = 11;
  const camH    = 5.5;
  const lookAhead = 22;
  camera.position.set(
    x - Math.cos(angle) * camDist,
    camH,
    y - Math.sin(angle) * camDist
  );
  camera.lookAt(
    x + Math.cos(angle) * lookAhead,
    1.1,
    y + Math.sin(angle) * lookAhead
  );
}
