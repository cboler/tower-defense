import { Injectable, signal } from '@angular/core';
import * as THREE from 'three';
import { ActorSheets, SpriteActor } from './sprite-actors';
import { ModelKind } from './model-library.service';

const ACTOR_ROOT = 'assets/actors/';

/** Loads the baked sprite sheets for the HD-2D look and hands out sprite actors. */
@Injectable({ providedIn: 'root' })
export class SpriteLibraryService {
  /** True once every sheet is loaded; the board swaps miniatures for sprites then. */
  public readonly ready = signal(false);
  private sheets: ActorSheets | null = null;
  private readonly textures = new Map<string, THREE.Texture>();
  private loading: Promise<void> | null = null;

  public load(): Promise<void> {
    this.loading ??= this.loadAll();
    return this.loading;
  }

  /** A sprite for this piece, or null when it has no sheet (it stays a miniature). */
  public actor(kind: ModelKind, id: string): SpriteActor | null {
    const sheet = this.sheets?.[kind][id];
    const texture = this.textures.get(`${kind}/${id}`);
    if (!sheet || !texture || !this.sheets) return null;
    return new SpriteActor(sheet, texture, this.sheets.pixelsPerTile);
  }

  private async loadAll(): Promise<void> {
    try {
      const response = await fetch(`${ACTOR_ROOT}actors.json`);
      if (!response.ok) return;
      this.sheets = (await response.json()) as ActorSheets;
    } catch {
      return;
    }
    const loader = new THREE.TextureLoader();
    const sheets = this.sheets;
    await Promise.all(
      (['heroes', 'monsters'] as const).flatMap((kind) =>
        Object.entries(sheets[kind]).map(async ([id, sheet]) => {
          const texture = await loader.loadAsync(ACTOR_ROOT + sheet.file);
          // Pixel art: no smoothing, no mipmaps, exact sRGB colours
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          texture.generateMipmaps = false;
          texture.colorSpace = THREE.SRGBColorSpace;
          this.textures.set(`${kind}/${id}`, texture);
        }),
      ),
    );
    this.ready.set(true);
  }
}
