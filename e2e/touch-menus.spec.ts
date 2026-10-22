import { expect, Page, test } from '@playwright/test';
import type { GameService } from '../src/app/core/services/game.service';
import type { ThreeBattlefieldService } from '../src/app/game/battle-map/three-battlefield.service';

// Real touch taps: a phone fires its click after the finger lifts, on whatever is then under it
test.use({ hasTouch: true });

type Inspector = {
  ng: { getComponent(el: Element): { game: GameService; three: ThreeBattlefieldService } };
};

/** Where a board tile sits on screen. */
async function tileOnScreen(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as Inspector).ng.getComponent(document.querySelector('app-game')!)
            .three['tileMeshes'].length,
      ),
    )
    .toBeGreaterThan(0);
  return page.evaluate(
    ({ x, y }) => {
      const { three } = (window as unknown as Inspector).ng.getComponent(
        document.querySelector('app-game')!,
      );
      const at = three.projectGridToStage(x, y, 0.25)!;
      const rect = document.querySelector('.three-battlefield-canvas')!.getBoundingClientRect();
      return {
        x: rect.left + (rect.width * at.left) / 100,
        y: rect.top + (rect.height * at.top) / 100,
      };
    },
    { x, y },
  );
}

const towerCount = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as Inspector).ng
        .getComponent(document.querySelector('app-game')!)
        .game.towers().length,
  );

test('a tapped platform keeps its menu open to recruit, and the hero can then be upgraded', async ({
  page,
}) => {
  test.slow();
  await page.goto('/');
  await expect(page.locator('#battlefield-map')).toBeVisible();
  const menu = page.getByRole('dialog', { name: 'Defender command menu' });

  // Tapping a platform opens its menu, and the menu stays open once the finger lifts
  const platform = await tileOnScreen(page, 5, 4);
  await page.touchscreen.tap(platform.x, platform.y);
  await expect(menu).toBeVisible();
  await page.waitForTimeout(700);
  await expect(menu).toBeVisible();
  expect(await towerCount(page)).toBe(0);
  // The sheet hides the HUD, so it shows the gold on hand itself
  await expect(page.locator('#panel-gold')).toBeVisible();
  await expect(page.locator('#panel-gold')).toContainText('420');

  await page.locator('#deploy-tower-btn').tap();
  await expect(menu).not.toBeVisible();
  expect(await towerCount(page)).toBe(1);

  // Tapping the new hero opens its dossier, which stays open to upgrade
  await page.touchscreen.tap(platform.x, platform.y);
  await expect(page.locator('#upgrade-tower-btn')).toBeVisible();
  await page.waitForTimeout(700);
  await expect(menu).toBeVisible();
  await page.locator('#upgrade-tower-btn').tap();
  await expect(page.locator('.head-level')).toHaveText('2');
  await expect(menu).toBeVisible();

  // A stray click on the backdrop (like iOS's trailing click after the opening tap) leaves it
  await menu.dispatchEvent('click');
  await expect(menu).toBeVisible();

  // A deliberate tap on the backdrop still closes it
  const backdrop = await page.evaluate(() => {
    const scrim = document.querySelector('[aria-label="Defender command menu"]')!;
    for (let y = 4; y < innerHeight; y += 12) {
      for (let x = 4; x < innerWidth; x += 12) {
        if (document.elementFromPoint(x, y) === scrim) return { x, y };
      }
    }
    return null;
  });
  expect(backdrop).not.toBeNull();
  await page.touchscreen.tap(backdrop!.x, backdrop!.y);
  await expect(menu).not.toBeVisible();
});
