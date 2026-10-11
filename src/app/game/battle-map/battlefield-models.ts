import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TOWER_CLASSES, TowerClassId } from '../../core/models/tower.model';
import { MobTypeId } from '../../core/models/mob.model';

// Small, faceted miniatures: geometry stays readable at the tactical camera distance.
function material(color: THREE.ColorRepresentation, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness, flatShading: true });
}

function part(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function joint(parent: THREE.Object3D, name: string, x: number, y: number, z: number): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, y, z);
  parent.add(group);
  return group;
}

function eyes(parent: THREE.Object3D, y: number, z: number, color = 0x162239): void {
  const mat = material(color);
  for (const x of [-0.065, 0.065]) {
    part(parent, new THREE.BoxGeometry(0.038, 0.045, 0.025), mat, x, y, z);
  }
}

/** Batch fixed pieces within each joint; articulated parts retain their own pivots. */
function batchModel(root: THREE.Group): THREE.Group {
  const groups: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Group) groups.push(object);
  });
  for (const group of groups) {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of group.children) {
      if (!(child instanceof THREE.Mesh) || child.name || Array.isArray(child.material)) continue;
      const list = batches.get(child.material) ?? [];
      list.push(child);
      batches.set(child.material, list);
    }
    for (const [mat, meshes] of batches) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map((mesh) => {
        mesh.updateMatrix();
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        return geometry.applyMatrix4(mesh.matrix);
      });
      const geometry = mergeGeometries(geometries);
      geometries.forEach((item) => item.dispose());
      if (!geometry) continue;
      for (const mesh of meshes) {
        group.remove(mesh);
        mesh.geometry.dispose();
      }
      part(group, geometry, mat, 0, 0, 0);
    }
  }
  return root;
}

/** All heroes share a humanoid rig, but carry their own class equipment and headwear. */
export function createHeroModel(id: TowerClassId): THREE.Group {
  const root = new THREE.Group();
  const color = TOWER_CLASSES[id].color;
  const cloth = material(color);
  const dark = material(0x243044);
  const gold = material(0xe8bd6b, 0.65);
  const steel = material(0xb6d5df, 0.75);
  const skin = material(0xe6b58e);
  const leather = material(0x493431);
  const magic = material(color, 0.3);
  magic.emissive.set(color);
  magic.emissiveIntensity = 1.2;
  const caster = ['elementalist', 'chronomancer', 'oracle', 'red-mage', 'astrologian'].includes(id);
  const heavy = ['blade-warden', 'paladin', 'juggernaut', 'samurai'].includes(id);

  for (const side of [-1, 1]) {
    const leg = joint(root, side < 0 ? 'leg-left' : 'leg-right', side * 0.105, 0.38, 0);
    part(leg, new THREE.CylinderGeometry(0.065, 0.07, 0.22, 6), dark, 0, -0.1, 0);
    part(leg, new THREE.BoxGeometry(0.14, 0.12, 0.21), heavy ? steel : leather, 0, -0.23, 0.035);
  }
  const torso = joint(root, 'torso', 0, 0.47, 0);
  part(torso, new THREE.CylinderGeometry(0.18, 0.15, 0.3, 8), heavy ? steel : cloth, 0, 0.05, 0);
  part(torso, new THREE.CylinderGeometry(0.165, 0.18, 0.06, 8), leather, 0, -0.09, 0);
  part(torso, new THREE.BoxGeometry(0.07, 0.06, 0.025), gold, 0, -0.085, 0.18);
  part(torso, new THREE.BoxGeometry(0.14, 0.24, 0.03), cloth, 0, 0.02, 0.165);
  part(torso, new THREE.OctahedronGeometry(0.04), gold, 0, 0.09, 0.195);
  if (caster) {
    part(root, new THREE.CylinderGeometry(0.15, 0.26, 0.35, 8), cloth, 0, 0.26, 0);
    part(root, new THREE.CylinderGeometry(0.255, 0.27, 0.035, 8), gold, 0, 0.1, 0);
  }
  const cape = joint(torso, 'cape', 0, 0.17, -0.13);
  const capeMesh = part(
    cape,
    new THREE.CylinderGeometry(0.15, 0.25, 0.46, 8, 1, true, Math.PI / 2, Math.PI),
    cloth,
    0,
    -0.22,
    0,
  );
  capeMesh.material = cloth.clone();
  capeMesh.material.side = THREE.DoubleSide;
  cape.rotation.x = 0.16;

  const head = joint(torso, 'head', 0, 0.37, 0);
  part(head, new THREE.SphereGeometry(0.18, 10, 8), skin, 0, 0, 0);
  eyes(head, 0.015, 0.165);
  if (heavy) {
    part(
      head,
      new THREE.SphereGeometry(0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.52),
      id === 'samurai' ? dark : steel,
      0,
      0.025,
      0,
    );
    for (const side of [-1, 1]) {
      part(head, new THREE.BoxGeometry(0.055, 0.14, 0.16), steel, side * 0.16, -0.04, 0);
    }
    part(head, new THREE.BoxGeometry(0.055, 0.15, 0.26), cloth, 0, 0.2, -0.025);
  } else if (caster) {
    if (id === 'oracle' || id === 'astrologian') {
      const halo = part(head, new THREE.TorusGeometry(0.23, 0.018, 5, 24), gold, 0, 0.14, -0.06);
      halo.name = 'halo';
      part(head, new THREE.OctahedronGeometry(0.065), magic, 0, 0.24, 0);
    } else {
      part(head, new THREE.CylinderGeometry(0.29, 0.29, 0.045, 10), cloth, 0, 0.12, 0);
      const hat = part(head, new THREE.ConeGeometry(0.19, 0.36, 8), cloth, 0.03, 0.29, 0);
      hat.rotation.z = -0.16;
      part(head, new THREE.CylinderGeometry(0.185, 0.2, 0.045, 8), gold, 0, 0.16, 0);
    }
  } else {
    part(
      head,
      new THREE.SphereGeometry(0.185, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
      cloth,
      0,
      0.025,
      -0.01,
    );
    if (id === 'ninja' || id === 'rogue') {
      part(head, new THREE.BoxGeometry(0.28, 0.1, 0.09), dark, 0, -0.06, 0.14);
    } else {
      const feather = part(head, new THREE.ConeGeometry(0.05, 0.3, 5), gold, -0.15, 0.21, 0);
      feather.rotation.z = 0.4;
    }
  }

  const left = joint(torso, 'arm-left', -0.24, 0.14, 0);
  const right = joint(torso, 'arm-right', 0.24, 0.14, 0);
  for (const arm of [left, right]) {
    part(
      arm,
      new THREE.SphereGeometry(heavy ? 0.125 : 0.085, 8, 6),
      heavy ? steel : cloth,
      0,
      0,
      0,
    );
    part(arm, new THREE.CylinderGeometry(0.065, 0.06, 0.24, 6), cloth, 0, -0.12, 0);
    part(arm, new THREE.SphereGeometry(0.075, 8, 6), heavy ? steel : skin, 0, -0.25, 0.03);
  }
  const weapon = joint(right, 'weapon', 0, -0.23, 0.06);
  if (caster) {
    part(weapon, new THREE.CylinderGeometry(0.022, 0.027, 0.8, 6), gold, 0, 0.24, 0);
    const orb = part(weapon, new THREE.OctahedronGeometry(0.12), magic, 0, 0.69, 0);
    orb.name = 'focus';
    const ring = part(weapon, new THREE.TorusGeometry(0.16, 0.018, 5, 16), gold, 0, 0.69, 0);
    ring.rotation.y = Math.PI / 4;
    if (id === 'chronomancer' || id === 'astrologian') {
      const second = ring.clone();
      second.rotation.x = Math.PI / 2;
      weapon.add(second);
    }
  } else if (id === 'ranger') {
    const bow = part(
      weapon,
      new THREE.TorusGeometry(0.29, 0.026, 5, 16, Math.PI),
      gold,
      0,
      0.13,
      0.05,
    );
    bow.rotation.z = -Math.PI / 2;
    part(weapon, new THREE.CylinderGeometry(0.006, 0.006, 0.58, 4), steel, 0, 0.13, 0.05);
    part(torso, new THREE.CylinderGeometry(0.08, 0.07, 0.35, 6), leather, 0.15, 0.12, -0.2);
    for (let i = 0; i < 3; i++)
      part(
        torso,
        new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4),
        gold,
        0.11 + i * 0.04,
        0.35,
        -0.2,
      );
    left.rotation.x = -0.65;
  } else if (id === 'juggernaut') {
    part(weapon, new THREE.CylinderGeometry(0.035, 0.035, 0.65, 6), leather, 0, 0.22, 0);
    part(weapon, new THREE.BoxGeometry(0.38, 0.22, 0.23), steel, 0, 0.56, 0);
    part(weapon, new THREE.BoxGeometry(0.08, 0.24, 0.25), gold, 0, 0.56, 0);
  } else {
    const spear = id === 'lancer';
    const bladeLength = spear ? 0.32 : id === 'rogue' || id === 'ninja' ? 0.28 : 0.5;
    part(
      weapon,
      new THREE.CylinderGeometry(0.025, 0.025, spear ? 0.9 : 0.17, 6),
      leather,
      0,
      spear ? 0.22 : 0,
      0,
    );
    const blade = part(
      weapon,
      new THREE.OctahedronGeometry(1),
      steel,
      0,
      spear ? 0.82 : bladeLength / 2 + 0.1,
      0,
    );
    blade.scale.set(0.065, bladeLength / 2, 0.025);
    if (!spear) part(weapon, new THREE.BoxGeometry(0.22, 0.035, 0.065), gold, 0, 0.09, 0);
    if (id === 'blade-warden' || id === 'paladin') {
      const shield = part(
        left,
        new THREE.CylinderGeometry(0.2, 0.2, 0.055, 6),
        gold,
        0,
        -0.17,
        0.15,
      );
      shield.rotation.x = Math.PI / 2;
      part(left, new THREE.OctahedronGeometry(0.14), cloth, 0, -0.17, 0.2).scale.z = 0.35;
    }
  }
  root.rotation.y = 0.35;
  return batchModel(root);
}

export function createMonsterModel(id: MobTypeId): THREE.Group {
  const root = new THREE.Group();
  const bone = material(0xdcd4b3);
  const dark = material(0x253341);
  const glow = material(id === 'pyre-core' ? 0xffa524 : 0x80ebd5);
  glow.emissive.copy(glow.color);
  glow.emissiveIntensity = 1.1;
  if (id === 'prismatic-ooze' || id === 'pyre-core' || id === 'dread-gaze') {
    const shell = material(
      id === 'prismatic-ooze' ? 0x528cdd : id === 'pyre-core' ? 0x702c25 : 0x7950b5,
      0.3,
    );
    if (id === 'prismatic-ooze') {
      shell.transparent = true;
      shell.opacity = 0.78;
      part(root, new THREE.SphereGeometry(0.36, 12, 8), glow, 0, 0.24, 0).scale.set(0.6, 0.7, 0.6);
      part(root, new THREE.SphereGeometry(0.42, 12, 8), shell, 0, 0.23, 0).scale.y = 0.7;
      for (let i = 0; i < 5; i++) {
        const a = i * 2.4;
        part(
          root,
          new THREE.OctahedronGeometry(0.09),
          glow,
          Math.cos(a) * 0.24,
          0.38,
          Math.sin(a) * 0.24,
        );
      }
      eyes(root, 0.3, 0.35);
    } else if (id === 'pyre-core') {
      part(root, new THREE.IcosahedronGeometry(0.25, 1), glow, 0, 0.43, 0);
      const shards = joint(root, 'orbit', 0, 0.43, 0);
      for (let i = 0; i < 7; i++) {
        const a = (i * Math.PI * 2) / 7;
        const shard = part(
          shards,
          new THREE.DodecahedronGeometry(0.15),
          shell,
          Math.cos(a) * 0.28,
          Math.sin(a * 2) * 0.15,
          Math.sin(a) * 0.28,
        );
        shard.scale.set(0.75, 1.3, 0.8);
      }
      for (let i = 0; i < 3; i++)
        part(root, new THREE.ConeGeometry(0.085, 0.4, 5), glow, (i - 1) * 0.14, 0.72, 0);
    } else {
      part(root, new THREE.SphereGeometry(0.3, 12, 8), shell, 0, 0.36, 0);
      part(root, new THREE.SphereGeometry(0.19, 12, 8), bone, 0, 0.38, 0.22);
      part(root, new THREE.SphereGeometry(0.1, 10, 8), glow, 0, 0.38, 0.38);
      part(root, new THREE.SphereGeometry(0.048, 8, 6), dark, 0, 0.38, 0.46);
      addWings(root, shell, 0.3, 0.46, 0.7);
      for (let i = 0; i < 4; i++) {
        const tendril = part(
          root,
          new THREE.ConeGeometry(0.045, 0.27, 5),
          shell,
          (i - 1.5) * 0.12,
          0.04,
          0,
        );
        tendril.rotation.z = Math.PI + (i - 1.5) * 0.25;
      }
    }
  } else if (id === 'swiftbeak' || id === 'sky-sovereign') {
    const dragon = id === 'sky-sovereign';
    const scales = material(dragon ? 0x6957a9 : 0x238ca7, 0.25);
    const trim = material(dragon ? 0xe4b564 : 0xf1cc77, 0.3);
    part(root, new THREE.SphereGeometry(0.25, 10, 8), scales, 0, 0.42, 0).scale.set(1, 1.1, 1.45);
    part(root, new THREE.SphereGeometry(0.19, 10, 8), scales, 0, 0.68, 0.23);
    const beak = part(root, new THREE.ConeGeometry(0.1, 0.28, 5), trim, 0, 0.65, 0.43);
    beak.rotation.x = Math.PI / 2;
    eyes(root, 0.72, 0.38);
    for (let i = 0; i < 3; i++)
      part(root, new THREE.ConeGeometry(0.06, 0.2, 5), trim, 0, 0.88 - i * 0.04, 0.16 - i * 0.12);
    const tail = joint(root, 'tail', 0, 0.42, -0.25);
    part(
      tail,
      new THREE.ConeGeometry(0.14, dragon ? 0.65 : 0.4, 6),
      scales,
      0,
      0,
      -0.18,
    ).rotation.x = -Math.PI / 2;
    addWings(root, scales, 0.2, 0.54, dragon ? 1 : 0.4);
    for (const side of [-1, 1]) {
      const leg = joint(root, side < 0 ? 'leg-left' : 'leg-right', side * 0.14, 0.3, 0);
      part(leg, new THREE.CylinderGeometry(0.035, 0.04, 0.23, 5), trim, 0, -0.1, 0);
      part(leg, new THREE.BoxGeometry(0.13, 0.055, 0.22), trim, 0, -0.23, 0.04);
    }
  } else {
    const golem = id === 'bramble-golem';
    const skeleton = id === 'bonewalker';
    const body = material(golem ? 0x58683f : skeleton ? 0xdcd4b3 : 0x62a889);
    const armor = material(golem ? 0x344c38 : 0x534656);
    const torso = joint(root, 'torso', 0, 0.43, 0);
    part(torso, new THREE.DodecahedronGeometry(golem ? 0.32 : 0.21), body, 0, 0.03, 0).scale.y =
      1.15;
    part(torso, new THREE.SphereGeometry(golem ? 0.19 : 0.2, 8, 6), body, 0, 0.36, 0.02);
    eyes(torso, 0.39, 0.2, golem ? 0xb5ff6d : 0x222031);
    if (skeleton) {
      for (let i = 0; i < 3; i++)
        part(torso, new THREE.BoxGeometry(0.28, 0.025, 0.035), armor, 0, 0.11 - i * 0.08, 0.17);
      part(torso, new THREE.BoxGeometry(0.12, 0.035, 0.04), dark, 0, 0.28, 0.19);
    } else {
      part(torso, new THREE.BoxGeometry(0.31, 0.085, 0.34), armor, 0, -0.12, 0);
      part(
        torso,
        new THREE.OctahedronGeometry(golem ? 0.12 : 0.065),
        glow,
        0,
        0.08,
        golem ? 0.29 : 0.19,
      );
    }
    for (const side of [-1, 1]) {
      const arm = joint(
        torso,
        side < 0 ? 'arm-left' : 'arm-right',
        side * (golem ? 0.36 : 0.24),
        0.14,
        0,
      );
      part(arm, new THREE.DodecahedronGeometry(golem ? 0.17 : 0.08), armor, 0, 0, 0);
      part(
        arm,
        new THREE.CylinderGeometry(golem ? 0.11 : 0.045, golem ? 0.14 : 0.06, 0.3, 6),
        body,
        0,
        -0.18,
        0,
      );
      part(arm, new THREE.DodecahedronGeometry(golem ? 0.16 : 0.085), body, 0, -0.34, 0.03);
      const leg = joint(root, side < 0 ? 'leg-left' : 'leg-right', side * 0.12, 0.28, 0);
      part(
        leg,
        new THREE.CylinderGeometry(golem ? 0.11 : 0.05, golem ? 0.12 : 0.06, 0.24, 6),
        body,
        0,
        -0.1,
        0,
      );
      part(leg, new THREE.BoxGeometry(golem ? 0.23 : 0.14, 0.1, 0.21), armor, 0, -0.22, 0.04);
      if (!skeleton) {
        const horn = part(
          torso,
          new THREE.ConeGeometry(golem ? 0.085 : 0.09, golem ? 0.36 : 0.25, 5),
          golem ? body : bone,
          side * 0.2,
          0.53,
          0,
        );
        horn.rotation.z = -side * 0.7;
      }
    }
    if (golem) {
      for (let i = 0; i < 5; i++) {
        part(
          torso,
          new THREE.IcosahedronGeometry(0.13),
          material(0x75974f),
          Math.sin(i * 2) * 0.28,
          0.25,
          Math.cos(i * 2) * 0.23,
        );
      }
    }
  }
  return batchModel(root);
}

function addWings(
  root: THREE.Group,
  mat: THREE.Material,
  x: number,
  y: number,
  span: number,
): void {
  for (const side of [-1, 1]) {
    const wing = joint(root, side < 0 ? 'wing-left' : 'wing-right', side * x, y, 0);
    // Overlapping tapered feathers give a scalloped silhouette without a texture atlas.
    for (let i = 0; i < 4; i++) {
      const feather = part(
        wing,
        new THREE.ConeGeometry(0.11, span * (1 - i * 0.13), 4),
        mat,
        side * span * 0.36,
        0,
        -i * 0.085,
      );
      feather.rotation.z = -side * (Math.PI / 2 + i * 0.12);
      feather.scale.z = 0.35;
    }
  }
}

export function animateModel(root: THREE.Group, phase: number, stride: number, action = 0): void {
  const leftLeg = root.getObjectByName('leg-left');
  const rightLeg = root.getObjectByName('leg-right');
  if (leftLeg) leftLeg.rotation.x = Math.sin(phase) * stride;
  if (rightLeg) rightLeg.rotation.x = -Math.sin(phase) * stride;
  const rightArm = root.getObjectByName('arm-right');
  const leftArm = root.getObjectByName('arm-left');
  if (rightArm) rightArm.rotation.x = -action * 1.7 - Math.sin(phase) * stride * 0.6;
  if (leftArm) leftArm.rotation.x = -action * 0.7 + Math.sin(phase) * stride * 0.6;
  const cape = root.getObjectByName('cape');
  if (cape) cape.rotation.x = 0.16 + Math.sin(phase * 0.7) * 0.08 + action * 0.3;
  const tail = root.getObjectByName('tail');
  if (tail) tail.rotation.y = Math.sin(phase) * 0.25;
  for (const side of [-1, 1]) {
    const wing = root.getObjectByName(side < 0 ? 'wing-left' : 'wing-right');
    if (wing) wing.rotation.z = side * (0.2 + Math.sin(phase * 2) * 0.5);
  }
  const orbit = root.getObjectByName('orbit');
  if (orbit) orbit.rotation.y = phase * 0.4;
  const focus = root.getObjectByName('focus');
  if (focus) focus.rotation.y = phase;
}
