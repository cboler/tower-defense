import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CampaignService } from './campaign.service';
import { CAMPAIGN_MISSIONS } from '../models/campaign.model';

describe('CampaignService', () => {
  let service: CampaignService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    localStorage.clear();
    service = TestBed.inject(CampaignService);
  });

  it('initializes with default missions and unlocks the first mission', () => {
    expect(service.missions().length).toBe(CAMPAIGN_MISSIONS.length);
    expect(service.activeMission().id).toBe(CAMPAIGN_MISSIONS[0].id);
    expect(service.isMissionUnlocked(CAMPAIGN_MISSIONS[0].id)).toBe(true);
  });

  it('locks subsequent missions until the preceding mission is completed or reached wave 20', () => {
    const mission2 = CAMPAIGN_MISSIONS[1].id;
    expect(service.isMissionUnlocked(mission2)).toBe(false);

    // Complete mission 1 with 20/20 crystals saved
    service.recordMissionResult(CAMPAIGN_MISSIONS[0].id, 31, 150000, 20, 31);

    expect(service.isMissionUnlocked(mission2)).toBe(true);
    expect(service.totalStars()).toBe(3);
  });

  it('records 3 stars for perfect crystal defense and updates high score', () => {
    const m1 = CAMPAIGN_MISSIONS[0].id;
    const result = service.recordMissionResult(m1, 31, 120000, 20, 31);

    expect(result.starsEarned).toBe(3);
    expect(result.isNewHighScore).toBe(true);
    expect(result.isFirstClear).toBe(true);

    const record = service.progressMap()[m1];
    expect(record.completed).toBe(true);
    expect(record.highScore).toBe(120000);
    expect(record.starsEarned).toBe(3);
    expect(record.bestRemainingCrystals).toBe(20);
  });

  it('allows selecting unlocked missions but rejects locked missions', () => {
    const m2 = CAMPAIGN_MISSIONS[1].id;
    const selectedLocked = service.selectMission(m2);
    expect(selectedLocked).toBe(false);

    // Complete m1
    service.recordMissionResult(CAMPAIGN_MISSIONS[0].id, 31, 100000, 15, 31);
    const selectedUnlocked = service.selectMission(m2);
    expect(selectedUnlocked).toBe(true);
    expect(service.activeMission().id).toBe(m2);
  });
});
