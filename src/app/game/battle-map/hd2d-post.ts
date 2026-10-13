import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';

/*
 * The HD-2D lens: bloom on crystals and spells, a tilt-shift focus band that makes the board
 * read as a miniature diorama, a warm/cool grade and a vignette. Loaded only with that look.
 */

const FULLSCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** One axis of a Gaussian blur that is zero inside a horizontal focus band and grows outside. */
function tiltShift(): ConstructorParameters<typeof ShaderPass>[0] {
  return {
    uniforms: {
      tDiffuse: { value: null },
      direction: { value: new THREE.Vector2() },
      focus: { value: 0.52 },
      band: { value: 0.27 },
    },
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec2 direction;
      uniform float focus;
      uniform float band;
      varying vec2 vUv;
      void main() {
        float blur = clamp((abs(vUv.y - focus) - band) * 3.5, 0.0, 1.0);
        vec2 d = direction * blur;
        vec4 sum = texture2D(tDiffuse, vUv) * 0.1633;
        sum += (texture2D(tDiffuse, vUv - d) + texture2D(tDiffuse, vUv + d)) * 0.1531;
        sum += (texture2D(tDiffuse, vUv - 2.0 * d) + texture2D(tDiffuse, vUv + 2.0 * d)) * 0.12245;
        sum += (texture2D(tDiffuse, vUv - 3.0 * d) + texture2D(tDiffuse, vUv + 3.0 * d)) * 0.0918;
        sum += (texture2D(tDiffuse, vUv - 4.0 * d) + texture2D(tDiffuse, vUv + 4.0 * d)) * 0.051;
        gl_FragColor = sum;
      }
    `,
  };
}

/** Warm highlights, cool shadows and a touch more saturation, like a lit stage. */
const GRADE: ConstructorParameters<typeof ShaderPass>[0] = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: FULLSCREEN_VERTEX,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 saturated = mix(vec3(luma), color.rgb, 1.12);
      vec3 shade = mix(vec3(0.9, 0.96, 1.1), vec3(1.08, 1.0, 0.9), smoothstep(0.05, 0.6, luma));
      gl_FragColor = vec4(saturated * shade, color.a);
    }
  `,
};

/** Blur reach in pixels at the top and bottom of the frame. */
const BLUR_PIXELS = 2.2;

export class Hd2dPost {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly blurX = new ShaderPass(tiltShift());
  private readonly blurY = new ShaderPass(tiltShift());

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(size.clone(), 0.32, 0.45, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.blurX);
    this.composer.addPass(this.blurY);
    this.composer.addPass(new ShaderPass(GRADE));
    const vignette = new ShaderPass(VignetteShader);
    vignette.uniforms['offset'].value = 1.05;
    vignette.uniforms['darkness'].value = 1.15;
    this.composer.addPass(vignette);
    this.composer.addPass(new OutputPass());
    this.setSize(size.x, size.y);
  }

  public setSize(width: number, height: number): void {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
    this.bloom.resolution.set(width, height);
    (this.blurX.uniforms['direction'].value as THREE.Vector2).set(BLUR_PIXELS / width, 0);
    (this.blurY.uniforms['direction'].value as THREE.Vector2).set(0, BLUR_PIXELS / height);
  }

  public render(): void {
    this.composer.render();
  }

  public dispose(): void {
    this.bloom.dispose();
    this.composer.dispose();
  }
}
