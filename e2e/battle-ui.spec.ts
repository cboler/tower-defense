import { expect, Page, test } from '@playwright/test';
import type { GameService } from '../src/app/core/services/game.service';
import type { ThreeBattlefieldService } from '../src/app/game/battle-map/three-battlefield.service';

// Use Angular's development inspector to stage repeatable encounters without production debug hooks.
async function stageEncounter(page: Page) {
  await page.evaluate(() => {
    const inspector = (
      window as unknown as {
        ng: { getComponent(el: Element): { game: GameService; three: ThreeBattlefieldService } };
      }
    ).ng;
    const { game } = inspector.getComponent(document.querySelector('app-game')!);
    game.isPaused.set(false);
    game['spawnMob']('bramble-golem', 1);
    game['spawnMob']('sky-sovereign', 1);
    game['spawnMob']('skulker', 1);
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const inspector = (
          window as unknown as {
            ng: { getComponent(el: Element): { three: ThreeBattlefieldService } };
          }
        ).ng;
        const visuals = [
          ...inspector
            .getComponent(document.querySelector('app-game')!)
            .three['mobVisuals'].values(),
        ];
        return visuals.length === 3 && visuals.every((vis) => vis.spawnAge >= 0.4);
      }),
    )
    .toBe(true);
  await page.evaluate(() => {
    const inspector = (
      window as unknown as { ng: { getComponent(el: Element): { game: GameService } } }
    ).ng;
    const { game } = inspector.getComponent(document.querySelector('app-game')!);
    game.isPaused.set(true);
    game.mobs.update((mobs) =>
      mobs.map((m, i) => ({ ...m, x: 3 + i * 2, y: 1, hp: Math.ceil(m.maxHp / 2) })),
    );
  });
}

test('boss bars and enemy inspection show current HP and the matching bestiary entry', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.locator('#battlefield-map')).toBeVisible();
  await stageEncounter(page);
  await expect(page.locator('.boss-bar')).toHaveCount(2);
  await expect(page.locator('.boss-bar').first()).toContainText('1638 / 3276');
  const gauge = await page.locator('.boss-gauge').first().boundingBox();
  expect(gauge!.width).toBeGreaterThan(200);
  await expect
    .poll(async () => {
      const fill = await page.locator('.boss-fill').first().boundingBox();
      return fill!.width / gauge!.width;
    })
    .toBeCloseTo(0.5, 1);
  const bossBounds = await page.locator('.boss-bar').first().boundingBox();
  const cameraBounds = await page.locator('.camera-fab').boundingBox();
  expect(bossBounds!.x + bossBounds!.width).toBeLessThanOrEqual(cameraBounds!.x);
  await page.screenshot({ path: testInfo.outputPath('boss-bars.png') });
  await page.getByRole('button', { name: /Inspect Bramble Golem, health/ }).click();
  await expect(page.locator('.active-mob-name')).toHaveText('Bramble Golem');
  await expect(page.getByRole('progressbar', { name: 'Bramble Golem health' })).toHaveAttribute(
    'aria-valuenow',
    '1638',
  );
  await expect(page.locator('.live-vitals')).toContainText('1638 / 3276 HP');
  await page
    .getByRole('navigation', { name: 'Enemies on battlefield' })
    .getByRole('button', { name: /Skulker/ })
    .click();
  await expect(page.locator('.active-mob-name')).toHaveText('Skulker');
  await expect(page.locator('.live-vitals')).toContainText('45 / 90 HP');
  await page.screenshot({ path: testInfo.outputPath('enemy-inspection.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#bestiary-title')).not.toBeVisible();
  await expect(page.locator('#pause-title')).not.toBeVisible();
  await page.keyboard.press('e');
  await expect(page.locator('.active-mob-name')).toHaveText('Bramble Golem');
});

test('clicking a rendered enemy opens its dossier in both board looks', async ({ page }) => {
  await page.goto('/');
  await stageEncounter(page);
  // Isolate the target: an airborne boss in front of it correctly wins the raycast.
  // The roster test above covers selecting individual enemies in crowded encounters.
  await page.evaluate(() => {
    const inspector = (
      window as unknown as { ng: { getComponent(el: Element): { game: GameService } } }
    ).ng;
    inspector
      .getComponent(document.querySelector('app-game')!)
      .game.mobs.update((mobs) => mobs.filter((m) => m.typeId === 'skulker'));
  });
  for (const look of ['miniatures', 'hd2d'] as const) {
    await page.evaluate((look) => {
      const inspector = (
        window as unknown as {
          ng: { getComponent(el: Element): { three: ThreeBattlefieldService } };
        }
      ).ng;
      const { three } = inspector.getComponent(document.querySelector('app-game')!);
      if (three.look() !== look) three.toggleLook();
    }, look);
    await expect(page.locator('.three-battlefield-canvas')).toBeVisible();
    // The 3D projection follows the current camera and portrait board rotation.
    const pos = await page.evaluate(() => {
      const inspector = (
        window as unknown as {
          ng: { getComponent(el: Element): { three: ThreeBattlefieldService } };
        }
      ).ng;
      return inspector
        .getComponent(document.querySelector('app-game')!)
        .three.projectGridToStage(7, 1, 0.4)!;
    });
    const canvas = await page.locator('.three-battlefield-canvas').boundingBox();
    await page.mouse.click(
      canvas!.x + (canvas!.width * pos.left) / 100,
      canvas!.y + (canvas!.height * pos.top) / 100,
    );
    await expect(page.locator('.active-mob-name')).toHaveText('Skulker');
    await expect(page.locator('.live-vitals')).toContainText('45 / 90 HP');
    await page.keyboard.press('Escape');
  }
});

test('contextual commands trap focus, deploy, close, and hold the battle without changing pause', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.locator('.tower-command-dock')).not.toBeVisible();
  await page.locator('#battlefield-map').focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Defender command menu' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('#deploy-tower-btn')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#panel-close-btn')).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('recruitment.png') });
  await page.locator('#deploy-tower-btn').click();
  await expect(dialog).not.toBeVisible();
  await page.locator('#menu-hud-btn').click();
  const before = await page.evaluate(() => {
    const inspector = (
      window as unknown as { ng: { getComponent(el: Element): { game: GameService } } }
    ).ng;
    return inspector.getComponent(document.querySelector('app-game')!).game.countdownRemainingMs();
  });
  await page.screenshot({ path: testInfo.outputPath('battle-council.png') });
  expect(
    await page.evaluate(() => {
      const inspector = (
        window as unknown as { ng: { getComponent(el: Element): { game: GameService } } }
      ).ng;
      const game = inspector.getComponent(document.querySelector('app-game')!).game;
      return { countdown: game.countdownRemainingMs(), paused: game.isPaused() };
    }),
  ).toEqual({ countdown: before, paused: false });
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-title')).not.toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const inspector = (
          window as unknown as { ng: { getComponent(el: Element): { game: GameService } } }
        ).ng;
        return inspector
          .getComponent(document.querySelector('app-game')!)
          .game.countdownRemainingMs();
      }),
    )
    .toBeLessThan(before);
  await page.screenshot({ path: testInfo.outputPath('battlefield.png') });
});

test('standard Gamepad API controls recruit, upgrade, and dismiss contextual commands', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const pad = {
      id: 'Test standard controller',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
  });
  await page.goto('/');
  await expect(page.locator('#battlefield-map')).toBeVisible();
  const press = async (index: number) => {
    for (const pressed of [true, false]) {
      await page.evaluate(
        async ({ index, pressed }) => {
          const button = navigator.getGamepads()[0]!.buttons[index] as {
            pressed: boolean;
            value: number;
          };
          button.pressed = pressed;
          button.value = pressed ? 1 : 0;
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        },
        { index, pressed },
      );
    }
  };
  // A opens commands. RB selects Ranger. A deploys and returns to the battlefield.
  await press(0);
  await expect(page.getByRole('dialog', { name: 'Defender command menu' })).toBeVisible();
  await press(5);
  await expect(page.locator('#deploy-tower-btn')).toContainText('Ranger');
  await press(0);
  await expect(page.locator('.tower-command-dock')).not.toBeVisible();
  // A reopens the hero dossier and then upgrades; B dismisses it.
  await press(0);
  await expect(page.locator('#upgrade-tower-btn')).toBeFocused();
  await press(0);
  await expect(page.locator('.head-level')).toHaveText('2');
  await press(1);
  await expect(page.locator('.tower-command-dock')).not.toBeVisible();
  await expect(page.locator('#pause-title')).not.toBeVisible();
  await press(3);
  await expect(page.locator('#speed-btn')).toContainText('2×');
  await press(9);
  await expect(page.locator('#pause-title')).toBeVisible();
  await press(1);
  await expect(page.locator('#pause-title')).not.toBeVisible();
});
