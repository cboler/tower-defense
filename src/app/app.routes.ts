import { Routes } from '@angular/router';
import { GameComponent } from './game/game.component';
import { StatusComponent } from './status/status.component';

export const routes: Routes = [
  {
    path: '',
    component: GameComponent,
    title: 'Crystal Wardens — Tactical Fantasy Tower Defense',
  },
  {
    path: 'status',
    component: StatusComponent,
    title: 'Diagnostics • Crystal Wardens PWA',
  },
  {
    path: '**',
    redirectTo: '',
  },
];
