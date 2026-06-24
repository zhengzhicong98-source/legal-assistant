import { test, expect } from '@playwright/test'

test.describe('Legal Assistant H5 Smoke Tests', () => {
  test('home page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=法律助手')).toBeVisible()
    await expect(page.locator('text=专为大学生设计')).toBeVisible()
  })

  test('tools page loads', async ({ page }) => {
    await page.goto('/pages/tools/index')
    await expect(page.locator('text=工具箱')).toBeVisible()
    await expect(page.locator('text=法律知识库')).toBeVisible()
  })

  test('calculator page loads', async ({ page }) => {
    await page.goto('/pages/calculator/index')
    await expect(page.locator('text=病假工资')).toBeVisible()
  })

  test('rights page loads', async ({ page }) => {
    await page.goto('/pages/rights/index')
    await expect(page.locator('text=维权导航')).toBeVisible()
  })

  test('knowledge page loads', async ({ page }) => {
    await page.goto('/pages/knowledge/index')
    await expect(page.locator('text=法律知识库')).toBeVisible()
  })
})
