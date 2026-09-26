import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { StoryService } from './story.service';
import { StoryNarrativeEvent } from '../models/story.model';

describe('StoryService', () => {
  let service: StoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StoryService);
  });

  const testEvent: StoryNarrativeEvent = {
    id: 'test-event',
    title: 'Test Narrative',
    trigger: 'on-mission-start',
    steps: [
      {
        speaker: 'Commander',
        avatar: 'assets/portraits/blade-warden.png',
        text: 'First briefing line.',
      },
      {
        speaker: 'Scout',
        avatar: 'assets/portraits/ranger.png',
        text: 'Second tactical update.',
      },
    ],
  };

  it('should initialize with no active dialogue', () => {
    expect(service.isDialogueActive()).toBe(false);
    expect(service.currentStep()).toBeNull();
  });

  it('should start a sequence and show the first step', () => {
    service.startSequence(testEvent);
    expect(service.isDialogueActive()).toBe(true);
    expect(service.currentStepIndex()).toBe(0);
    expect(service.currentStep()?.speaker).toBe('Commander');
    expect(service.isLastStep()).toBe(false);
  });

  it('should advance to the next step when advanceStep() is called', () => {
    service.startSequence(testEvent);
    const hasNext = service.advanceStep();
    expect(hasNext).toBe(true);
    expect(service.currentStepIndex()).toBe(1);
    expect(service.currentStep()?.speaker).toBe('Scout');
    expect(service.isLastStep()).toBe(true);
  });

  it('should finish the sequence when advancing past the last step', () => {
    service.startSequence(testEvent);
    service.advanceStep(); // step 1
    const hasNext = service.advanceStep(); // finishes
    expect(hasNext).toBe(false);
    expect(service.isDialogueActive()).toBe(false);
    expect(service.currentStep()).toBeNull();
  });

  it('should immediately close sequence on skipSequence()', () => {
    service.startSequence(testEvent);
    service.skipSequence();
    expect(service.isDialogueActive()).toBe(false);
    expect(service.currentStep()).toBeNull();
  });

  it('should provide authentic wave alert events for waves 10, 20, and 31', () => {
    expect(service.getWaveAlertEvent(10)?.id).toBe('wave-10-alert');
    expect(service.getWaveAlertEvent(20)?.id).toBe('wave-20-alert');
    expect(service.getWaveAlertEvent(31)?.id).toBe('wave-31-alert');
    expect(service.getWaveAlertEvent(1)).toBeNull();
  });
});
