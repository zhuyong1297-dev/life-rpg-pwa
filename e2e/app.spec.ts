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
  await expect(page.locator('.hero-xp > b')).toHaveText('5 XP')
})

test('Boss 没有实际成果时不能完成', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('示例 Boss')
  await page.locator('.form-details summary').click()
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

test('三层时间习惯一键选层并在当天只补 XP 差额', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('示例分层习惯')
  await page.locator('.form-details summary').click()
  await page.getByLabel('难度').selectOption('普通')
  await page.getByRole('button', { name: '三层目标' }).click()
  await page.getByLabel('基础层（分钟）').fill('5')
  await page.getByLabel('标准层（分钟）').fill('20')
  await page.getByLabel('突破层（分钟）').fill('45')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByText(/基础 5分钟 · 标准 20分钟 · 突破 45分钟/)).toBeVisible()
  await page.getByRole('button', { name: '完成 示例分层习惯' }).click()
  await page.getByRole('button', { name: '选择 基础层' }).click()
  await expect(page.getByText('+6 XP', { exact: true })).toBeVisible()
  await expect(page.getByText('+5 金币', { exact: true })).toBeVisible()
  await expect(page.locator('.feedback-overlay')).toHaveClass(/condensed/)

  await page.getByRole('button', { name: '查看 示例分层习惯 完成记录' }).click({ force: true })
  await expect(page.getByRole('button', { name: '升级到 标准层' })).toContainText('再 +2 XP')
  await page.getByRole('button', { name: '升级到 标准层' }).click()
  await expect(page.getByText('+2 XP', { exact: true })).toBeVisible()
  await expect(page.getByText('+5 金币', { exact: true })).not.toBeVisible()
  await expect(page.locator('.feedback-overlay')).toHaveClass(/condensed/)

  await page.getByRole('button', { name: '查看 示例分层习惯 完成记录' }).click({ force: true })
  await page.getByRole('button', { name: '升级到 突破层' }).click()
  await page.getByRole('button', { name: '角色' }).click({ force: true })
  await expect(page.locator('.hero-xp > b')).toHaveText('10 XP')
  await expect(page.locator('.coin-balance strong')).toHaveText('5')
})

test('三层时间目标可使用秒并保持固定奖励', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('示例秒级习惯')
  await page.getByRole('button', { name: '三层目标' }).click()
  await page.getByRole('button', { name: '秒', exact: true }).click()
  await page.getByLabel('基础层（秒）').fill('30')
  await page.getByLabel('标准层（秒）').fill('60')
  await page.getByLabel('突破层（秒）').fill('90')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByText(/基础 30秒 · 标准 1分钟 · 突破 1分钟30秒/)).toBeVisible()
  await page.getByRole('button', { name: '完成 示例秒级习惯' }).click()
  await page.getByRole('button', { name: '选择 突破层' }).click()
  await expect(page.getByText('+5 XP', { exact: true })).toBeVisible()
  await expect(page.getByText('+2 金币', { exact: true })).toBeVisible()
})

test('高级组合目标支持每次时长、累计总量和复盘双汇总', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('示例组合习惯')
  await page.getByLabel('关键行为').check()
  await page.getByRole('button', { name: '三层目标' }).click()
  await page.getByRole('switch', { name: /高级设置/ }).check()
  await page.getByLabel('基础层次数').fill('3')
  await page.getByLabel('基础层每次时长（秒）').fill('30')
  await page.getByLabel('标准层次数').fill('5')
  await page.getByLabel('标准层每次时长（秒）').fill('30')
  await page.getByLabel('突破层次数').fill('5')
  await page.getByLabel('突破层每次时长（秒）').fill('45')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByText(/基础 3次 × 每次30秒 · 标准 5次 × 每次30秒 · 突破 5次 × 每次45秒/)).toBeVisible()
  await page.getByRole('button', { name: '完成 示例组合习惯' }).click()
  await page.getByRole('button', { name: '选择 标准层' }).click()
  await page.getByRole('button', { name: '复盘' }).click({ force: true })
  await expect(page.getByText('最低次数：5次')).toBeVisible()
  await expect(page.getByText('最低时间：2分钟30秒')).toBeVisible()

  await page.getByRole('button', { name: '今天' }).click()
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('示例累计习惯')
  await page.getByRole('button', { name: '三层目标' }).click()
  await page.getByRole('switch', { name: /高级设置/ }).check()
  await page.getByRole('button', { name: '累计总量' }).click()
  await page.getByLabel('基础层次数').fill('2')
  await page.getByLabel('基础层累计时间（秒）').fill('60')
  await page.getByLabel('标准层次数').fill('2')
  await page.getByLabel('标准层累计时间（秒）').fill('120')
  await page.getByLabel('突破层次数').fill('4')
  await page.getByLabel('突破层累计时间（秒）').fill('120')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByText(/基础 总计2次 · 累计1分钟 · 标准 总计2次 · 累计2分钟 · 突破 总计4次 · 累计2分钟/)).toBeVisible()
})

test('活动管理可以完整编辑习惯并转换为三层次数目标', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('示例次数习惯')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '设置' }).click()
  await page.getByTitle('编辑习惯').click()
  await page.getByLabel('习惯名称').fill('调整后的习惯')
  await page.getByLabel('属性').selectOption('创造')
  await page.getByLabel('难度').selectOption('困难')
  await page.getByLabel('频率').selectOption('weekly')
  await page.getByLabel('每周次数').fill('4')
  await page.getByRole('button', { name: '三层目标' }).click()
  await page.getByRole('button', { name: '按次数' }).click()
  await page.getByLabel('次数单位').fill('组')
  await page.getByLabel('基础层（组）').fill('1')
  await page.getByLabel('标准层（组）').fill('3')
  await page.getByLabel('突破层（组）').fill('5')
  await page.getByRole('button', { name: '保存修改' }).click()
  await expect(page.getByText('习惯已更新，历史完成和账本保持不变')).toBeVisible()
  await page.getByRole('button', { name: '今天' }).click()
  await expect(page.getByText('调整后的习惯', { exact: true })).toBeVisible()
  await expect(page.getByText(/创造 · 每周 4 次/)).toBeVisible()
  await expect(page.getByText(/基础 1组 · 标准 3组 · 突破 5组/)).toBeVisible()
})

test('已完成按钮可持久取消误触，取消需要二次确认', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('误触示例')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '完成 误触示例' }).click()
  await expect(page.locator('.feedback-overlay')).toHaveClass(/condensed/)
  await page.getByRole('button', { name: '查看 误触示例 完成记录' }).click({ force: true })
  await expect(page.getByRole('heading', { name: '完成记录' })).toBeVisible()
  await page.getByRole('button', { name: '取消今天的完成' }).click()
  await expect(page.getByText('确认取消今天的完成？')).toBeVisible()
  await page.getByRole('button', { name: '确认取消' }).click()
  await expect(page.getByText('今天的完成已取消，奖励已用修正流水抵消')).toBeVisible()
  await expect(page.getByRole('button', { name: '完成 误触示例' })).toBeVisible()
})

test('习惯归档保留历史并可从折叠区恢复', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('归档示例')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '完成 归档示例' }).click()
  await page.getByRole('button', { name: '设置' }).click({ force: true })
  const row = page.locator('.manage-row').filter({ hasText: '归档示例' })
  await row.getByTitle('归档习惯').click()
  await expect(page.getByText(/历史完成、奖励流水和复盘记录会保留/)).toBeVisible()
  await page.getByRole('button', { name: '确认归档' }).click()
  await expect(page.getByText('习惯已归档，历史记录仍然保留')).toBeVisible()
  await page.getByText('已归档（1）').click()
  await page.locator('.archived-row').filter({ hasText: '归档示例' }).getByRole('button', { name: '恢复' }).click()
  await expect(page.getByText('习惯已恢复')).toBeVisible()
  await expect(page.locator('.manage-row').filter({ hasText: '归档示例' }).getByTitle('编辑习惯')).toBeVisible()
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
