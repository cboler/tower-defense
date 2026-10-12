import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  QueryList,
  ViewChildren,
  afterNextRender,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';
import { TOWER_CLASSES, TowerClassId } from '../core/models/tower.model';
import { MOB_TYPES, MobTypeId } from '../core/models/mob.model';
import { animateModel } from '../game/battle-map/battlefield-models';
import type { ImportedModelSettings } from '../game/battle-map/imported-models';
import { MiniatureRig } from '../game/battle-map/miniature-rig';
import { ModelKind, ModelLibraryService } from '../game/battle-map/model-library.service';

/** Turns monsters drawn side-on in their sprites to the same angle for comparison. */
const SPRITE_FACING: Record<string, number> = {
  swiftbeak: 1.15,
  'sky-sovereign': 0.95,
  bonewalker: -0.5,
  skulker: -0.35,
};

/** The battlefield's default "tactics" camera direction. */
const BOARD_VIEW = new THREE.Vector3(0, 14.5, 12.5).normalize();
/** Distance at which one tile spans ~40px on a 640×480 board, as on a small laptop window. */
const BOARD_DISTANCE = 19.6;
const BOARD_CROP = 80;

interface GalleryEntry {
  kind: ModelKind;
  id: string;
  name: string;
  art: string;
}

interface PieceStats {
  authored: boolean;
  triangles: number;
  draws: number;
}

/** What the lil-gui panel edits; mapped onto ImportedModelSettings on every change. */
interface TuningState {
  model: 'authored' | 'sculpted';
  toon: boolean;
  outline: boolean;
  yaw: number;
  height: number;
  idle: string;
  attack: string;
  walk: string;
  walking: boolean;
  turntable: boolean;
}

const AUTO_CLIP = '(match by name)';
const NO_CLIP = '(none)';

function addLights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xc7e6ff, 0x394b47, 2.0));
  const sun = new THREE.DirectionalLight(0xffe4b5, 3.2);
  sun.position.set(-9, 19, 11);
  const fill = new THREE.DirectionalLight(0x38bdf8, 0.9);
  fill.position.set(10, 8, -8);
  const rim = new THREE.DirectionalLight(0xa855f7, 0.75);
  rim.position.set(0, -6, -10);
  scene.add(sun, fill, rim);
}

function measure(rig: MiniatureRig, authored: boolean): PieceStats {
  let triangles = 0;
  let draws = 0;
  rig.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
    draws += Array.isArray(object.material) ? object.material.length : 1;
  });
  return { authored, triangles: Math.round(triangles), draws };
}

function disposeRig(rig: MiniatureRig): void {
  rig.dispose();
  rig.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!object.geometry.userData['shared']) object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material.dispose());
  });
}

/**
 * Art-direction bench: each battlefield miniature beside the sprite it is modelled on, lit
 * like the battlefield. Inspect a piece to tune its authored model live (the board picks the
 * tuning up for the session), or drop a .glb onto it to try one before publishing it.
 */
@Component({
  selector: 'app-model-gallery',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="gallery">
      <header>
        <a routerLink="/">← Back to battle</a>
        <h1>Miniature Gallery</h1>
        <p>
          Battlefield models beside their character art, close up and at tactical distance. Inspect
          a piece to tune it, or drop a <code>.glb</code> onto it to try an authored model. Tuning
          carries over to the battle for this session.
        </p>
      </header>
      <div class="grid">
        @for (entry of entries; track entry.id) {
          <figure
            class="card"
            [attr.data-id]="entry.id"
            [class.is-drop]="dropTarget() === entry.id"
            (dragover)="onDragOver($event, entry)"
            (dragleave)="dropTarget.set(null)"
            (drop)="onDrop($event, entry)"
          >
            <img [src]="entry.art" [alt]="entry.name + ' artwork'" />
            <canvas #close width="220" height="220"></canvas>
            <canvas #far width="110" height="110"></canvas>
            <figcaption>
              <span class="name">{{ entry.name }}</span>
              @if (stats()[entry.id]; as s) {
                <span class="badge" [class.authored]="s.authored">
                  {{ s.authored ? 'Authored' : 'Sculpted' }} · {{ s.triangles }} tris ·
                  {{ s.draws }} draws
                </span>
              }
              <button type="button" class="inspect" (click)="inspect(entry)">Inspect</button>
            </figcaption>
          </figure>
        }
      </div>
    </section>

    @if (inspected(); as entry) {
      <div
        class="inspector"
        role="dialog"
        [attr.aria-label]="'Inspect ' + entry.name"
        (keydown.escape)="closeInspector()"
      >
        <div
          class="viewport"
          [class.is-drop]="dropTarget() === entry.id"
          (dragover)="onDragOver($event, entry)"
          (dragleave)="dropTarget.set(null)"
          (drop)="onDrop($event, entry)"
        >
          <canvas #live class="live"></canvas>
          <figure class="board">
            <canvas #board width="160" height="160"></canvas>
            <figcaption>On a 640px board, ×2</figcaption>
          </figure>
          <p class="drop-hint">Drop a .glb to try it as the {{ entry.name }}</p>
        </div>
        <aside class="side">
          <header>
            <h2>{{ entry.name }}</h2>
            <button type="button" (click)="closeInspector()" aria-label="Close inspector">
              Close
            </button>
          </header>
          <div #gui class="gui-host"></div>
          <label class="file">
            Load .glb…
            <input
              type="file"
              accept=".glb,.gltf,model/gltf-binary"
              (change)="onFile($event, entry)"
            />
          </label>
          @if (message()) {
            <p class="message" role="status">{{ message() }}</p>
          }
        </aside>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: #0b1220;
        color: #e2e8f0;
      }
      .gallery {
        padding: 16px;
        max-width: 1400px;
        margin: 0 auto;
      }
      header a {
        color: #7dd3fc;
      }
      h1 {
        margin: 8px 0 4px;
      }
      code {
        color: #fde68a;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
        gap: 12px;
        margin-top: 16px;
      }
      .card {
        margin: 0;
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: auto auto auto;
        gap: 6px;
        padding: 10px;
        border-radius: 10px;
        background: #13203a;
        outline: 2px dashed transparent;
      }
      .card.is-drop,
      .viewport.is-drop {
        outline-color: #fde68a;
      }
      .card img,
      .card canvas[width='220'] {
        width: 100%;
        aspect-ratio: 1;
        object-fit: contain;
        border-radius: 6px;
        background: #24475e;
      }
      .card canvas[width='110'] {
        width: 110px;
        height: 110px;
        grid-column: 2;
        justify-self: end;
        border-radius: 4px;
        background: #24475e;
        image-rendering: pixelated;
      }
      figcaption {
        grid-column: 1;
        grid-row: 3;
        align-self: center;
        display: grid;
        gap: 4px;
        justify-items: start;
      }
      .name {
        font-weight: 600;
      }
      .badge {
        font-size: 0.75rem;
        color: #94a3b8;
      }
      .badge.authored {
        color: #fde68a;
      }
      button,
      .file {
        min-height: 32px;
        padding: 4px 12px;
        border-radius: 6px;
        border: 1px solid #334155;
        background: #1e293b;
        color: #e2e8f0;
        font: inherit;
        cursor: pointer;
      }
      .inspector {
        position: fixed;
        inset: 0;
        z-index: 10;
        display: grid;
        grid-template-columns: 1fr 300px;
        background: #050912;
      }
      .viewport {
        position: relative;
        min-width: 0;
        outline: 2px dashed transparent;
        outline-offset: -8px;
      }
      .live {
        display: block;
        width: 100%;
        height: 100%;
      }
      .board {
        position: absolute;
        right: 16px;
        bottom: 16px;
        margin: 0;
        display: grid;
        gap: 4px;
        justify-items: center;
        font-size: 0.75rem;
        color: #94a3b8;
      }
      .board canvas {
        width: 160px;
        height: 160px;
        border-radius: 6px;
        background: #24475e;
        image-rendering: pixelated;
      }
      .board figcaption {
        display: block;
      }
      .drop-hint {
        position: absolute;
        left: 16px;
        bottom: 16px;
        margin: 0;
        color: #64748b;
        font-size: 0.875rem;
      }
      .side {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
        overflow-y: auto;
        border-left: 1px solid #1e293b;
        background: #0f172a;
      }
      .side header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .side h2 {
        margin: 0;
        font-size: 1.125rem;
      }
      .gui-host {
        --width: 100%;
      }
      .file {
        display: inline-flex;
        align-items: center;
        align-self: flex-start;
      }
      .file input {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
      }
      .file:focus-within {
        outline: 2px solid #7dd3fc;
      }
      .message {
        margin: 0;
        font-size: 0.875rem;
        color: #fde68a;
      }
      @media (max-width: 720px) {
        .inspector {
          grid-template-columns: 1fr;
          grid-template-rows: 55vh 1fr;
        }
        .side {
          border-left: none;
          border-top: 1px solid #1e293b;
        }
      }
    `,
  ],
})
export class ModelGalleryComponent implements AfterViewInit, OnDestroy {
  @ViewChildren('close') private closeCanvases!: QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('far') private farCanvases!: QueryList<ElementRef<HTMLCanvasElement>>;
  private readonly liveCanvas = viewChild<ElementRef<HTMLCanvasElement>>('live');
  private readonly boardCanvas = viewChild<ElementRef<HTMLCanvasElement>>('board');
  private readonly guiHost = viewChild<ElementRef<HTMLElement>>('gui');

  private readonly models = inject(ModelLibraryService);
  private readonly injector = inject(Injector);

  protected readonly entries: GalleryEntry[] = [
    ...(Object.keys(TOWER_CLASSES) as TowerClassId[])
      .filter((id) => id !== 'barricade')
      .map((id) => ({
        kind: 'heroes' as const,
        id,
        name: TOWER_CLASSES[id].name,
        art: `assets/sprites/${id}.png`,
      })),
    ...(Object.keys(MOB_TYPES) as MobTypeId[]).map((id) => ({
      kind: 'monsters' as const,
      id,
      name: MOB_TYPES[id].name,
      art: `assets/monsters/${id}-sprite.png`,
    })),
  ];

  protected readonly stats = signal<Record<string, PieceStats>>({});
  protected readonly inspected = signal<GalleryEntry | null>(null);
  protected readonly dropTarget = signal<string | null>(null);
  protected readonly message = signal('');

  private renderer: THREE.WebGLRenderer | null = null;
  private liveRenderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  /** Revision each card was last drawn at. */
  private readonly drawn = new Map<string, number>();
  private viewReady = false;
  private attackStart = -Infinity;
  private live: {
    entry: GalleryEntry;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    gui: GUI;
    /** Authored availability and clip names the panel was built for. */
    guiKey: string;
    state: TuningState;
    rig: MiniatureRig;
    revision: number;
    timer: THREE.Timer;
    stride: number;
    frame: number;
    resize: ResizeObserver;
  } | null = null;

  constructor() {
    // Redraw cards whose model arrived or was retuned
    effect(() => {
      this.models.version();
      if (this.viewReady) untracked(() => this.drawCards());
    });
  }

  ngAfterViewInit(): void {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    this.renderer = renderer;
    addLights(this.scene);
    this.viewReady = true;
    this.drawCards();
    void this.models.load();
  }

  ngOnDestroy(): void {
    this.closeInspector();
    for (const renderer of [this.renderer, this.liveRenderer]) {
      renderer?.dispose();
      renderer?.forceContextLoss();
    }
  }

  protected inspect(entry: GalleryEntry): void {
    this.closeInspector();
    this.message.set('');
    this.inspected.set(entry);
    afterNextRender({ write: () => this.openInspector(entry) }, { injector: this.injector });
  }

  protected closeInspector(): void {
    const live = this.live;
    if (live) {
      cancelAnimationFrame(live.frame);
      live.resize.disconnect();
      live.gui.destroy();
      live.controls.dispose();
      disposeRig(live.rig);
      this.live = null;
    }
    this.inspected.set(null);
  }

  protected onDragOver(event: DragEvent, entry: GalleryEntry): void {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    this.dropTarget.set(entry.id);
  }

  protected onDrop(event: DragEvent, entry: GalleryEntry): void {
    event.preventDefault();
    this.dropTarget.set(null);
    const file = event.dataTransfer?.files[0];
    if (file) void this.tryModel(file, entry);
  }

  protected onFile(event: Event, entry: GalleryEntry): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void this.tryModel(file, entry);
    input.value = '';
  }

  /** Parses a dropped .glb and uses it for this piece, here and on the board, for the session. */
  private async tryModel(file: File, entry: GalleryEntry): Promise<void> {
    try {
      const asset = await this.models.parse(await file.arrayBuffer());
      await this.models.register(entry.kind, entry.id, asset);
      this.models.tune(entry.kind, entry.id, { sculpted: false });
      if (this.inspected()?.id !== entry.id) this.inspect(entry);
      const clips = asset.animations.map((clip) => clip.name).join(', ') || 'none';
      this.message.set(`Trying ${file.name}. Clips: ${clips}.`);
    } catch (error) {
      // Open first: opening the inspector clears any previous message
      if (this.inspected()?.id !== entry.id) this.inspect(entry);
      const text = error instanceof Error ? error.message : String(error);
      this.message.set(
        /draco/i.test(text)
          ? `${file.name} uses Draco compression. Re-export it without, or run it through npm run models:optimize.`
          : `Couldn't read ${file.name}: ${text}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Card snapshots
  // -------------------------------------------------------------------------

  private drawCards(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    const closeCanvases = this.closeCanvases.toArray();
    const farCanvases = this.farCanvases.toArray();
    const stats = { ...this.stats() };
    this.entries.forEach((entry, i) => {
      const revision = this.models.revision(entry.kind, entry.id);
      if (this.drawn.get(entry.id) === revision) return;
      this.drawn.set(entry.id, revision);

      const rig = this.models.piece(entry.kind, entry.id);
      const authored = rig.root.getObjectByName('model-fit') !== undefined;
      stats[entry.id] = measure(rig, authored);
      const model = rig.root;
      // Match the in-game boss scale so proportions read the same as on the board.
      if (entry.id === 'sky-sovereign' || entry.id === 'bramble-golem') model.scale.setScalar(1.42);
      model.rotation.y = SPRITE_FACING[entry.id] ?? model.rotation.y;
      animateModel(model, 0, 0, 0);
      rig.update(0);
      this.scene.add(model);
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const height = Math.max(box.getSize(new THREE.Vector3()).y, 0.9);
      const camera = this.camera;

      // Close-up, slightly above eye level and turned like the sprite art
      renderer.setSize(440, 440, false);
      camera.position.set(
        center.x + height * 0.9,
        center.y + height * 0.55,
        center.z + height * 2.6,
      );
      camera.lookAt(center);
      renderer.render(this.scene, camera);
      this.blit(renderer.domElement, closeCanvases[i]?.nativeElement);

      // Tactical distance: the same pitch the battlefield camera uses, at roughly in-game size
      renderer.setSize(110, 110, false);
      camera.position.set(center.x, center.y + 3.4, center.z + 2.9);
      camera.lookAt(center);
      renderer.render(this.scene, camera);
      this.blit(renderer.domElement, farCanvases[i]?.nativeElement);

      this.scene.remove(model);
      disposeRig(rig);
    });
    this.stats.set(stats);
  }

  private blit(source: HTMLCanvasElement, target: HTMLCanvasElement | undefined): void {
    const ctx = target?.getContext('2d');
    if (!ctx || !target) return;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(source, 0, 0, target.width, target.height);
  }

  // -------------------------------------------------------------------------
  // Live inspector
  // -------------------------------------------------------------------------

  private openInspector(entry: GalleryEntry): void {
    const canvas = this.liveCanvas()?.nativeElement;
    const host = this.guiHost()?.nativeElement;
    if (!canvas || !host || this.inspected()?.id !== entry.id) return;

    // Switching pieces keeps the dialog (and its canvas) open, so the renderer is reused
    if (this.liveRenderer?.domElement !== canvas) {
      this.liveRenderer?.dispose();
      this.liveRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      this.liveRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.liveRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.liveRenderer.toneMappingExposure = 1.15;
    }
    const renderer = this.liveRenderer;
    const scene = new THREE.Scene();
    addLights(scene);
    const grid = new THREE.GridHelper(4, 4, 0x334155, 0x1e293b);
    scene.add(grid);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
    camera.position.set(1.2, 1.2, 3.2);
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 0.45, 0);
    controls.enableDamping = true;

    const resize = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = canvas;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resize.observe(canvas);

    const rig = this.models.piece(entry.kind, entry.id);
    scene.add(rig.root);
    this.live = {
      entry,
      scene,
      camera,
      controls,
      gui: new GUI({ container: host, width: 268 }),
      guiKey: '',
      state: { ...this.tuningState(entry), walking: entry.kind === 'monsters', turntable: false },
      rig,
      revision: this.models.revision(entry.kind, entry.id),
      timer: new THREE.Timer(),
      stride: 0,
      frame: 0,
      resize,
    };
    this.buildGui();
    this.live.frame = requestAnimationFrame(() => this.tick());
  }

  /** Panel values for the piece's current settings. */
  private tuningState(entry: GalleryEntry): Omit<TuningState, 'walking' | 'turntable'> {
    const settings = this.models.settings(entry.kind, entry.id);
    const authored = this.models.hasAuthored(entry.kind, entry.id);
    return {
      model: settings.sculpted || !authored ? 'sculpted' : 'authored',
      toon: settings.toon ?? true,
      outline: settings.outline ?? true,
      yaw: Math.round(THREE.MathUtils.radToDeg(settings.yaw ?? 0)),
      height: settings.height ?? this.models.defaultHeight(entry.kind, entry.id),
      idle: settings.clips?.idle ?? AUTO_CLIP,
      attack: settings.clips?.attack ?? AUTO_CLIP,
      walk: settings.clips?.walk ?? AUTO_CLIP,
    };
  }

  /** Rebuilds the panel only when what it offers changes, never from inside its own handlers. */
  private buildGui(): void {
    const live = this.live;
    if (!live) return;
    const { gui, entry } = live;
    const authored = this.models.hasAuthored(entry.kind, entry.id);
    const clipNames = this.models.clipNames(entry.kind, entry.id);
    const key = `${authored}|${clipNames.join('|')}`;
    if (key === live.guiKey) return;
    live.guiKey = key;
    Object.assign(live.state, this.tuningState(entry));
    const state = live.state;
    for (const child of [...gui.children]) child.destroy();
    const apply = () => this.models.tune(entry.kind, entry.id, this.toSettings(state));

    if (!authored) {
      gui.title('Sculpted miniature');
      const note = { tip: 'Drop a .glb to compare' };
      gui.add(note, 'tip').name('No authored model').disable();
    } else {
      gui.title('Authored model');
      gui.add(state, 'model', ['authored', 'sculpted']).name('Show').onChange(apply);
      gui.add(state, 'toon').name('Cel shading').onChange(apply);
      gui.add(state, 'outline').name('Ink outline').onChange(apply);
      gui.add(state, 'yaw', -180, 180, 5).name('Turn (°)').onFinishChange(apply);
      gui
        .add(state, 'height', 0.3, 2, 0.01)
        .decimals(2)
        .name('Height (tiles)')
        .onFinishChange(apply);
      const names = [AUTO_CLIP, NO_CLIP, ...clipNames];
      const clips = gui.addFolder('Clips');
      clips.add(state, 'idle', names).name('Idle').onChange(apply);
      clips.add(state, 'attack', names).name('Attack').onChange(apply);
      clips.add(state, 'walk', names).name('Walk').onChange(apply);
    }

    const play = gui.addFolder('Preview');
    play.add({ attack: () => this.previewAttack() }, 'attack').name('Play attack');
    play.add(state, 'walking').name('Walk in place');
    play.add(state, 'turntable').name('Turntable');

    if (authored) {
      const actions = {
        copy: () => void this.copySettings(),
        reset: () => {
          this.models.resetTuning(entry.kind, entry.id);
          Object.assign(state, this.tuningState(entry));
          gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
        },
      };
      gui.add(actions, 'copy').name('Copy models.json entry');
      gui.add(actions, 'reset').name('Reset tuning');
    }
  }

  /** Settings that differ from the defaults, as models.json stores them. */
  private toSettings(state: TuningState): ImportedModelSettings {
    const live = this.live!;
    const clip = (name: string) => (name === AUTO_CLIP ? undefined : name === NO_CLIP ? '' : name);
    const clips = { idle: clip(state.idle), attack: clip(state.attack), walk: clip(state.walk) };
    const defaultHeight = this.models.defaultHeight(live.entry.kind, live.entry.id);
    return {
      sculpted: state.model === 'sculpted',
      toon: state.toon ? undefined : false,
      outline: state.outline ? undefined : false,
      yaw: state.yaw ? +THREE.MathUtils.degToRad(state.yaw).toFixed(4) : undefined,
      height: Math.abs(state.height - defaultHeight) > 0.005 ? state.height : undefined,
      clips: Object.values(clips).some((name) => name !== undefined) ? clips : undefined,
    };
  }

  private async copySettings(): Promise<void> {
    const live = this.live;
    if (!live) return;
    const settings = this.toSettings(live.state);
    delete settings.sculpted;
    // Unset (default) values drop out of the JSON
    const text = `"${live.entry.id}": ${JSON.stringify(settings, null, 2)}`;
    try {
      await navigator.clipboard.writeText(text);
      this.message.set(`Copied. Paste into art/models/models.json under "${live.entry.kind}".`);
    } catch {
      this.message.set(text);
    }
  }

  private previewAttack(): void {
    // Authored attack clips play themselves; otherwise the joints swing in tick()
    if (this.live && !this.live.rig.attack()) this.attackStart = performance.now();
  }

  private tick(): void {
    const live = this.live;
    const renderer = this.liveRenderer;
    if (!live || !renderer) return;
    live.frame = requestAnimationFrame(() => this.tick());
    live.timer.update();
    const dt = Math.min(live.timer.getDelta(), 0.1);
    const { entry, state } = live;

    // Rebuild when the model or its tuning changes, keeping the turntable angle
    const revision = this.models.revision(entry.kind, entry.id);
    if (revision !== live.revision) {
      live.revision = revision;
      const turn = live.rig.root.rotation.y;
      live.scene.remove(live.rig.root);
      disposeRig(live.rig);
      live.rig = this.models.piece(entry.kind, entry.id);
      live.rig.root.rotation.y = turn;
      live.scene.add(live.rig.root);
      this.buildGui();
    }

    const rig = live.rig;
    const model = rig.root;
    if (state.turntable) model.rotation.y += dt * 0.6;
    if (state.walking) live.stride += dt * 7.5;

    const sinceAttack = (performance.now() - this.attackStart) / 1000;
    const swing = sinceAttack < 0.4 ? Math.sin((sinceAttack / 0.4) * Math.PI) : 0;
    if (rig.has('walk') && state.walking) {
      rig.stride(live.stride);
    } else if (!rig.animated) {
      const phase = state.walking ? live.stride : live.timer.getElapsed() * 2.4;
      animateModel(model, phase, state.walking ? 0.55 : 0, swing);
    }
    rig.update(dt);

    live.controls.update();
    renderer.render(live.scene, live.camera);
    this.drawBoardView(live.scene, model);
  }

  /** The piece at true board size from the tactics camera, upscaled ×2 without smoothing. */
  private drawBoardView(scene: THREE.Scene, model: THREE.Object3D): void {
    const renderer = this.renderer;
    const target = this.boardCanvas()?.nativeElement;
    if (!renderer || !target) return;
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const camera = this.camera;
    camera.fov = 34;
    camera.aspect = 4 / 3;
    camera.position.copy(center).addScaledVector(BOARD_VIEW, BOARD_DISTANCE);
    camera.lookAt(center);
    camera.setViewOffset(
      640,
      480,
      320 - BOARD_CROP / 2,
      240 - BOARD_CROP / 2,
      BOARD_CROP,
      BOARD_CROP,
    );
    renderer.setSize(BOARD_CROP, BOARD_CROP, false);
    const grid = scene.children.find((child) => child instanceof THREE.GridHelper);
    if (grid) grid.visible = false;
    renderer.render(scene, camera);
    if (grid) grid.visible = true;
    camera.clearViewOffset();
    camera.fov = 30;
    camera.aspect = 1;
    camera.updateProjectionMatrix();
    const ctx = target.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(renderer.domElement, 0, 0, target.width, target.height);
  }
}
