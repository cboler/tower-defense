import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import * as THREE from 'three';
import { TOWER_CLASSES, TowerClassId } from '../core/models/tower.model';
import { MOB_TYPES, MobTypeId } from '../core/models/mob.model';
import {
  animateModel,
  createHeroModel,
  createMonsterModel,
} from '../game/battle-map/battlefield-models';

/** Turns monsters drawn side-on in their sprites to the same angle for comparison. */
const SPRITE_FACING: Record<string, number> = {
  swiftbeak: 1.15,
  'sky-sovereign': 0.95,
  bonewalker: -0.5,
  skulker: -0.35,
};

interface GalleryEntry {
  kind: 'hero' | 'monster';
  id: string;
  name: string;
  art: string;
}

/**
 * Art-direction check: each battlefield miniature beside the sprite it is modelled on,
 * lit like the battlefield, so the two can be kept visually in step.
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
        <p>Battlefield models beside their character art, close up and at tactical distance.</p>
      </header>
      <div class="grid">
        @for (entry of entries; track entry.id) {
          <figure class="card" [attr.data-id]="entry.id">
            <img [src]="entry.art" [alt]="entry.name + ' artwork'" />
            <canvas #close width="220" height="220"></canvas>
            <canvas #far width="110" height="110"></canvas>
            <figcaption>{{ entry.name }}</figcaption>
          </figure>
        }
      </div>
    </section>
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
        font-weight: 600;
      }
    `,
  ],
})
export class ModelGalleryComponent implements AfterViewInit, OnDestroy {
  @ViewChildren('close') private closeCanvases!: QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChildren('far') private farCanvases!: QueryList<ElementRef<HTMLCanvasElement>>;

  protected readonly entries: GalleryEntry[] = [
    ...(Object.keys(TOWER_CLASSES) as TowerClassId[])
      .filter((id) => id !== 'barricade')
      .map((id) => ({
        kind: 'hero' as const,
        id,
        name: TOWER_CLASSES[id].name,
        art: `assets/sprites/${id}.png`,
      })),
    ...(Object.keys(MOB_TYPES) as MobTypeId[]).map((id) => ({
      kind: 'monster' as const,
      id,
      name: MOB_TYPES[id].name,
      art: `assets/monsters/${id}-sprite.png`,
    })),
  ];

  private renderer: THREE.WebGLRenderer | null = null;

  ngAfterViewInit(): void {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setSize(440, 440, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xc7e6ff, 0x394b47, 2.0));
    const sun = new THREE.DirectionalLight(0xffe4b5, 3.2);
    sun.position.set(-9, 19, 11);
    const fill = new THREE.DirectionalLight(0x38bdf8, 0.9);
    fill.position.set(10, 8, -8);
    const rim = new THREE.DirectionalLight(0xa855f7, 0.75);
    rim.position.set(0, -6, -10);
    scene.add(sun, fill, rim);

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    const closeCanvases = this.closeCanvases.toArray();
    const farCanvases = this.farCanvases.toArray();

    this.entries.forEach((entry, i) => {
      const model =
        entry.kind === 'hero'
          ? createHeroModel(entry.id as TowerClassId)
          : createMonsterModel(entry.id as MobTypeId);
      // Match the in-game boss scale so proportions read the same as on the board.
      if (entry.id === 'sky-sovereign' || entry.id === 'bramble-golem') model.scale.setScalar(1.42);
      model.rotation.y = SPRITE_FACING[entry.id] ?? model.rotation.y;
      animateModel(model, 0, 0, 0);
      scene.add(model);
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const height = Math.max(box.getSize(new THREE.Vector3()).y, 0.9);

      // Close-up, slightly above eye level and turned like the sprite art
      renderer.setSize(440, 440, false);
      camera.position.set(
        center.x + height * 0.9,
        center.y + height * 0.55,
        center.z + height * 2.6,
      );
      camera.lookAt(center);
      renderer.render(scene, camera);
      this.blit(renderer.domElement, closeCanvases[i]?.nativeElement);

      // Tactical distance: the same pitch the battlefield camera uses, at roughly in-game size
      renderer.setSize(110, 110, false);
      camera.position.set(center.x, center.y + 3.4, center.z + 2.9);
      camera.lookAt(center);
      renderer.render(scene, camera);
      this.blit(renderer.domElement, farCanvases[i]?.nativeElement);

      scene.remove(model);
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      });
    });
  }

  private blit(source: HTMLCanvasElement, target: HTMLCanvasElement | undefined): void {
    const ctx = target?.getContext('2d');
    if (!ctx || !target) return;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(source, 0, 0, target.width, target.height);
  }

  ngOnDestroy(): void {
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
  }
}
