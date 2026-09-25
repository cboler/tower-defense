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

    // 3. Command dock and tactical action bar are visible
    await expect(page.locator('.tower-command-panel')).toBeVisible();
    await expect(page.locator('.controller-guide-bar')).toBeVisible();

    // 4. Controller & Keyboard interaction test (pure controller/keyboard playable)
    // Press '2' to select Ranger class
    await page.keyboard.press('Digit2');
    await expect(page.locator('.class-card[aria-label*="Ranger"]')).toBeVisible();

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

  test('should render mobile-first layout on Pixel 9 Pro with zero scroll and contextual command drawer', async ({
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

    // Initial vantage point (0, 0) is selected, so command dock is visible
    const commandDock = page.locator('.tower-command-dock');
    await expect(commandDock).toHaveClass(/is-visible/);
    await expect(page.locator('.drawer-handle-bar')).toBeVisible();

    // Close command drawer via close button [B]
    await page.locator('#panel-close-btn').click();
    await expect(commandDock).not.toHaveClass(/is-visible/);

    // Verify still zero scroll when drawer is closed
    const closedScrollMetrics = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));
    expect(closedScrollMetrics.scrollHeight).toBeLessThanOrEqual(closedScrollMetrics.innerHeight);
  });

  test('should render tablet layout (768x1024) with docked console and zero scroll', async ({
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

    const commandDock = page.locator('.tower-command-dock');
    await expect(commandDock).toHaveClass(/is-visible/);
    await expect(page.locator('.class-deck-section')).toBeVisible();
  });

  test('should render desktop layout (1440x900) with side-by-side presentation and side dossier console', async ({
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

    const commandDock = page.locator('.tower-command-dock');
    await expect(commandDock).toHaveClass(/is-visible/);

    // Verify side-by-side layout: arena-stage-area has flex-direction row
    const arenaDirection = await page.locator('.arena-stage-area').evaluate((el) => {
      return window.getComputedStyle(el).flexDirection;
    });
    expect(arenaDirection).toBe('row');
  });
});
