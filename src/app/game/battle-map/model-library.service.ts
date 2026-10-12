import { Injectable, signal } from '@angular/core';
import * as THREE from 'three';
import { TowerClassId } from '../../core/models/tower.model';
import { MobTypeId } from '../../core/models/mob.model';
import {
  HERO_TURN,
  MiniatureOptions,
  createHeroModel,
  createMonsterModel,
} from './battlefield-models';
import type { ImportedModelSettings, LoadedModel, instantiateModel } from './imported-models';
import { MiniatureRig } from './miniature-rig';

export type ModelKind = 'heroes' | 'monsters';

/** One authored model, as written by `npm run models:optimize`. */
export interface ModelManifestEntry extends ImportedModelSettings {
  /** Path under assets/models/. */
  file: string;
  triangles?: number;
  bytes?: number;
  clipNames?: string[];
}

export type ModelManifest = Record<ModelKind, Record<string, ModelManifestEntry>>;

const MODEL_ROOT = 'assets/models/';

/**
 * Hands out a miniature for every hero and monster: the authored glTF model when one is
 * listed in assets/models/manifest.json, otherwise the sculpted one.
 */
@Injectable({ providedIn: 'root' })
export class ModelLibraryService {
  /** Bumps when an authored model arrives or is retuned, so pieces on the board rebuild. */
  public readonly version = signal(0);

  private manifest: ModelManifest = { heroes: {}, monsters: {} };
  private readonly assets = new Map<string, LoadedModel>();
  private readonly overrides = new Map<string, ImportedModelSettings>();
  private readonly revisions = new Map<string, number>();
  private readonly sculptedHeights = new Map<string, number>();
  private loading: Promise<void> | null = null;
  /** Fitting and clip playback for authored models, loaded with the first one. */
  private instantiate: typeof instantiateModel | null = null;

  /** Fetches the manifest and every model it lists. Safe to call repeatedly. */
  public load(): Promise<void> {
    this.loading ??= this.loadAll();
    return this.loading;
  }

  public hero(id: TowerClassId, options: MiniatureOptions = {}): MiniatureRig {
    return this.build('heroes', id, () => createHeroModel(id, options), options);
  }

  public monster(id: MobTypeId, options: MiniatureOptions = {}): MiniatureRig {
    return this.build('monsters', id, () => createMonsterModel(id, options), options);
  }

  public piece(kind: ModelKind, id: string, options: MiniatureOptions = {}): MiniatureRig {
    return kind === 'heroes'
      ? this.hero(id as TowerClassId, options)
      : this.monster(id as MobTypeId, options);
  }

  /** Height authored models are fitted to unless tuned: the sculpted miniature's. */
  public defaultHeight(kind: ModelKind, id: string): number {
    return this.sculptedHeight(kind, id, () =>
      kind === 'heroes' ? createHeroModel(id as TowerClassId) : createMonsterModel(id as MobTypeId),
    );
  }

  /** Changes whenever this piece's model or settings do; pieces on the board compare it. */
  public revision(kind: ModelKind, id: string): number {
    return this.revisions.get(`${kind}/${id}`) ?? 0;
  }

  public hasAuthored(kind: ModelKind, id: string): boolean {
    return this.assets.has(`${kind}/${id}`);
  }

  public entry(kind: ModelKind, id: string): ModelManifestEntry | undefined {
    return this.manifest[kind][id];
  }

  public clipNames(kind: ModelKind, id: string): string[] {
    return this.assets.get(`${kind}/${id}`)?.animations.map((clip) => clip.name) ?? [];
  }

  /** Manifest settings with any live tuning from the gallery on top. */
  public settings(kind: ModelKind, id: string): ImportedModelSettings {
    const entry = this.manifest[kind][id];
    const base: ImportedModelSettings = entry
      ? {
          yaw: entry.yaw,
          height: entry.height,
          toon: entry.toon,
          outline: entry.outline,
          clips: entry.clips,
        }
      : {};
    return { ...base, ...this.overrides.get(`${kind}/${id}`) };
  }

  /** Live tuning; lasts for the session, so the board shows it too. */
  public tune(kind: ModelKind, id: string, settings: ImportedModelSettings): void {
    const key = `${kind}/${id}`;
    this.overrides.set(key, { ...this.overrides.get(key), ...settings });
    this.changed(key);
  }

  public resetTuning(kind: ModelKind, id: string): void {
    const key = `${kind}/${id}`;
    this.overrides.delete(key);
    this.changed(key);
  }

  /** Adds an authored model for this session, e.g. one dropped onto the gallery. */
  public async register(kind: ModelKind, id: string, asset: LoadedModel): Promise<void> {
    this.instantiate ??= (await import('./imported-models')).instantiateModel;
    const key = `${kind}/${id}`;
    this.assets.set(key, asset);
    this.changed(key);
  }

  private changed(key: string): void {
    this.revisions.set(key, (this.revisions.get(key) ?? 0) + 1);
    this.version.update((v) => v + 1);
  }

  /** Parses a .glb file in the browser. */
  public async parse(data: ArrayBuffer): Promise<LoadedModel> {
    const loader = await this.createLoader();
    const gltf = await loader.parseAsync(data, '');
    return { scene: gltf.scene, animations: gltf.animations };
  }

  private build(
    kind: ModelKind,
    id: string,
    sculpt: () => THREE.Group,
    options: MiniatureOptions,
  ): MiniatureRig {
    const asset = this.assets.get(`${kind}/${id}`);
    const settings = this.settings(kind, id);
    if (!asset || !this.instantiate || settings.sculpted) return new MiniatureRig(sculpt());
    const rig = this.instantiate(asset, settings, this.sculptedHeight(kind, id, sculpt), options);
    if (kind === 'heroes') rig.root.rotation.y = HERO_TURN;
    return rig;
  }

  /** Authored models are fitted to the sculpted miniature's height unless told otherwise. */
  private sculptedHeight(kind: ModelKind, id: string, sculpt: () => THREE.Group): number {
    const key = `${kind}/${id}`;
    let height = this.sculptedHeights.get(key);
    if (height === undefined) {
      const model = sculpt();
      height = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y;
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      this.sculptedHeights.set(key, height);
    }
    return height;
  }

  private async loadAll(): Promise<void> {
    try {
      const response = await fetch(`${MODEL_ROOT}manifest.json`);
      if (!response.ok) return;
      const manifest = (await response.json()) as Partial<ModelManifest>;
      this.manifest = { heroes: manifest.heroes ?? {}, monsters: manifest.monsters ?? {} };
    } catch {
      return;
    }
    const entries = (Object.keys(this.manifest) as ModelKind[]).flatMap((kind) =>
      Object.entries(this.manifest[kind]).map(([id, entry]) => ({ kind, id, entry })),
    );
    if (!entries.length) return;
    // The loader only downloads once there is something to load
    const loader = await this.createLoader();
    await Promise.all(
      entries.map(async ({ kind, id, entry }) => {
        try {
          const gltf = await loader.loadAsync(MODEL_ROOT + entry.file);
          await this.register(kind, id, { scene: gltf.scene, animations: gltf.animations });
        } catch (error) {
          console.warn(`${entry.file} failed to load; keeping the sculpted miniature.`, error);
        }
      }),
    );
  }

  private async createLoader() {
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/libs/meshopt_decoder.module.js'),
    ]);
    return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  }
}
