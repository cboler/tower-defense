import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Raster, rgb } from './pixel-terrain';
import { paintRock } from './pixel-props';
import {
  PROP_PIXEL,
  SCENERY_THEMES,
  ScenerySprite,
  blocksBoard,
  islandCliffGeometry,
  layoutRimProps,
  spriteTexture,
} from './pixel-scenery';

describe('pixel scenery', () => {
  it('uploads sprite paintings top row first, like a loaded image', () => {
    const raster = new Raster(2, 2);
    raster.set(0, 0, rgb(0xff0000));
    raster.set(0, 1, rgb(0x0000ff));
    const data = spriteTexture(raster).image.data as Uint8Array;
    // The texture's first row is the painting's bottom row
    expect([...data.slice(0, 3)]).toEqual([0, 0, 255]);
    expect([...data.slice(8, 11)]).toEqual([255, 0, 0]);
  });

  it('stands a prop on its anchor at the characters’ pixel size', () => {
    const art = paintRock(1);
    const sprite = new ScenerySprite(art, spriteTexture(art.raster));
    const mesh = sprite.root.children[0] as THREE.Mesh;
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    expect(box.max.y - box.min.y).toBeCloseTo(art.cell[1] * PROP_PIXEL);
    expect(box.max.y).toBeCloseTo(art.anchor[1] * PROP_PIXEL);
    expect(box.min.y).toBeCloseTo((art.anchor[1] - art.cell[1]) * PROP_PIXEL);
  });

  it('faces the camera, leaning back no further than an upright-ish pose from overhead', () => {
    const art = paintRock(2);
    const sprite = new ScenerySprite(art, spriteTexture(art.raster));
    new THREE.Group().add(sprite.root);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 20, 0.01);
    camera.lookAt(0, 0, 0);
    sprite.faceCamera(camera, 0);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(sprite.root.children[0].quaternion);
    // Leans back 60 degrees: its face points up and toward the camera's side
    expect(normal.y).toBeCloseTo(Math.sin(THREE.MathUtils.degToRad(60)));
    expect(normal.z).toBeGreaterThan(0.4);
  });

  it('puts every rim prop on the rim, tall ones on most rim tiles', () => {
    const props = layoutRimProps(14, 9, 1, SCENERY_THEMES['verdant-crossroads']);
    expect(props.length).toBeGreaterThan(40);
    for (const prop of props) {
      const onRim = Math.abs(prop.x) > 7 - 0.05 || Math.abs(prop.z) > 4.5 - 0.05;
      expect(onRim).toBe(true);
      expect(Math.abs(prop.x)).toBeLessThan(8);
      expect(Math.abs(prop.z)).toBeLessThan(5.5);
    }
    expect(props.filter((p) => p.tall).length).toBeGreaterThan(30);
    expect(layoutRimProps(14, 9, 1, SCENERY_THEMES['sunken-sanctum'])).not.toEqual(props);
  });

  it('hides tall props only where they would stand in front of the board', () => {
    // Camera to the south (+z): the south rim blocks, the north rim doesn't
    expect(blocksBoard(0, 5, 0, 1, 7, 4.5)).toBe(true);
    expect(blocksBoard(0, -5, 0, 1, 7, 4.5)).toBe(false);
    // Side rims stay, unless a crown would reach over the board
    expect(blocksBoard(-7.7, 0, 0, 1, 7, 4.5)).toBe(false);
    expect(blocksBoard(-7.2, 0, 0, 1, 7, 4.5)).toBe(true);
    // From the south-west corner, the west rim blocks too
    expect(blocksBoard(-7.5, 0, -1, 1, 7, 4.5)).toBe(true);
  });

  it('hangs a closed cliff from the rim outline, facing outward, down to a keel', () => {
    const geometry = islandCliffGeometry(8, 5.5, -0.15);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.max.y).toBeCloseTo(-0.15);
    expect(box.min.y).toBeLessThan(-5);
    expect(box.max.x).toBeLessThanOrEqual(8.0001);
    expect(box.min.z).toBeGreaterThanOrEqual(-5.5001);
    // Faces point away from the island's centre
    const position = geometry.attributes['position'];
    const index = geometry.index!;
    let outward = 0;
    for (let t = 0; t < index.count; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) =>
        new THREE.Vector3().fromBufferAttribute(position, index.getX(t + k)),
      );
      const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
      const centre = a.clone().add(b).add(c).divideScalar(3);
      if (normal.x * centre.x + normal.z * centre.z > 0) outward++;
    }
    expect(outward / (index.count / 3)).toBeGreaterThan(0.95);
  });
});
