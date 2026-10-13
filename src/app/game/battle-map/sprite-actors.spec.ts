import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  ActorSheet,
  SPRITE_SCALE,
  SpriteActor,
  cameraYawAround,
  facingIndex,
} from './sprite-actors';

const SHEET: ActorSheet = {
  file: 'heroes/test.png',
  cell: [40, 50],
  anchor: [20, 44],
  directions: 8,
  animations: {
    idle: { row: 0, frames: 4 },
    attack: { row: 8, frames: 8, duration: 0.5, impact: 3 },
  },
};

function actor(sheet = SHEET): SpriteActor {
  const texture = new THREE.Texture();
  texture.image = { width: 8 * 40, height: 16 * 50 };
  return new SpriteActor(sheet, texture, 32);
}

/** The frame (column, row from the top) the actor's material currently shows. */
function frameOf(a: SpriteActor): [number, number] {
  const mesh = a.root.getObjectByName('sprite') as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.ShaderMaterial
  >;
  const frame = mesh.material.uniforms['frame'].value as THREE.Vector4;
  return [Math.round(frame.x * 8), Math.round((1 - frame.y) * 16 - 1)];
}

describe('sprite actors', () => {
  it('picks the facing relative to where the camera stands', () => {
    expect(facingIndex(0, 0, 8)).toBe(0);
    expect(facingIndex(Math.PI / 4, 0, 8)).toBe(1);
    expect(facingIndex(Math.PI, 0, 8)).toBe(4);
    expect(facingIndex(-Math.PI / 4, 0, 8)).toBe(7);
    // Orbiting the camera a quarter turn changes which side of the piece we see
    expect(facingIndex(0, Math.PI / 2, 8)).toBe(6);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(5, 3, 0);
    expect(cameraYawAround(camera, new THREE.Vector3())).toBeCloseTo(Math.PI / 2);
  });

  it('stands on its feet: the anchor pixel sits at the origin', () => {
    const mesh = actor().root.getObjectByName('sprite') as THREE.Mesh;
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    const unit = SPRITE_SCALE / 32;
    expect(box.min.y).toBeCloseTo(-(50 - 44) * unit);
    expect(box.max.y).toBeCloseTo(44 * unit);
    expect(box.min.x).toBeCloseTo(-20 * unit);
  });

  it('plays an attack in the facing it is turned to, then settles back to idle', () => {
    const a = actor();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);
    const holder = new THREE.Group();
    holder.add(a.root);
    holder.rotation.y = Math.PI / 4; // facing index 1
    a.update(2);
    a.attack();
    a.update(0.2);
    a.faceCamera(camera);
    expect(frameOf(a)).toEqual([3, 9]);
    a.update(0.4);
    a.faceCamera(camera);
    expect(frameOf(a)[1]).toBe(1);
  });

  it('speeds the swing up to fit rapid fire', () => {
    const a = actor();
    a.update(1);
    a.attack();
    a.update(0.2);
    a.attack();
    a.update(0.1);
    // At the normal rate the second swing would only be at frame 1
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 10);
    const holder = new THREE.Group();
    holder.add(a.root);
    a.faceCamera(camera);
    expect(frameOf(a)).toEqual([4, 8]);
  });

  it('steps through the walk cycle by distance travelled', () => {
    const a = actor({
      ...SHEET,
      animations: { walk: { row: 0, frames: 8 } },
    });
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 10);
    const holder = new THREE.Group();
    holder.add(a.root);
    expect(a.has('walk')).toBe(true);
    a.stride(Math.PI);
    a.faceCamera(camera);
    expect(frameOf(a)).toEqual([4, 0]);
    a.stride(Math.PI * 2 + 0.1);
    a.faceCamera(camera);
    expect(frameOf(a)).toEqual([0, 0]);
  });
});
