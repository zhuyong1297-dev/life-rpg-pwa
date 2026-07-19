import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: '今天' })).toBeVisible()
})

test('创建简单习惯后立即反馈，双击不重复发奖，撤销后可重做', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('示例行动')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  const completeButton = page.getByRole('button', { name: '完成 示例行动' })
  await expect(completeButton).toBeVisible()

  const elapsed = await page.evaluate(async () => {
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="完成 示例行动"]')
    if (!button) throw new Error('找不到完成按钮')
    const start = performance.now()
    button.click()
    button.click()
    await new Promise<void>((resolve) => {
      const existing = document.querySelector('.feedback-overlay')
      if (existing) return resolve()
      const observer = new MutationObserver(() => {
        if (document.querySelector('.feedback-overlay')) {
          observer.disconnect()
          resolve()
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
    })
    return performance.now() - start
  })
  expect(elapsed).toBeLessThan(250)
  await expect(page.getByText('+5 XP', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '撤销' }).click()
  await expect(page.getByText('已撤销，本次成长已用修正流水抵消')).toBeVisible()
  await page.getByRole('button', { name: '完成 示例行动' }).click()
  await page.getByRole('button', { name: '角色' }).click()
  await expect(page.locator('.character-progress > strong')).toHaveText('5 XP')
})

test('Boss 没有实际成果时不能完成', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('示例 Boss')
  await page.getByLabel('难度').selectOption('Boss')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '完成 示例 Boss' }).click()
  const confirm = page.getByRole('button', { name: '确认完成' })
  await expect(confirm).toBeDisabled()
  await page.getByLabel('实际成果（必填）').fill('完成了一个可验证结果')
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(page.getByText('+50 XP', { exact: true })).toBeVisible()
})

test('时长习惯记录实际分钟，达到目标后只发固定奖励', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('示例阅读')
  await page.getByRole('button', { name: '按时长' }).click()
  await page.getByLabel('目标时长（分钟）').fill('30')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByText('每天 · 目标 30 分钟')).toBeVisible()
  await page.getByRole('button', { name: '完成 示例阅读' }).click()

  const confirm = page.getByRole('button', { name: '确认完成' })
  await page.getByLabel('实际时长（分钟）').fill('20')
  await expect(confirm).toBeDisabled()
  await page.getByLabel('实际时长（分钟）').fill('45')
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(page.getByText('本次持续 45 分钟')).toBeVisible()
  await expect(page.getByText('+5 XP', { exact: true })).toBeVisible()
})

test('窄屏和桌面均没有横向溢出，人物资源有效', async ({ page }) => {
  const layout = await page.evaluate(async () => {
    const portrait = document.querySelector<HTMLElement>('.traveler-portrait')
    if (!portrait) throw new Error('人物未渲染')
    const imageUrl = getComputedStyle(portrait).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1]
    if (!imageUrl) throw new Error('人物资源地址为空')
    const response = await fetch(imageUrl)
    const bytes = (await response.arrayBuffer()).byteLength
    return { overflow: document.documentElement.scrollWidth - window.innerWidth, bytes }
  })
  expect(layout.overflow).toBeLessThanOrEqual(1)
  expect(layout.bytes).toBeGreaterThan(100_000)
})

test('安装资源缓存后可以离线刷新', async ({ page, context }) => {
  const workerState = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }))
    }
    return {
      controller: navigator.serviceWorker.controller?.scriptURL,
      scope: registration.scope,
      caches: await caches.keys(),
    }
  })
  expect(workerState.controller).toContain('/life-rpg-pwa/sw.js')
  expect(workerState.scope).toContain('/life-rpg-pwa/')
  expect(workerState.caches.length).toBeGreaterThan(0)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: '今天' })).toBeVisible()
  await context.setOffline(false)
})
