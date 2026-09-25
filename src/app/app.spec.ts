import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { GameComponent } from './game/game.component';
import { StatusComponent } from './status/status.component';
import { routes } from './app.routes';

describe('Crystal Wardens Application Tests', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App, GameComponent, StatusComponent],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  describe('App Shell', () => {
    it('should create the root shell', () => {
      const fixture = TestBed.createComponent(App);
      const app = fixture.componentInstance;
      expect(app).toBeTruthy();
    });

    it('should render skip link for accessibility', async () => {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const compiled = fixture.nativeElement as HTMLElement;
      const skipLink = compiled.querySelector('.skip-link');
      expect(skipLink).toBeTruthy();
      expect(skipLink?.getAttribute('href')).toBe('#main-content');
    });

    it('should render console arena viewport', async () => {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.app-console-arena')).toBeTruthy();
    });
  });

  describe('GameComponent', () => {
    it('should create the game component and render HUD, battlefield, and command dock', async () => {
      const fixture = TestBed.createComponent(GameComponent);
      await fixture.whenStable();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('app-hud')).toBeTruthy();
      expect(compiled.querySelector('app-battle-map')).toBeTruthy();
      expect(compiled.querySelector('app-tower-panel')).toBeTruthy();
    });
  });

  describe('StatusComponent', () => {
    it('should create status component and render base uri diagnostic', async () => {
      const fixture = TestBed.createComponent(StatusComponent);
      await fixture.whenStable();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('#status-heading')?.textContent).toContain(
        'Runtime & Routing Verification',
      );
      expect(compiled.querySelector('#base-uri-val')).toBeTruthy();
      expect(compiled.querySelector('#back-home-link')).toBeTruthy();
    });
  });
});
