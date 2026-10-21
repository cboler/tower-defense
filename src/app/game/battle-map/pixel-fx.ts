import * as THREE from 'three';
import { RGB, Raster, dither, noise, rgb, scale } from './pixel-terrain';
import { PropArt, ballLight, outline, ramp, strip } from './pixel-props';

/*
 * HD-2D combat effects in pixel art: projectiles, slashes, explosions and light pillars painted
 * in code as frame strips (like the scenery in pixel-props.ts), and one shader for every ring,
 * drawn on the board's own pixel grid and faded by dithering rather than transparency.
 */

/** A colour as tones from shadow to white-hot, for tinting effects by their game colour. */
export function fxPalette(colour: string | number): RGB[] {
  const base = rgb(typeof colour === 'string' ? parseInt(colour.replace('#', ''), 16) : colour);
  const toward = (t: number): RGB => [
    base[0] + (255 - base[0]) * t,
    base[1] + (255 - base[1]) * t,
    base[2] + (255 - base[2]) * t,
  ];
  return [scale(base, 0.45), scale(base, 0.75), base, toward(0.5), toward(0.85)];
}

/** Paints a small sprite from rows of characters, each standing for a colour; `.` is empty. */
export function fromRows(rows: string[], colours: Record<string, number>, pad = 1): Raster {
  const width = Math.max(...rows.map((row) => row.length));
  const out = new Raster(width + pad * 2, rows.length + pad * 2);
  rows.forEach((row, y) => {
    [...row].forEach((key, x) => {
      const colour = colours[key];
      if (colour !== undefined) out.set(x + pad, y + pad, rgb(colour));
    });
  });
  return out;
}

/** An arrow in flight, pointing right (+x). Bard's song arrows are rose with a glowing head. */
export function paintArrow(song = false): PropArt {
  const art = fromRows(
    [
      'ff...............',
      '.ff.........l....',
      'wwhhhhhhhhhhLLLt.',
      '.ff.........d....',
      'ff...............',
    ],
    song
      ? {
          f: 0xff7ac0,
          w: 0xfff0f8,
          h: 0xfbcfe8,
          l: 0xffe0f2,
          L: 0xff9ad6,
          d: 0xd9468f,
          t: 0xffffff,
        }
      : {
          f: 0xd94a4a,
          w: 0xf2e6d0,
          h: 0xb07a46,
          l: 0xe2e8f0,
          L: 0xcbd5e1,
          d: 0x64748b,
          t: 0xffffff,
        },
  );
  outline(art);
  return strip([art], [Math.floor(art.width / 2), Math.floor(art.height / 2)], 1);
}

/** The Lancer's thrown spear, pointing right: a long haft, red tassel and a bright leaf blade. */
export function paintSpear(): PropArt {
  const art = fromRows(
    [
      '.....................lL....',
      '................rr..lLLLl..',
      'hhhhhhhhhhhhhhhhhhhhLLLLLLt',
      '................rr..dLLLd..',
      '.....................dd....',
    ],
    { h: 0x8a93a3, r: 0xd94a4a, l: 0xd6f6ff, L: 0x7dd3fc, d: 0x2b7fb0, t: 0xffffff },
  );
  outline(art);
  return strip([art], [Math.floor(art.width / 2), Math.floor(art.height / 2)], 1);
}

/** A faceted shard of ice, pointing right with a bright frozen tip. */
export function paintIceShard(): PropArt {
  const art = fromRows(
    ['..........l....', '......llllLL...', '..ddddLLLLWWt..', '......ddddLL...', '..........d....'],
    { d: 0x0369a1, l: 0x38bdf8, L: 0x7dd3fc, W: 0xe0f2fe, t: 0xffffff },
  );
  outline(art);
  return strip([art], [Math.floor(art.width / 2), Math.floor(art.height / 2)], 1);
}

/** A bright, jagged lightning bolt pointing along its flight. */
export function paintLightningBolt(): PropArt {
  const art = fromRows(
    [
      '.....LL........',
      '..LLLLL........',
      '.LLLWWLLLL.....',
      '....LLWWLLLL...',
      '.......LLWWLLt.',
      '..........LL...',
    ],
    { L: 0xfacc15, W: 0xfef9c3, t: 0xffffff },
  );
  outline(art);
  return strip([art], [Math.floor(art.width / 2), Math.floor(art.height / 2)], 1);
}

/** Keeps only what is joined to (x, y), so flickering flame never breaks off into specks. */
function keepJoined(out: Raster, x: number, y: number): void {
  const joined = new Uint8Array(out.width * out.height);
  const queue = [[x, y]];
  joined[y * out.width + x] = 1;
  while (queue.length) {
    const [px, py] = queue.pop()!;
    for (const [nx, ny] of [
      [px - 1, py],
      [px + 1, py],
      [px, py - 1],
      [px, py + 1],
    ]) {
      const i = ny * out.width + nx;
      if (!out.opaque(nx, ny) || joined[i]) continue;
      joined[i] = 1;
      queue.push([nx, ny]);
    }
  }
  for (let i = 0; i < joined.length; i++) if (!joined[i]) out.data[i * 4 + 3] = 0;
}

const FIRE = [0x7a1508, 0xb91c1c, 0xea580c, 0xf97316, 0xfbbf24, 0xfde68a, 0xfff7ed].map(rgb);

/** A fireball streaking right, its flaming tail flickering behind it. */
export function paintFireball(): PropArt {
  const w = 26;
  const h = 17;
  const cx = 17;
  const cy = 8;
  const frames = [0, 1, 2, 3].map((f) => {
    const out = new Raster(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const ball = 1 - Math.hypot(dx, dy) / 5.6;
        // The tail narrows toward its end and licks up and down from frame to frame
        const along = (cx - (x + 0.5)) / 14;
        const wave = Math.sin(along * 9 - f * 1.6) * along * 2.2;
        const half = 5.2 * (1 - along) + 0.6;
        const tail = along > 0 && along < 1 ? (1 - Math.abs(dy - wave) / half) * (1 - along) : 0;
        const flicker = (noise(x + f * 7, y, 2.5, 80 + f) - 0.5) * 0.35;
        const heat = Math.max(ball * 1.25, tail * 0.95) + flicker;
        if (heat < 0.12) continue;
        out.set(x, y, FIRE[Math.min(FIRE.length - 1, Math.floor(heat * FIRE.length))]);
      }
    }
    keepJoined(out, cx, cy);
    outline(out, rgb(0x3d0a04));
    return out;
  });
  return strip(frames, [cx, cy], 0.24);
}

const VIOLET = [0x3b0764, 0x7e22ce, 0xa855f7, 0xd8b4fe, 0xfaf5ff].map(rgb);

/** The Chronomancer's orb: a violet sphere with three motes circling it. */
export function paintTimeOrb(): PropArt {
  const size = 19;
  const c = size / 2;
  const frames = [0, 1, 2, 3].map((f) => {
    const out = new Raster(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const light = ballLight(x + 0.5 - c, y + 0.5 - c, 4.6);
        if (light !== null) out.set(x, y, ramp(VIOLET, 0.55 + light * 0.45, x, y));
      }
    }
    for (let i = 0; i < 3; i++) {
      const a = ((i + f / 4) / 3) * Math.PI * 2;
      const mx = Math.round(c - 0.5 + Math.cos(a) * 7);
      const my = Math.round(c - 0.5 + Math.sin(a) * 3.2);
      out.set(mx, my, VIOLET[4]);
      out.set(mx + 1, my, VIOLET[3]);
    }
    outline(out, rgb(0x1e0636));
    return out;
  });
  return strip(frames, [Math.floor(c), Math.floor(c)], 0.4);
}

const STEEL = [0x0e4a5c, 0x22a5c4, 0x67e8f9, 0xe0fbff].map(rgb);

/** The Rogue's thrown blade star, spinning. */
export function paintBladeStar(): PropArt {
  const size = 13;
  const c = size / 2;
  const frames = [0, 1, 2, 3].map((f) => {
    const out = new Raster(size, size);
    const turn = (f / 4) * (Math.PI / 2);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - c;
        const dy = y + 0.5 - c;
        const r = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx) - turn;
        const reach = 1.6 + 3.8 * Math.max(0, Math.cos(4 * a)) ** 3;
        if (r > reach || r < 0.8) continue;
        out.set(x, y, STEEL[r < 1.6 ? 1 : r > reach - 1 ? 3 : 2]);
      }
    }
    outline(out);
    return out;
  });
  return strip(frames, [Math.floor(c), Math.floor(c)], 0.14);
}

/** A twinkling four-point spark; also the stars over a stunned monster. */
export function paintSpark(colour: string | number = 0x7dd3fc, arms = [2, 3, 4, 3]): PropArt {
  const tones = fxPalette(colour);
  const size = 2 * Math.max(...arms) + 3;
  const c = Math.floor(size / 2);
  const frames = arms.map((arm) => {
    const out = new Raster(size, size);
    for (let i = -arm; i <= arm; i++) {
      const tone = tones[Math.abs(i) <= 1 ? 4 : Math.abs(i) < arm ? 3 : 2];
      out.set(c + i, c, tone);
      out.set(c, c + i, tone);
    }
    out.set(c, c, rgb(0xffffff));
    outline(out, tones[0]);
    return out;
  });
  return strip(frames, [c, c], 0.36);
}

/**
 * A blade's crescent swoosh, white along its cutting edge: it sweeps in over the frames, then
 * breaks up into dither.
 */
export function paintSlash(colour: string): PropArt {
  const tones = fxPalette(colour);
  const size = 40;
  const c = size / 2;
  const outer = 16;
  const spans: [number, number, number][] = [
    [0, 0.4, 0],
    [0, 0.75, 0],
    [0, 1, 0],
    [0.3, 1, 0.35],
    [0.6, 1, 0.7],
  ];
  const frames = spans.map(([from, to, fade]) => {
    const out = new Raster(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - c;
        const dy = c - (y + 0.5);
        const r = Math.hypot(dx, dy);
        // Sweeps from the left over the top to the right
        let a = Math.atan2(dy, dx);
        if (a < -Math.PI / 2) a += Math.PI * 2;
        const t = (Math.PI * 0.95 - a) / (Math.PI * 0.9);
        if (t < from || t > to) continue;
        const thick = 1.2 + 4.2 * Math.sin(Math.PI * t);
        const depth = outer - r;
        if (depth < 0 || depth > thick) continue;
        if (fade && dither(x, y) + 0.5 < fade + (1 - t) * 0.4) continue;
        const tone = depth < 1.2 ? 4 : depth < thick * 0.5 ? 3 : depth < thick * 0.8 ? 2 : 1;
        out.set(x, y, tones[tone]);
      }
    }
    return out;
  });
  return strip(frames, [c, c], 0.22);
}

const SMOKE = [0x2b2733, 0x47414f, 0x6b6475].map(rgb);

/**
 * An explosion `radius` pixels across: a white flash, a ragged fireball in the effect's colour,
 * then smoke breaking up into dither.
 */
export function paintExplosion(colour: string, radius: number): PropArt {
  const tones = fxPalette(colour);
  const size = Math.ceil(radius * 2) + 8;
  const c = size / 2;
  const frames = [0, 1, 2, 3, 4, 5].map((f) => {
    const out = new Raster(size, size);
    const reach = [0.4, 0.8, 1, 1.05, 1, 0.95][f] * radius;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
        const ragged = (noise(x, y, 3, 90 + f) - 0.5) * radius * (f > 1 ? 0.5 : 0.15);
        const edge = reach + ragged;
        if (d > edge) continue;
        const inside = d / Math.max(1, edge);
        if (f >= 3) {
          // Smoke: puffs with holes that widen as it clears
          const puff = noise(x, y, 4, 97 + f);
          if (puff < 0.25 + (f - 3) * 0.2) continue;
          if (dither(x, y) + 0.5 < (f - 3) * 0.3) continue;
          const ember = f === 3 && inside < 0.45;
          out.set(x, y, ember ? tones[2] : SMOKE[Math.min(2, Math.floor(puff * 3))]);
          continue;
        }
        const tone = f === 0 ? 4 : inside < 0.35 ? 4 : inside < 0.6 ? 3 : inside < 0.85 ? 2 : 1;
        out.set(x, y, tones[tone]);
      }
    }
    return out;
  });
  return strip(frames, [Math.floor(c), Math.floor(c)], 0.45);
}

/** A promotion's pillar of light: it shoots up, holds, then thins away into dither. */
export function paintLightPillar(colour: string): PropArt {
  const tones = fxPalette(colour);
  const w = 18;
  const h = 100;
  const frames = [0.35, 0.8, 1, 1, 0.85, 0.6].map((grow, f) => {
    const out = new Raster(w, h);
    const top = h - 2 - Math.round((h - 4) * Math.min(1, grow));
    const half = [5, 7, 7, 6, 4, 3][f];
    const fade = [0, 0, 0, 0.2, 0.45, 0.7][f];
    for (let y = top; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.abs(x + 0.5 - w / 2);
        if (d > half) continue;
        if (dither(x, y) + 0.5 < fade + (y - top < 6 ? 0.4 : 0)) continue;
        out.set(x, y, tones[d < 1 ? 4 : d < half * 0.45 ? 3 : d < half * 0.8 ? 2 : 1]);
      }
    }
    return out;
  });
  return strip(frames, [w / 2, h - 1], 1);
}

/** The selection cursor that floats over the chosen tile: a faceted crystal pointing down. */
export function paintCursorGem(): PropArt {
  const tones = [0x0b3a5c, 0x1d7fb8, 0x38bdf8, 0xa5f0ff, 0xffffff].map(rgb);
  const w = 13;
  const h = 15;
  const frames = [0, 1].map((f) => {
    const out = new Raster(w, h);
    for (let y = 1; y < 12; y++) {
      const half = 5 * (1 - (y - 1) / 11);
      for (let x = 0; x < w; x++) {
        const dx = x + 0.5 - w / 2;
        if (Math.abs(dx) > half + 0.3) continue;
        const tone = y < 3 ? 4 : dx < -half * 0.3 ? 3 : dx < half * 0.35 ? 2 : 1;
        out.set(x, y, tones[tone]);
      }
    }
    // A glint that runs down the lit facet
    out.set(4, 4 + f * 3, tones[4]);
    outline(out, tones[0]);
    return out;
  });
  return strip(frames, [Math.floor(w / 2), h - 1], 0.7);
}

/**
 * The tile cursor drawn on the board at its own texel size: four corner brackets, two frames
 * that breathe in and out by a texel.
 */
export function paintCursorBrackets(texels: number): Raster {
  const frames = [2, 1].map((inset) => {
    const out = new Raster(texels, texels);
    const len = Math.round(texels * 0.3);
    for (const [cx, cy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      for (let i = 0; i < len; i++) {
        for (let t = 0; t < 2; t++) {
          const along = cx ? texels - 1 - inset - i : inset + i;
          const across = cy ? texels - 1 - inset - t : inset + t;
          const xAlong = cx ? texels - 1 - inset - t : inset + t;
          const yAlong = cy ? texels - 1 - inset - i : inset + i;
          const tone = rgb(t === 0 ? 0xffffff : 0x38d6ff);
          out.set(along, across, tone);
          out.set(xAlong, yAlong, tone);
        }
      }
    }
    outline(out, rgb(0x0b2a3a));
    return out;
  });
  const out = new Raster(texels * 2, texels);
  frames.forEach((frame, i) => {
    for (let y = 0; y < texels; y++) {
      for (let x = 0; x < texels; x++)
        if (frame.opaque(x, y)) out.set(i * texels + x, y, frame.get(x, y));
    }
  });
  return out;
}

const RING_VERTEX = /* glsl */ `
  uniform float extent;
  varying vec2 vGrid;
  varying vec2 vCentre;
  void main() {
    #ifdef GROUND
      vGrid = (modelMatrix * vec4(position, 1.0)).xz;
      vCentre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
    #else
      vGrid = position.xy * extent;
      vCentre = vec2(0.0);
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RING_FRAGMENT = /* glsl */ `
  uniform vec3 color;
  uniform vec3 core;
  uniform float radius;
  uniform float thickness;
  uniform float fill;
  uniform float fillDensity;
  uniform float density;
  uniform float arcStart;
  uniform float arcLength;
  uniform float pixel;
  varying vec2 vGrid;
  varying vec2 vCentre;
  float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
  void main() {
    vec2 cell = floor(vGrid / pixel);
    vec2 rel = (cell + 0.5) * pixel - vCentre;
    float edge = length(rel) - radius;
    float threshold = bayer4(cell);
    float band = thickness * 0.5;
    bool ring = abs(edge) <= band;
    float inward = -edge - band;
    bool inner = !ring && inward > 0.0 && inward < fill
      && threshold < fillDensity * (1.0 - inward / max(fill, 1e-4));
    if (!ring && !inner) discard;
    if (arcLength < 6.2831) {
      float a = mod(atan(rel.y, rel.x) - arcStart, 6.2831853);
      if (a > arcLength) discard;
    }
    if (threshold >= density) discard;
    gl_FragColor = vec4(ring && abs(edge) <= band * 0.4 ? core : color, 1.0);
    #include <colorspace_fragment>
  }
`;

export interface RingLook {
  color: THREE.ColorRepresentation;
  /** The ring's bright centre line; defaults to the colour washed toward white. */
  core?: THREE.ColorRepresentation;
  /** World size of one of the ring's pixels. */
  pixel: number;
  /** Lies flat with its pixels on the board's grid, instead of facing the camera. */
  ground?: boolean;
}

/**
 * A ring drawn in square pixels, crisp at any radius: a band `thickness` wide with a bright
 * centre line, an optional dithered fill fading inward, an optional arc, and a dithered fade
 * (`density` 1 solid, 0 gone). Opaque, so it never smears like additive glows.
 */
export class PixelRing {
  public readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  constructor(look: RingLook) {
    const color = new THREE.Color(look.color);
    const core =
      look.core !== undefined
        ? new THREE.Color(look.core)
        : color.clone().lerp(new THREE.Color(1, 1, 1), 0.6);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: color },
        core: { value: core },
        radius: { value: 0.5 },
        thickness: { value: look.pixel * 2 },
        fill: { value: 0 },
        fillDensity: { value: 0 },
        density: { value: 1 },
        arcStart: { value: 0 },
        arcLength: { value: Math.PI * 2 },
        pixel: { value: look.pixel },
        extent: { value: 1 },
      },
      vertexShader: RING_VERTEX,
      fragmentShader: RING_FRAGMENT,
      defines: look.ground ? { GROUND: '' } : {},
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    material.toneMapped = false;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    if (look.ground) this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 2;
  }

  private get uniforms(): Record<string, THREE.IUniform> {
    return this.mesh.material.uniforms;
  }

  /** Sizes the ring; the quad grows to fit it. */
  public setRadius(radius: number, thickness = this.uniforms['thickness'].value as number): void {
    const extent = Math.max(0.01, radius + thickness);
    this.uniforms['radius'].value = Math.max(0, radius);
    this.uniforms['thickness'].value = thickness;
    this.uniforms['extent'].value = extent;
    this.mesh.scale.setScalar(extent);
  }

  public set density(value: number) {
    this.uniforms['density'].value = value;
  }

  /** A dithered band `width` wide inside the ring, `strength` 0 to 1 at its outer edge. */
  public setFill(width: number, strength: number): void {
    this.uniforms['fill'].value = width;
    this.uniforms['fillDensity'].value = strength;
  }

  /** Draws only `length` radians of the ring, starting `start` radians round. */
  public setArc(start: number, length: number): void {
    this.uniforms['arcStart'].value = start;
    this.uniforms['arcLength'].value = length;
  }

  public get color(): THREE.Color {
    return this.uniforms['color'].value as THREE.Color;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
