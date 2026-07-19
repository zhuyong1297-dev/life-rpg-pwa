import { expect, test } from '@playwright/test'

test('代表性今天界面无溢出或反馈遮挡', async ({ page }, testInfo) => {
  await page.goto('./')
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('示例关键行为')
  await page.getByLabel('关键行为').check()
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '完成 示例关键行为' }).click()
  await expect(page.locator('.feedback-overlay')).toBeVisible()

  const layout = await page.evaluate(() => {
    const feedback = document.querySelector<HTMLElement>('.feedback-overlay')?.getBoundingClientRect()
    const clippedText = [...document.querySelectorAll<HTMLElement>('button, strong, span')]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => element.textContent?.trim())
      .filter(Boolean)
    return {
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      feedbackInside: Boolean(
        feedback && feedback.left >= 0 && feedback.right <= window.innerWidth && feedback.top >= 0 && feedback.bottom <= window.innerHeight,
      ),
      clippedText,
    }
  })
  expect(layout.documentOverflow).toBeLessThanOrEqual(1)
  expect(layout.feedbackInside).toBe(true)
  expect(layout.clippedText).toEqual([])
  await page.screenshot({ path: `test-results/today-${testInfo.project.name}.png`, fullPage: true })
})

test('三层选择器在各视口完整可见', async ({ page }, testInfo) => {
  await page.goto('./')
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('示例分层习惯')
  await page.getByRole('button', { name: '三层目标' }).click()
  await page.getByLabel('基础层（分钟）').fill('5')
  await page.getByLabel('标准层（分钟）').fill('20')
  await page.getByLabel('突破层（分钟）').fill('45')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '完成 示例分层习惯' }).click()

  const modal = page.locator('.modal')
  await expect(page.getByRole('button', { name: '选择 基础层' })).toBeVisible()
  await expect(page.getByRole('button', { name: '选择 突破层' })).toBeVisible()
  const bounds = await modal.boundingBox()
  const viewport = page.viewportSize()
  expect(bounds).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.height)
  await page.screenshot({ path: `test-results/tier-picker-${testInfo.project.name}.png` })
})

test('完成操作和归档确认在各视口完整可见', async ({ page }, testInfo) => {
  await page.goto('./')
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('示例操作习惯')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '完成 示例操作习惯' }).click()
  await page.getByRole('button', { name: '查看 示例操作习惯 完成记录' }).click({ force: true })
  await page.getByRole('button', { name: '取消今天的完成' }).click()

  const modal = page.locator('.modal')
  await expect(page.getByRole('button', { name: '确认取消' })).toBeVisible()
  const bounds = await modal.boundingBox()
  const viewport = page.viewportSize()
  expect(bounds).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.height)
  await page.screenshot({ path: `test-results/completion-actions-${testInfo.project.name}.png` })
})
