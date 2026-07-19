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
