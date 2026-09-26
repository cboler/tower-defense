import { test } from '@playwright/test';

test('capture current battlefield', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:4201', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Deploy Blade Warden on the currently selected tile (0, 0)
  const deployBtn = page.locator('#deploy-tower-btn');
  if (await deployBtn.isVisible()) {
    await deployBtn.click();
    await page.waitForTimeout(600);
  }

  // Also select another tile near the path, e.g. tile (2, 2)
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Digit2'); // Select Ranger
  await page.waitForTimeout(300);
  if (await deployBtn.isVisible()) {
    await deployBtn.click();
    await page.waitForTimeout(600);
  }

  await page.screenshot({
    path: 'C:/Users/chris/.gemini/antigravity-ide/brain/a31dc538-2b25-44c4-ab8f-78a9d3c0be51/battlefield_current.png',
  });

  // Call wave 1 to see creeps marching down the path and towers firing!
  const callWaveBtn = page.locator('#call-wave-btn');
  if (await callWaveBtn.isVisible()) {
    await callWaveBtn.click();
    await page.waitForTimeout(3500);
  }

  await page.screenshot({
    path: 'C:/Users/chris/.gemini/antigravity-ide/brain/a31dc538-2b25-44c4-ab8f-78a9d3c0be51/battlefield_combat.png',
  });
});
