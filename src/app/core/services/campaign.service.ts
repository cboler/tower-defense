import { Injectable, computed, signal } from '@angular/core';
import {
  CAMPAIGN_MISSIONS,
  CampaignMission,
  MissionProgressRecord,
} from '../models/campaign.model';

const STORAGE_KEY = 'crystal_wardens_campaign_progress_v1';

@Injectable({ providedIn: 'root' })
export class CampaignService {
  public readonly missions = signal<CampaignMission[]>(CAMPAIGN_MISSIONS);
  public readonly activeMissionId = signal<string>(CAMPAIGN_MISSIONS[0].id);
  public readonly progressMap = signal<Record<string, MissionProgressRecord>>({});

  public readonly activeMission = computed<CampaignMission>(() => {
    const id = this.activeMissionId();
    return this.missions().find((m) => m.id === id) ?? this.missions()[0];
  });

  public readonly totalStars = computed<number>(() => {
    const prog = this.progressMap();
    return Object.values(prog).reduce((acc, curr) => acc + curr.starsEarned, 0);
  });

  public readonly completedMissionsCount = computed<number>(() => {
    const prog = this.progressMap();
    return Object.values(prog).filter((p) => p.completed).length;
  });

  constructor() {
    this.loadProgress();
  }

  public isMissionUnlocked(missionId: string): boolean {
    const all = this.missions();
    const idx = all.findIndex((m) => m.id === missionId);
    if (idx <= 0) return true; // First mission is always unlocked

    // Mission N is unlocked if Mission N-1 is completed (or has stars earned)
    const prevMission = all[idx - 1];
    const prevProg = this.progressMap()[prevMission.id];
    return !!prevProg && (prevProg.completed || prevProg.highestWave >= 20);
  }

  public selectMission(missionId: string): boolean {
    if (!this.isMissionUnlocked(missionId)) return false;
    const exists = this.missions().some((m) => m.id === missionId);
    if (!exists) return false;
    this.activeMissionId.set(missionId);
    return true;
  }

  public recordMissionResult(
    missionId: string,
    waveReached: number,
    finalScore: number,
    remainingCrystals: number,
    totalWaves: number,
  ): { starsEarned: number; isNewHighScore: boolean; isFirstClear: boolean } {
    const mission = this.missions().find((m) => m.id === missionId);
    if (!mission) {
      return { starsEarned: 0, isNewHighScore: false, isFirstClear: false };
    }

    const isCompleted = waveReached >= totalWaves && remainingCrystals > 0;
    let stars = 0;
    if (isCompleted) {
      if (remainingCrystals >= mission.threeStarCrystalRequirement) {
        stars = 3; // Perfect Crystal Defense (e.g. 20/20)
      } else if (remainingCrystals >= mission.twoStarCrystalRequirement) {
        stars = 2; // Resilient Defense
      } else {
        stars = 1; // Scored victory
      }
    }

    const currentMap = this.progressMap();
    const existing = currentMap[missionId];
    const prevHighScore = existing?.highScore ?? 0;
    const isNewHighScore = finalScore > prevHighScore;
    const isFirstClear = isCompleted && (!existing || !existing.completed);

    const record: MissionProgressRecord = {
      missionId,
      completed: existing?.completed || isCompleted,
      highScore: Math.max(prevHighScore, finalScore),
      highestWave: Math.max(existing?.highestWave ?? 0, waveReached),
      starsEarned: Math.max(existing?.starsEarned ?? 0, stars),
      bestRemainingCrystals: Math.max(existing?.bestRemainingCrystals ?? 0, remainingCrystals),
      lastPlayedTimestamp: Date.now(),
    };

    const nextMap = { ...currentMap, [missionId]: record };
    this.progressMap.set(nextMap);
    this.saveProgress(nextMap);

    return {
      starsEarned: record.starsEarned,
      isNewHighScore,
      isFirstClear,
    };
  }

  private loadProgress(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.progressMap.set(parsed);
        }
      }
    } catch {
      // Graceful fallback to default in-memory state
    }
  }

  private saveProgress(data: Record<string, MissionProgressRecord>): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignore storage write limits or private mode errors
    }
  }
}
