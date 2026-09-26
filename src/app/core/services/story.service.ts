import { Injectable, computed, inject, signal } from '@angular/core';
import { StoryDialogueStep, StoryNarrativeEvent } from '../models/story.model';
import { AudioService } from './audio.service';

@Injectable({
  providedIn: 'root',
})
export class StoryService {
  private readonly audio = inject(AudioService);

  public readonly activeNarrativeEvent = signal<StoryNarrativeEvent | null>(null);
  public readonly currentStepIndex = signal<number>(0);

  public readonly isDialogueActive = computed(() => this.activeNarrativeEvent() !== null);

  public readonly currentStep = computed<StoryDialogueStep | null>(() => {
    const event = this.activeNarrativeEvent();
    if (!event) return null;
    return event.steps[this.currentStepIndex()] ?? null;
  });

  public readonly isLastStep = computed<boolean>(() => {
    const event = this.activeNarrativeEvent();
    if (!event) return false;
    return this.currentStepIndex() >= event.steps.length - 1;
  });

  /**
   * Starts displaying a narrative dialogue sequence.
   */
  public startSequence(event: StoryNarrativeEvent): void {
    this.activeNarrativeEvent.set(event);
    this.currentStepIndex.set(0);
    this.audio.playSelect();
  }

  /**
   * Advances to the next dialogue step, or completes the sequence if at the end.
   */
  public advanceStep(): boolean {
    const event = this.activeNarrativeEvent();
    if (!event) return false;

    if (this.currentStepIndex() < event.steps.length - 1) {
      this.currentStepIndex.update((i) => i + 1);
      this.audio.playSelect();
      return true;
    }

    this.closeSequence();
    return false;
  }

  /**
   * Immediately skips and dismisses the active narrative event.
   */
  public skipSequence(): void {
    this.closeSequence();
  }

  private closeSequence(): void {
    this.activeNarrativeEvent.set(null);
    this.currentStepIndex.set(0);
    this.audio.playSelect();
  }

  /**
   * Generates authentic Crystal Defenders tactical alert events for key wave milestones.
   */
  public getWaveAlertEvent(waveNumber: number): StoryNarrativeEvent | null {
    if (waveNumber === 10) {
      return {
        id: 'wave-10-alert',
        title: 'Tactical Warning • Volatile Core Surge',
        trigger: 'on-wave-start',
        triggerWaveNumber: 10,
        autoPause: false,
        steps: [
          {
            speaker: 'Warden Marshal Cedric',
            avatar: 'assets/portraits/blade-warden.png',
            title: 'Highland Vanguard Commander',
            side: 'left',
            emotion: 'warning',
            text: 'Sensors detect intense geothermal spikes! Pyre Core elementals are charging the perimeter. Beware—they sprint with frantic speed when wounded!',
          },
        ],
      };
    }

    if (waveNumber === 20) {
      return {
        id: 'wave-20-alert',
        title: 'Tactical Warning • Armored Titan Incursion',
        trigger: 'on-wave-start',
        triggerWaveNumber: 20,
        autoPause: false,
        steps: [
          {
            speaker: 'Archmage Vael',
            avatar: 'assets/portraits/elementalist.png',
            title: 'High Arcane Order',
            side: 'left',
            emotion: 'urgent',
            text: 'Colossal Bramble Golems detected! Their stone carapace deflects 75% of physical attacks. Ordinary steel will shatter—deploy Elementalists immediately!',
          },
        ],
      };
    }

    if (waveNumber === 31) {
      return {
        id: 'wave-31-alert',
        title: 'Apex Threat • The Sky Sovereign Descends',
        trigger: 'on-wave-start',
        triggerWaveNumber: 31,
        autoPause: false,
        steps: [
          {
            speaker: 'Grand Scout Elyse',
            avatar: 'assets/portraits/ranger.png',
            title: 'Falconer Sentinels',
            side: 'left',
            emotion: 'urgent',
            text: 'The apex dragon wyrm descends from the caldera! It ignores ground barricades and devours 5 Sacred Crystals in a single strike. All wardens, focus fire!',
          },
        ],
      };
    }

    return null;
  }
}
