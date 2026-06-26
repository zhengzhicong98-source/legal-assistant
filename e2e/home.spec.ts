import { test, expect } from '@playwright/test'

test('首页正常加载', async ({ page }) => {
  await page.goto('/#/pages/home/index')
  await expect(page.locator('text=法律助手')).toBeVisible()
  await expect(page.locator('text=核心功能')).toBeVisible()
})

test('顶部导航栏显示正确', async ({ page }) => {
  await page.goto('/#/pages/home/index')
  await expect(page.locator('text=法律咨询')).toBeVisible()
  await expect(page.locator('text=合同审查')).toBeVisible()
  await expect(page.locator('text=案例广场')).toBeVisible()
})
