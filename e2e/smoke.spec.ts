import { test, expect } from '@playwright/test';

test.describe('Crystal Wardens Tower Defense Smoke Tests', () => {
  test('should load full-bleed game arena cleanly without runtime errors or horizontal overflow', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    await page.goto('/');

    // 1. Full-bleed console arena layout verification
    await expect(page.locator('main.app-console-arena')).toBeVisible();

    // 2. Core Game Arena components are visible
    await expect(page.locator('#battlefield-map')).toBeVisible();
    await expect(page.locator('#call-wave-btn')).toBeVisible();

    // 3. Command dock and wave command bar are visible
    await expect(page.locator('.tower-command-panel')).not.toBeVisible();
    await expect(page.locator('app-command-bar')).toBeVisible();

    // Keyboard/controller prompts show wherever there is room (hidden on short landscape phones)
    const viewport = page.viewportSize();
    if (viewport && viewport.height >= 520) {
      await expect(page.locator('.controller-guide-bar')).toBeVisible();
    }

    // 4. Controller & Keyboard interaction test (pure controller/keyboard playable)
    // Press '2' to pick up a Ranger, then Escape to put it back
    await page.keyboard.press('Digit2');
    await expect(page.locator('.placement-chip')).toContainText('Ranger');

    await page.keyboard.press('Escape');
    await expect(page.locator('.placement-chip')).not.toBeVisible();
    await expect(page.locator('.tower-command-panel')).not.toBeVisible();

    // Navigate grid with arrow keys
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');

    // Open Tactical Pause menu with Escape
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-title')).toBeVisible();
    await expect(page.locator('#pause-resume-btn')).toBeVisible();

    // Close Tactical Pause menu with Escape
    await page.keyboard.press('Escape');
    await expect(page.locator('#pause-title')).not.toBeVisible();

    // 5. Prevent accidental horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBeFalsy();

    // 6. Direct client-side navigation to diagnostics screen
    await page.goto('/status');
    await expect(page).toHaveURL(/.*status/);
    await expect(page.locator('#status-heading')).toBeVisible();
    await expect(page.locator('#base-uri-val')).toBeVisible();

    // Verify no horizontal overflow on secondary route
    const statusOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(statusOverflow).toBeFalsy();

    // 7. Navigate back to Arena via back-home-link
    await page.locator('#back-home-link').click();
    await expect(page).toHaveURL(/\/?$/);
    await expect(page.locator('#battlefield-map')).toBeVisible();

    // 8. Zero unhandled console errors or exceptions
    expect(consoleErrors).toEqual([]);
  });

  test('should render mobile-first layout on Pixel 9 Pro with zero scroll and contextual command menu', async ({
    page,
  }) => {
    // Target Google Pixel 9 Pro viewport (412 x 915)
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto('/');

    await expect(page.locator('main.app-console-arena')).toBeVisible();
    await expect(page.locator('#battlefield-map')).toBeVisible();

    // Verify zero scrollbar / zero page scroll
    const pageScrollMetrics = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(pageScrollMetrics.scrollHeight).toBeLessThanOrEqual(pageScrollMetrics.innerHeight);
    expect(pageScrollMetrics.scrollWidth).toBeLessThanOrEqual(pageScrollMetrics.innerWidth);

    // Commands appear only after activating a platform.
    await expect(page.locator('.tower-command-dock')).not.toBeVisible();
    await page.locator('#battlefield-map').focus();
    await page.keyboard.press('Enter');
    const commandDock = page.locator('.tower-command-dock');
    await expect(commandDock).toHaveClass(/is-visible/);
    await expect(page.getByRole('dialog', { name: 'Defender command menu' })).toBeVisible();

    // Close command drawer via close button [B]
    await page.locator('#panel-close-btn').click();
    await expect(commandDock).not.toBeVisible();

    // Verify still zero scroll when drawer is closed
    const closedScrollMetrics = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));
    expect(closedScrollMetrics.scrollHeight).toBeLessThanOrEqual(closedScrollMetrics.innerHeight);
  });

  test('should render tablet layout (768x1024) with contextual menus and zero scroll', async ({
    page,
  }) => {
    // Target Tablet viewport (768 x 1024)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    await expect(page.locator('main.app-console-arena')).toBeVisible();
    await expect(page.locator('#battlefield-map')).toBeVisible();

    const scrollMetrics = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollMetrics.scrollHeight).toBeLessThanOrEqual(scrollMetrics.innerHeight);
    expect(scrollMetrics.scrollWidth).toBeLessThanOrEqual(scrollMetrics.innerWidth);

    await expect(page.locator('.tower-command-dock')).not.toBeVisible();
    await page.locator('#battlefield-map').focus();
    await page.keyboard.press('Enter');
    const commandDock = page.locator('.tower-command-dock');
    await expect(commandDock).toHaveClass(/is-visible/);
    await expect(page.locator('.class-deck-section')).toBeVisible();
  });

  test('should render desktop layout (1440x900) with an unobstructed battlefield and contextual commands', async ({
    page,
  }) => {
    // Target Desktop viewport (1440 x 900)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    await expect(page.locator('main.app-console-arena')).toBeVisible();
    await expect(page.locator('#battlefield-map')).toBeVisible();

    const scrollMetrics = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollMetrics.scrollHeight).toBeLessThanOrEqual(scrollMetrics.innerHeight);
    expect(scrollMetrics.scrollWidth).toBeLessThanOrEqual(scrollMetrics.innerWidth);

    await expect(page.locator('.tower-command-dock')).not.toBeVisible();
    await page.locator('#battlefield-map').focus();
    await page.keyboard.press('Enter');
    const commandDock = page.locator('.tower-command-dock');
    await expect(commandDock).toHaveClass(/is-visible/);

    // The board keeps its full width; the menu overlays it instead of reserving a sidebar.
    const boardWidth = await page
      .locator('.arena-stage-area')
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(boardWidth).toBe(1440);
    await page.keyboard.press('Escape');
    await expect(commandDock).not.toBeVisible();
  });

  test('should open and interact with Campaign Chronicles and Monster Bestiary modals', async ({
    page,
  }) => {
    await page.goto('/');

    // 1. Open Campaign Chronicles Modal via HUD button
    await page.locator('#campaign-hud-btn').click();
    await expect(page.locator('#campaign-modal-title')).toBeVisible();
    await expect(page.locator('.missions-rail')).toBeVisible();
    await expect(page.locator('.briefing-box')).toBeVisible();
    await expect(page.locator('.speaker-name')).toContainText('Warden Marshal Cedric');

    // Deploy to mission to launch interactive story cutscene
    await page.locator('#deploy-mission-btn').click();
    await expect(page.locator('#campaign-modal-title')).not.toBeVisible();

    // Verify Story Dialogue Cutscene Overlay appears
    await expect(page.locator('.dialogue-card')).toBeVisible();
    await expect(page.locator('#dialogue-speaker')).toContainText('Warden Marshal Cedric');
    await expect(page.locator('#story-advance-btn')).toBeVisible();

    // Advance dialogue step
    await page.locator('#story-advance-btn').click();
    await expect(page.locator('.step-indicator')).toContainText('2 / 4');

    // Dismiss cutscene via skip button
    await page.locator('#story-skip-btn').click();
    await expect(page.locator('.dialogue-card')).not.toBeVisible();

    // 2. Open Monster Bestiary Codex Modal via HUD button
    await page.locator('#bestiary-hud-btn').click();
    await expect(page.locator('#bestiary-title')).toBeVisible();
    await expect(page.locator('.roster-rail')).toBeVisible();
    await expect(page.locator('.strategy-advice-card')).toBeVisible();

    // Click on Swiftbeak to inspect tactical counter
    await page.locator('.roster-item-card:has-text("Swiftbeak")').click();
    await expect(page.locator('.active-mob-name')).toContainText('Swiftbeak');
    await expect(page.locator('.strategy-advice-card')).toContainText(
      'Celerity halves slow strength',
    );

    // Close via close button
    await page.locator('#close-bestiary-btn').click();
    await expect(page.locator('#bestiary-title')).not.toBeVisible();
  });
});
