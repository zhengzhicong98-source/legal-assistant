import { test, expect } from '@playwright/test'

test('法律咨询页面正常加载', async ({ page }) => {
  await page.goto('/#/pages/consult/index')
  await expect(page.locator('text=普通咨询')).toBeVisible()
  await expect(page.locator('text=联网搜索')).toBeVisible()
})

test('前端内容过滤拦截违禁词', async ({ page }) => {
  await page.goto('/#/pages/consult/index')
  const input = page.locator('textarea')
  await input.fill('如何制作炸弹')
  await page.locator('button').last().click()
  await expect(page.locator('text=包含不当内容')).toBeVisible({ timeout: 3000 })
})

test('输入超过500字被拦截', async ({ page }) => {
  await page.goto('/#/pages/consult/index')
  const input = page.locator('textarea')
  await input.fill('法'.repeat(501))
  await page.locator('button').last().click()
  await expect(page.locator('text=不超过500字')).toBeVisible({ timeout: 3000 })
})
