import { expect, test, type Page } from '@playwright/test'

async function createVisualActivity(page: Page, title: string, isKey = false) {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill(title)
  if (isKey) await page.getByLabel('关键行为').check()
  await page.getByRole('button', { name: '创建', exact: true }).click()
}

async function openApp(page: Page) {
  await page.goto('./')
  const wizard = page.getByRole('heading', { name: '建立六个成长领域' })
  const today = page.getByRole('heading', { name: '今天' })
  await Promise.race([wizard.waitFor(), today.waitFor()])
  if (await wizard.isVisible()) {
    await page.getByRole('button', { name: '启用新领域体系' }).click()
  }
  await expect(today).toBeVisible()
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
}

test('旧活动必须逐项确认后才进入 V4', async ({ page }, testInfo) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: '建立六个成长领域' })).toBeVisible()
  await page.evaluate(async () => {
    const request = indexedDB.open('earth-online-v2')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('activities', 'readwrite')
    transaction.objectStore('activities').put({
      id: 'legacy-writing', title: '旧体系写作', type: 'habit', attribute: '专注', difficulty: '普通',
      goal: { count: 1, unit: '次' }, schedule: { kind: 'daily' }, isKey: true, enabled: true,
      revision: 1, createdAt: '2026-07-20T08:00:00.000Z',
    })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  })
  await page.reload()
  const item = page.locator('.migration-item').filter({ hasText: '旧体系写作' })
  await expect(item).toContainText('旧属性：专注 · 建议：事业')
  await expect(page.getByRole('button', { name: '启用新领域体系' })).toBeDisabled()
  await item.getByRole('button', { name: /创作/ }).click()
  await expect(page.getByRole('button', { name: '启用新领域体系' })).toBeEnabled()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: `test-results/domain-migration-${testInfo.project.name}.png`, fullPage: true })
  await page.getByRole('button', { name: '启用新领域体系' }).click()
  await expect(page.getByRole('heading', { name: '今天' })).toBeVisible()
  const migratedCard = page.locator('.mission-card').filter({ hasText: '旧体系写作' })
  await expect(migratedCard).toContainText('创作')
  await expect(migratedCard).toContainText('每天')
})

test('代表性今天界面无溢出或反馈遮挡', async ({ page }, testInfo) => {
  await openApp(page)
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
  await openApp(page)
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('示例分层习惯')
  await page.getByRole('button', { name: '分层目标' }).click()
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
  await openApp(page)
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('示例操作习惯')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '完成 示例操作习惯' }).click()
  await expect(page.locator('.feedback-overlay')).toHaveClass(/condensed/)
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

test('高级组合目标在各视口可完整编辑', async ({ page }, testInfo) => {
  await openApp(page)
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByRole('button', { name: '分层目标' }).click()
  await page.getByRole('switch', { name: /高级设置/ }).check()
  await expect(page.getByLabel('基础层次数')).toBeVisible()
  await expect(page.getByLabel('突破层每次时长（秒）')).toBeVisible()
  const modal = page.locator('.modal')
  const bounds = await modal.boundingBox()
  const viewport = page.viewportSize()
  expect(bounds).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: `test-results/combined-goal-${testInfo.project.name}.png` })
})

test('三项关键行动和紧凑日常列表在各视口保持清晰', async ({ page }, testInfo) => {
  await openApp(page)
  await createVisualActivity(page, '清晨拉伸与肩颈活动，为全天工作做好准备', true)
  await createVisualActivity(page, '阅读专业书籍', true)
  await createVisualActivity(page, '完成当天最重要的工作成果', true)
  await createVisualActivity(page, '整理书桌')
  await createVisualActivity(page, '晚间散步')

  await expect(page.locator('.mission-card')).toHaveCount(3)
  await expect(page.locator('.activity-row')).toHaveCount(2)
  await expect(page.locator('.activity-row').first()).toContainText('健康 · 每天')
  await expect(page.locator('.activity-row').first()).toContainText('目标 1次')
  await expect(page.locator('.activity-row').first()).toContainText('+5 XP')
  const regularLayout = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.activity-row')].map((row) => {
    const action = row.querySelector<HTMLElement>('.complete-button')?.getBoundingClientRect()
    const content = row.querySelector<HTMLElement>('.activity-copy')?.getBoundingClientRect()
    return {
      actionWidth: action?.width,
      overlaps: Boolean(action && content && content.right > action.left && content.left < action.right),
      textOverflow: row.querySelector<HTMLElement>('.activity-goal') ? getComputedStyle(row.querySelector<HTMLElement>('.activity-goal')!).textOverflow : '',
    }
  }))
  expect(regularLayout).toEqual([
    { actionWidth: 48, overlaps: false, textOverflow: 'clip' },
    { actionWidth: 48, overlaps: false, textOverflow: 'clip' },
  ])
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: `test-results/today-populated-${testInfo.project.name}.png`, fullPage: true })
})

test('创建、角色、复盘、设置和编辑界面在各视口完整可见', async ({ page }, testInfo) => {
  await openApp(page)
  await page.getByRole('button', { name: '创建行动' }).click()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: `test-results/create-${testInfo.project.name}.png` })
  await page.getByLabel('名称').fill('匿名关键行为')
  await page.getByLabel('关键行为').check()
  await page.getByRole('button', { name: '创建', exact: true }).click()

  await page.getByRole('button', { name: '角色' }).click()
  await expectNoHorizontalOverflow(page)
  await expect(page.locator('.milestone-row')).toHaveCount(0)
  await page.getByRole('button', { name: '查看等级奖励路线' }).click()
  await expect(page.locator('.milestone-row').filter({ hasText: 'Lv.3 · 30 金币档礼券' })).toBeVisible()
  await expect(page.locator('.milestone-row').filter({ hasText: 'Lv.6 · 80 金币档礼券' })).toBeVisible()
  await expect(page.locator('.milestone-row').filter({ hasText: 'Lv.10 · 200 金币档礼券' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: `test-results/reward-route-${testInfo.project.name}.png` })
  await page.getByRole('dialog', { name: '等级奖励路线' }).getByRole('button', { name: '关闭', exact: true }).click()
  const heroLayout = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect()
    const overlaps = (left?: DOMRect, right?: DOMRect) => Boolean(
      left && right && left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top,
    )
    const portrait = rect('.character-portrait-wrap .traveler-portrait')
    const stage = rect('.stage-badge')
    const level = rect('.character-level-line > div:first-child')
    const coins = rect('.coin-balance')
    const routeSummary = rect('.reward-route-summary')
    const shopSummary = rect('.shop-summary')
    return {
      stageOverlapsPortrait: overlaps(stage, portrait),
      levelOverlapsCoins: overlaps(level, coins),
      routeSummaryHeight: routeSummary?.height,
      shopSummaryHeight: shopSummary?.height,
    }
  })
  expect(heroLayout).toMatchObject({ stageOverlapsPortrait: false, levelOverlapsCoins: false, routeSummaryHeight: 88, shopSummaryHeight: 104 })
  await page.screenshot({ path: `test-results/character-${testInfo.project.name}.png`, fullPage: true })

  await page.getByRole('button', { name: '复盘' }).click()
  await expect(page.getByRole('heading', { name: '每周复盘' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: `test-results/review-${testInfo.project.name}.png`, fullPage: true })

  await page.getByRole('button', { name: '设置' }).click()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: `test-results/settings-${testInfo.project.name}.png`, fullPage: true })
  await page.getByRole('button', { name: '管理全部活动' }).click()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: `test-results/activity-manager-${testInfo.project.name}.png` })
  const managedRow = page.locator('.activity-manager-row').filter({ hasText: '匿名关键行为' })
  await managedRow.getByRole('button', { name: /匿名关键行为/ }).click()
  await managedRow.getByRole('button', { name: '编辑' }).click()
  await expect(page.getByRole('heading', { name: '编辑习惯' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: `test-results/edit-${testInfo.project.name}.png` })
})

test('旅程、商店和商品编辑弹层在各视口保持紧凑', async ({ page }, testInfo) => {
  await openApp(page)
  await createVisualActivity(page, '用于旅程章节的示例行动')
  await page.getByRole('button', { name: '完成 用于旅程章节的示例行动' }).click()
  await page.getByRole('button', { name: '角色' }).click()

  await page.getByRole('button', { name: '查看奖励商店' }).click()
  await page.getByRole('button', { name: /全部 3/ }).click()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: `test-results/reward-shop-${testInfo.project.name}.png` })
  await page.getByTitle('新增奖励商品').click()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: `test-results/reward-editor-${testInfo.project.name}.png` })
  await page.locator('.nested-modal').getByRole('button', { name: '关闭', exact: true }).click()
  await page.locator('.shop-modal').getByRole('button', { name: '关闭', exact: true }).click()

  await page.getByRole('button', { name: '行动日志' }).click()
  await expect(page.locator('.action-log-modal')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: `test-results/journey-${testInfo.project.name}.png` })
})
