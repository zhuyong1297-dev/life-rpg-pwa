import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  const wizard = page.getByRole('heading', { name: '建立六个成长领域' })
  const today = page.getByRole('heading', { name: '今天' })
  await Promise.race([wizard.waitFor(), today.waitFor()])
  if (await wizard.isVisible()) {
    await page.getByRole('button', { name: '启用新领域体系' }).click()
  }
  await expect(today).toBeVisible()
})

async function openActivityManager(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '设置' }).click()
  await page.getByRole('button', { name: '管理全部活动' }).click()
  await expect(page.getByRole('dialog', { name: '活动管理' })).toBeVisible()
}

async function expandManagedActivity(page: import('@playwright/test').Page, title: string) {
  const row = page.locator('.activity-manager-row').filter({ hasText: title })
  await row.getByRole('button', { name: new RegExp(title) }).click()
  return row
}

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

test('目标规划器使用二级地址、自动恢复草稿并支持浏览器返回', async ({ page }) => {
  await page.getByRole('button', { name: '规划一个 28 天目标' }).click()
  await expect(page).toHaveURL(/#\/coach\/plan$/)
  await expect(page.getByRole('heading', { name: '目标规划器' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '主导航' })).toHaveCount(0)
  await page.getByLabel('成长主题').fill('建立一个可以长期坚持的现实目标')
  await page.getByLabel('开始状态').fill('目前目标模糊，行为容易被临时事项替代')
  await page.getByLabel('期望结果').fill('每天知道真正应该推进的行动')
  await page.getByLabel('可验证成功标准').fill('28 天内至少 20 天完成基础行为，并留下现实成果')
  await page.waitForTimeout(500)
  await page.reload()
  await expect(page.getByLabel('成长主题')).toHaveValue('建立一个可以长期坚持的现实目标')
  await page.getByRole('button', { name: '返回' }).click()
  await expect(page.getByRole('heading', { name: '今天' })).toBeVisible()
  await page.getByRole('button', { name: '继续规划' }).click()
  await page.goBack()
  await expect(page.getByRole('heading', { name: '今天' })).toBeVisible()
})

test('四步规划可以创建行为并原子启动 28 天赛季', async ({ page }) => {
  await page.getByRole('button', { name: '规划一个 28 天目标' }).click()
  await page.getByLabel('成长主题').fill('稳定推进现实项目')
  await page.getByLabel('开始状态').fill('经常在开始前切换目标')
  await page.getByLabel('期望结果').fill('每天完成一段不切换目标的工作')
  await page.getByLabel('可验证成功标准').fill('28 天内至少 20 天完成核心行为')
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: /^推进/ }).click()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByLabel('行为名称').fill('推进一个现实结果')
  await page.getByLabel('触发条件').fill('第一段正式工作开始前')
  await page.getByLabel('执行协议').fill('写下一个结果和下一动作，然后只推进这一件事')
  await page.getByRole('button', { name: '确认这个行为' }).click()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByText('状态较差时，我仍能完成基础层').click()
  await page.getByText('这些行为会推动成功标准').click()
  await page.getByRole('button', { name: '启动 28 天赛季' }).click()
  await expect(page.getByRole('heading', { name: '今天' })).toBeVisible()
  await expect(page.getByRole('button', { name: '管理当前成长赛季' })).toContainText('稳定推进现实项目')
  await expect(page.getByRole('article').filter({ hasText: '推进一个现实结果' })).toBeVisible()
})

test('存在当前赛季时规划器只保存下个赛季方案', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('当前赛季行为')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '开始 28 天成长赛季' }).click()
  await page.getByLabel('成长主题').fill('当前现实目标')
  await page.getByLabel('可验证的成功标准').fill('当前赛季保持原样')
  await page.getByLabel('开始状态').fill('已经开始执行当前计划')
  await page.getByLabel('期望结果').fill('完成当前赛季后再切换目标')
  await page.getByRole('checkbox', { name: /当前赛季行为/ }).check()
  await page.getByRole('button', { name: '开始赛季' }).click()
  await page.getByRole('dialog').getByTitle('关闭').click()

  await page.getByRole('button', { name: '规划下个赛季' }).click()
  await page.getByLabel('成长主题').fill('下个现实目标')
  await page.getByLabel('开始状态').fill('等待当前赛季结束后再开始')
  await page.getByLabel('期望结果').fill('下个赛季有清晰可执行的行动')
  await page.getByLabel('可验证成功标准').fill('28 天内至少 20 天完成基础行为')
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '维护/收尾 维持环境或完成收尾' }).click()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByLabel('行为名称').fill('下个赛季的新行为')
  await page.getByLabel('触发条件').fill('每天结束前')
  await page.getByLabel('执行协议').fill('完成一个可验证的最小动作')
  await page.getByRole('button', { name: '确认这个行为' }).click()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByText('状态较差时，我仍能完成基础层').click()
  await page.getByText('这些行为会推动成功标准').click()
  await page.getByRole('button', { name: '保存为下个赛季' }).click()

  await expect(page.getByRole('heading', { name: '今天' })).toBeVisible()
  await expect(page.getByRole('button', { name: '管理当前成长赛季' })).toContainText('当前现实目标')
  await expect(page.getByRole('button', { name: '下个赛季已规划' })).toBeVisible()
  await expect(page.getByText('下个赛季的新行为', { exact: true })).toHaveCount(0)

  const state = await page.evaluate(async () => {
    const request = indexedDB.open('earth-online-v2')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction(['activities', 'seasons', 'ledgerEvents', 'settings'], 'readonly')
    const readAll = <T,>(storeName: string) => new Promise<T[]>((resolve, reject) => {
      const read = transaction.objectStore(storeName).getAll()
      read.onsuccess = () => resolve(read.result as T[])
      read.onerror = () => reject(read.error)
    })
    const [activities, seasons, ledgerEvents, settings] = await Promise.all([
      readAll<Record<string, unknown>>('activities'),
      readAll<Record<string, unknown>>('seasons'),
      readAll<Record<string, unknown>>('ledgerEvents'),
      readAll<Record<string, unknown>>('settings'),
    ])
    database.close()
    return {
      activityCount: activities.length,
      keyActivityCount: activities.filter((activity) => activity.isKey).length,
      seasonCount: seasons.length,
      activeSeasonTitle: seasons.find((season) => season.status === 'active')?.title,
      ledgerCount: ledgerEvents.length,
      draftStatus: settings.find((setting) => setting.key === 'coachPlanDraft')?.value
        && (settings.find((setting) => setting.key === 'coachPlanDraft')?.value as Record<string, unknown>).status,
    }
  })
  expect(state).toEqual({
    activityCount: 1,
    keyActivityCount: 0,
    seasonCount: 1,
    activeSeasonTitle: '当前现实目标',
    ledgerCount: 0,
    draftStatus: 'ready',
  })
})

test('三层时间习惯一键选层并在当天只补 XP 差额', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('示例分层习惯')
  await page.locator('.form-details summary').click()
  await page.getByLabel('难度').selectOption('普通')
  await page.getByRole('button', { name: '分层目标' }).click()
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
  await page.getByRole('button', { name: '分层目标' }).click()
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

test('两层习惯只显示基础和标准，标准层获得完整 XP', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('两层阅读')
  await page.getByRole('button', { name: '分层目标' }).click()
  await page.getByRole('button', { name: '两层' }).click()
  await page.getByLabel('基础层（分钟）').fill('10')
  await page.getByLabel('标准层（分钟）').fill('30')
  await expect(page.getByLabel('突破层（分钟）')).toHaveCount(0)
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByText(/基础 10分钟 · 标准 30分钟/)).toBeVisible()
  await page.getByRole('button', { name: '完成 两层阅读' }).click()
  await page.getByRole('button', { name: '选择 基础层' }).click()
  await page.getByRole('button', { name: '查看 两层阅读 完成记录' }).click({ force: true })
  await expect(page.getByRole('button', { name: '升级到 标准层' })).toContainText('再 +2 XP')
  await expect(page.getByRole('button', { name: '升级到 突破层' })).toHaveCount(0)
})

test('高级组合目标支持每次时长、累计总量和复盘双汇总', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('示例组合习惯')
  await page.getByLabel('关键行为').check()
  await page.getByRole('button', { name: '分层目标' }).click()
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
  await page.getByRole('button', { name: '分层目标' }).click()
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

test('每周次数目标可以连续记录、跨层发奖并撤销最近一次', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('每周写作')
  await page.getByLabel('频率').selectOption('weekly')
  await page.getByRole('button', { name: '分层目标' }).click()
  await page.getByRole('button', { name: '按次数' }).click()
  await page.getByLabel('基础层（次）').fill('1')
  await page.getByLabel('标准层（次）').fill('3')
  await page.getByLabel('突破层（次）').fill('5')
  await page.getByRole('button', { name: '逐次累计' }).click()
  await expect(page.getByLabel('每周次数')).toHaveValue('3')
  await expect(page.getByLabel('每周次数')).toBeDisabled()
  await page.getByRole('button', { name: '创建', exact: true }).click()

  const row = page.locator('.weekly-progress-item').filter({ hasText: '每周写作' })
  const record = row.getByRole('button', { name: '记录一次' })
  await record.click()
  await expect(page.getByText('+3 XP', { exact: true })).toBeVisible()
  await record.click({ force: true })
  await expect(page.getByText('进度已记录', { exact: true })).toBeVisible()
  await expect(page.getByText('+0 XP', { exact: true })).toHaveCount(0)
  await record.click({ force: true })
  await expect(page.getByText('+1 XP', { exact: true })).toBeVisible()
  await expect(row.locator('.weekly-progress-copy')).toContainText(/距离突破层：3\/5次/)

  await row.getByRole('button', { name: '详情' }).click({ force: true })
  await expect(page.getByRole('heading', { name: '每周写作' })).toBeVisible()
  await page.getByRole('button', { name: '撤销最近一次' }).click()
  await page.getByRole('button', { name: '确认撤销' }).click()
  await expect(page.locator('.weekly-progress-hero')).toContainText(/距离标准层：2\/3次/)
})

test('旧式每周分层目标继续打开层次选择器', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('每周直接选层')
  await page.getByLabel('频率').selectOption('weekly')
  await page.getByRole('button', { name: '分层目标' }).click()
  await page.getByRole('button', { name: '按次数' }).click()
  await page.getByLabel('基础层（次）').fill('1')
  await page.getByLabel('标准层（次）').fill('3')
  await page.getByLabel('突破层（次）').fill('5')
  await page.getByRole('button', { name: '创建', exact: true }).click()

  const row = page.locator('.weekly-progress-item').filter({ hasText: '每周直接选层' })
  await row.getByRole('button', { name: '选择层次' }).click()
  await expect(page.getByRole('heading', { name: '每周直接选层' })).toBeVisible()
  await page.getByRole('button', { name: '选择 基础层' }).click()
  await expect(page.getByText('+3 XP', { exact: true })).toBeVisible()
  await expect(row).toContainText('本周 1/3 次')
})

test('组合累计目标先选择预设时长，打开弹层不会写入进度', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('每周训练')
  await page.getByLabel('频率').selectOption('weekly')
  await page.getByRole('button', { name: '分层目标' }).click()
  await page.getByRole('switch', { name: /高级设置/ }).check()
  await page.getByLabel('基础层次数').fill('1')
  await page.getByLabel('基础层每次时长（秒）').fill('10')
  await page.getByLabel('标准层次数').fill('3')
  await page.getByLabel('标准层每次时长（秒）').fill('20')
  await page.getByLabel('突破层次数').fill('5')
  await page.getByLabel('突破层每次时长（秒）').fill('30')
  await page.getByRole('button', { name: '逐次累计' }).click()
  await page.getByLabel('默认时长（秒）').fill('30')
  await page.getByLabel('备用 1（秒）').fill('10')
  await page.getByRole('button', { name: '创建', exact: true }).click()

  const row = page.locator('.weekly-progress-item').filter({ hasText: '每周训练' })
  await row.getByRole('button', { name: '选择时长' }).click()
  const picker = page.getByRole('dialog', { name: '每周训练' })
  await expect(picker).toBeVisible()
  await expect(picker).toContainText('本周已记录 0 次')
  await picker.getByRole('button', { name: '关闭' }).click()
  await row.getByRole('button', { name: '详情' }).click()
  await expect(page.getByText('本周还没有记录')).toBeVisible()
  await page.getByRole('button', { name: '关闭', exact: true }).click()

  await row.getByRole('button', { name: '选择时长' }).click()
  await page.getByRole('button', { name: /30秒.*常用/ }).click()
  await expect(page.getByText('+3 XP', { exact: true })).toBeVisible()
  await row.getByRole('button', { name: '选择时长' }).click({ force: true })
  await page.getByRole('button', { name: '10秒', exact: true }).click()
  await expect(row.locator('.weekly-progress-copy')).toContainText(/标准层：1\/3 次达到每次 20秒/)
})

test('首页按每日与本周分组，关键周行动双处展示但共享同一进度', async ({ page }) => {
  const createWeekly = async (title: string, key = false) => {
    await page.getByRole('button', { name: '创建行动' }).click()
    await page.getByLabel('名称').fill(title)
    await page.getByLabel('频率').selectOption('weekly')
    await page.getByRole('button', { name: '分层目标' }).click()
    await page.getByRole('button', { name: '按次数' }).click()
    await page.getByLabel('基础层（次）').fill('1')
    await page.getByLabel('标准层（次）').fill('3')
    await page.getByLabel('突破层（次）').fill('5')
    await page.getByRole('button', { name: '逐次累计' }).click()
    if (key) await page.getByLabel('关键行为').check()
    await page.getByRole('button', { name: '创建', exact: true }).click()
  }

  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('每日整理')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await createWeekly('关键周练习', true)
  await createWeekly('周练习二')
  await createWeekly('周练习三')
  await createWeekly('周练习四')

  await expect(page.getByRole('heading', { name: '每日行动' })).toBeVisible()
  await expect(page.locator('.activity-row').filter({ hasText: '每日整理' })).toBeVisible()
  await expect(page.locator('.weekly-key-card').filter({ hasText: '关键周练习' })).toBeVisible()
  const weeklySection = page.locator('.weekly-progress-section')
  await expect(weeklySection.locator('.weekly-progress-item')).toHaveCount(3)
  await expect(weeklySection.locator('.weekly-progress-item').first()).toContainText('关键周练习')
  await expect(weeklySection.getByRole('button', { name: '查看全部 4 项' })).toBeVisible()

  await page.locator('.weekly-key-card').filter({ hasText: '关键周练习' }).getByRole('button', { name: '记录一次' }).click()
  await expect(weeklySection.locator('.weekly-progress-item').filter({ hasText: '关键周练习' })).toContainText('本周 1/5次')
  await weeklySection.getByRole('button', { name: '查看全部 4 项' }).click()
  const allWeekly = page.getByRole('dialog', { name: '本周进度' })
  await expect(allWeekly.locator('.weekly-progress-item')).toHaveCount(4)
  await expect(allWeekly).toContainText('周练习四')
})

test('活动管理可以完整编辑习惯并转换为三层次数目标', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('示例次数习惯')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await openActivityManager(page)
  const row = await expandManagedActivity(page, '示例次数习惯')
  await row.getByRole('button', { name: '编辑' }).click()
  await page.getByLabel('习惯名称').fill('调整后的习惯')
  await page.getByLabel('成长领域').selectOption('creation')
  await page.getByLabel('难度').selectOption('困难')
  await page.getByLabel('频率').selectOption('weekly')
  await page.getByLabel('每周次数').fill('4')
  await page.getByRole('button', { name: '分层目标' }).click()
  await page.getByRole('button', { name: '按次数' }).click()
  await page.getByLabel('次数单位').fill('组')
  await page.getByLabel('基础层（组）').fill('1')
  await page.getByLabel('标准层（组）').fill('3')
  await page.getByLabel('突破层（组）').fill('5')
  await page.getByRole('button', { name: '保存修改' }).click()
  await expect(page.getByText('习惯已更新，历史完成和账本保持不变')).toBeVisible()
  await page.getByRole('button', { name: '今天' }).click()
  await expect(page.getByText('调整后的习惯', { exact: true })).toBeVisible()
  const weeklyRow = page.locator('.weekly-progress-item').filter({ hasText: '调整后的习惯' })
  await expect(weeklyRow).toContainText('本周 0/4 次')
  await weeklyRow.getByRole('button', { name: '详情' }).click()
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

test('一次性任务完成当日保留，下一游戏日退出今天并进入已完成任务区', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByRole('button', { name: '一次性任务' }).click()
  await page.getByLabel('名称').fill('阶段性任务')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '完成 阶段性任务' }).click()
  await expect(page.getByRole('button', { name: '查看 阶段性任务 完成记录' })).toBeVisible()

  await page.evaluate(async () => {
    const request = indexedDB.open('earth-online-v2')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('completions', 'readwrite')
    const store = transaction.objectStore('completions')
    const rows = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const read = store.getAll()
      read.onsuccess = () => resolve(read.result)
      read.onerror = () => reject(read.error)
    })
    const row = rows.find((item) => item.titleSnapshot === '阶段性任务')
    if (!row) throw new Error('找不到测试任务完成')
    store.put({ ...row, occurredOn: '2000-01-01' })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  })
  await page.reload()
  await expect(page.getByText('阶段性任务')).toHaveCount(0)
  await openActivityManager(page)
  await page.getByRole('button', { name: /已完成\s*1/ }).click()
  const row = await expandManagedActivity(page, '阶段性任务')
  await expect(row).toContainText(/1\/1 完成/)
})

test('历史完成过的习惯在新游戏日仍显示，只有一次性任务退出今天', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('跨日习惯')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '完成 跨日习惯' }).click()

  await page.evaluate(async () => {
    const request = indexedDB.open('earth-online-v2')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('completions', 'readwrite')
    const store = transaction.objectStore('completions')
    const rows = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const read = store.getAll()
      read.onsuccess = () => resolve(read.result)
      read.onerror = () => reject(read.error)
    })
    const row = rows.find((item) => item.titleSnapshot === '跨日习惯')
    if (!row) throw new Error('找不到测试习惯完成')
    store.put({ ...row, occurredOn: '2000-01-01' })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  })

  await page.reload()
  await expect(page.getByText('跨日习惯', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '完成 跨日习惯' })).toBeVisible()
})

test('活动管理弹层可以归档并恢复习惯', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('归档示例')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '完成 归档示例' }).click()
  await openActivityManager(page)
  const row = await expandManagedActivity(page, '归档示例')
  await row.getByRole('button', { name: '归档', exact: true }).click()
  await expect(page.getByText(/历史完成、奖励流水和复盘记录会保留/)).toBeVisible()
  await page.getByRole('button', { name: '确认归档' }).click()
  await expect(page.getByText('活动已归档，历史记录仍然保留')).toBeVisible()
  await page.getByRole('button', { name: /已归档\s*1/ }).click()
  const archivedRow = await expandManagedActivity(page, '归档示例')
  await expect(archivedRow.getByRole('button', { name: '永久删除' })).toBeDisabled()
  await expect(archivedRow).toContainText('本日结算后可永久删除')
  await archivedRow.getByRole('button', { name: '恢复' }).click()
  await expect(page.getByText('活动已恢复')).toBeVisible()
  await page.getByRole('button', { name: /进行中\s*1/ }).click()
  await expect(page.locator('.activity-manager-row').filter({ hasText: '归档示例' })).toBeVisible()
})

test('归档活动可永久删除定义且需要二次确认', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('待移除示例')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await openActivityManager(page)
  const row = await expandManagedActivity(page, '待移除示例')
  await row.getByRole('button', { name: '归档', exact: true }).click()
  await page.getByRole('button', { name: '确认归档' }).click()
  await page.getByRole('button', { name: /已归档\s*1/ }).click()
  const archivedRow = await expandManagedActivity(page, '待移除示例')
  await archivedRow.getByRole('button', { name: '永久删除' }).click()
  await expect(page.getByRole('heading', { name: '永久删除活动定义' })).toBeVisible()
  await expect(page.getByText(/XP、金币、完成记录、行动日志和复盘会永久保留/)).toBeVisible()
  await page.getByRole('button', { name: '确认永久删除' }).click()
  await expect(page.getByText('活动定义已删除，成长历史和角色数值保持不变')).toBeVisible()
  await expect(page.locator('.activity-manager-row').filter({ hasText: '待移除示例' })).toHaveCount(0)
})

test('活动摘要固定高度，超过八项后管理器提供搜索', async ({ page }) => {
  for (let index = 1; index <= 9; index += 1) {
    await page.getByRole('button', { name: '创建行动' }).click()
    await page.getByLabel('名称').fill(`批量行动 ${index}`)
    await page.getByRole('button', { name: '创建', exact: true }).click()
  }
  await page.getByRole('button', { name: '设置' }).click()
  await expect(page.locator('.activity-management-summary')).toHaveCSS('height', '100px')
  await page.getByRole('button', { name: '管理全部活动' }).click()
  await page.getByLabel('搜索活动').fill('批量行动 9')
  await expect(page.locator('.activity-manager-row')).toHaveCount(1)
  await expect(page.locator('.activity-manager-row')).toContainText('批量行动 9')
})

test('28 天赛季生成透明建议并沉淀为可复用策略', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('赛季核心习惯')
  await page.getByRole('button', { name: '创建', exact: true }).click()

  await page.getByRole('button', { name: '开始 28 天成长赛季' }).click()
  await page.getByLabel('成长主题').fill('改善专注')
  await page.getByLabel('可验证的成功标准').fill('能连续完成一段无干扰工作')
  await page.getByLabel('开始状态').fill('容易被消息打断')
  await page.getByLabel('期望结果').fill('每天完成一次专注工作')
  await page.getByRole('checkbox', { name: /赛季核心习惯/ }).check()
  await page.getByRole('button', { name: '开始赛季' }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: '改善专注' })).toBeVisible()
  await expect(page.getByText('每天完成一次专注工作')).toBeVisible()
  await page.screenshot({ path: `test-results/season-overview-${testInfo.project.name}.png` })
  await page.getByRole('dialog').getByTitle('关闭').click()

  await page.getByRole('button', { name: '复盘' }).click()
  await page.getByRole('button', { name: '现实帮助 1 分' }).click()
  await page.getByRole('button', { name: '执行阻力 5 分' }).click()
  await page.getByRole('button', { name: '保存本周复盘' }).click()
  await expect(page.getByText('本周复盘已保存，生成 1 条透明建议')).toBeVisible()
  await page.getByRole('button', { name: '查看依据' }).click()
  await expect(page.getByText('本周坚持率 0%，现实帮助 1/5，执行阻力 5/5。')).toBeVisible()
  await page.getByRole('button', { name: '修改后接受' }).click()
  await page.getByLabel('你准备怎样调整？').fill('把基础层降低为十分钟，并放到早餐后执行')
  await page.getByRole('button', { name: '确认调整后接受' }).click()
  await expect(page.getByText(/已记录，活动仍需由你手动调整/)).toBeVisible()
  await expect(page.getByText(/调整后接受：把基础层降低为十分钟/)).toBeVisible()
  await page.screenshot({ path: `test-results/coach-suggestion-${testInfo.project.name}.png` })

  await page.evaluate(async () => {
    const request = indexedDB.open('earth-online-v2')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('seasons', 'readwrite')
    const store = transaction.objectStore('seasons')
    const seasons = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const read = store.getAll()
      read.onsuccess = () => resolve(read.result)
      read.onerror = () => reject(read.error)
    })
    const season = seasons.find((item) => item.status === 'active')
    if (!season || typeof season.startsOn !== 'string') throw new Error('找不到进行中的测试赛季')
    const end = season.startsOn
    const start = new Date(`${end}T12:00:00`)
    start.setDate(start.getDate() - 27)
    store.put({ ...season, startsOn: start.toISOString().slice(0, 10), endsOn: end })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  })
  await page.reload()
  await page.getByRole('button', { name: '今天' }).click()
  const seasonButton = page.getByRole('button', { name: '管理当前成长赛季' })
  await expect(seasonButton).toBeVisible()
  await seasonButton.click()
  await page.getByRole('button', { name: '结束赛季' }).click()
  await page.getByRole('button', { name: '达成', exact: true }).click()
  await page.getByLabel('现实证据').fill('本周已经完成一段无干扰工作，并能说明有效的执行时机。')
  await page.getByRole('button', { name: '保存赛季结论' }).click()
  await expect(page.getByText('赛季结论已进入个人策略库')).toBeVisible()
  await expect(page.getByRole('heading', { name: '个人策略库' })).toBeVisible()
  await expect(page.locator('.strategy-card').filter({ hasText: '改善专注' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: `test-results/strategy-library-${testInfo.project.name}.png` })
})

test('赛季前 3 天可启用稳定生活蓝图并记录现实状态', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('原核心行为')
  await page.getByLabel('关键行为').check()
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '开始 28 天成长赛季' }).click()
  await page.getByLabel('成长主题').fill('生活校准')
  await page.getByLabel('可验证的成功标准').fill('生活逐步稳定')
  await page.getByLabel('开始状态').fill('早晨能量较低')
  await page.getByLabel('期望结果').fill('形成平静而可掌控的节奏')
  await page.getByRole('checkbox', { name: /原核心行为/ }).check()
  await page.getByRole('button', { name: '开始赛季' }).click()

  await page.getByRole('button', { name: '校准这个赛季' }).click()
  await expect(page.getByRole('heading', { name: '用现实结果重新对齐核心行为' })).toBeVisible()
  await expect(page.locator('.blueprint-list article')).toHaveCount(3)
  await expect(page.getByText('晨间唤醒', { exact: true })).toBeVisible()
  await expect(page.getByText('单点开工', { exact: true })).toBeVisible()
  await expect(page.getByText('夜间收尾', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '启用稳定生活方案' }).click()
  await expect(page.getByText('稳定生活方案已启用，今天重新作为第 1 天')).toBeVisible()
  await expect(page.getByRole('dialog').getByText('三项核心行为各完成基础层至少 20 天', { exact: false })).toBeVisible()
  await page.getByRole('dialog').getByTitle('关闭').click()

  await expect(page.locator('.mission-card')).toHaveCount(3)
  await expect(page.locator('.mission-card').filter({ hasText: '晨间唤醒' })).toContainText('基础 2分钟 · 标准 5分钟')
  await expect(page.locator('.activity-row').filter({ hasText: '原核心行为' })).toBeVisible()
  await page.locator('.mission-card').filter({ hasText: '单点开工' }).locator('summary').click()
  await expect(page.getByText(/其他想法只记到纸上/)).toBeVisible()

  await page.getByRole('button', { name: '管理当前成长赛季' }).click()
  await page.getByRole('button', { name: '记录今日状态' }).click()
  await page.locator('.daily-signal-editor').getByRole('button', { name: '是', exact: true }).click()
  await page.getByRole('group', { name: '晨间精力' }).getByRole('button', { name: '4' }).click()
  await page.getByRole('group', { name: '生活掌控感' }).getByRole('button', { name: '3' }).click()
  await page.getByRole('button', { name: '保存今日状态' }).click()
  await expect(page.getByText('今日现实状态已保存，不影响 XP 或金币')).toBeVisible()
  await expect(page.locator('.season-evidence-grid')).toContainText('1/1')
  await expect(page.locator('.season-evidence-grid')).toContainText('4.0/5')
  await page.getByRole('dialog').getByTitle('关闭').click()
  await expect(page.getByRole('button', { name: '管理当前成长赛季' })).toContainText('状态已记录')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: `test-results/stable-life-${testInfo.project.name}.png`, fullPage: true })
})

test('schema 7 旧赛季缺少每日状态字段时仍可打开', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('旧赛季行为')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '开始 28 天成长赛季' }).click()
  await page.getByLabel('成长主题').fill('旧版赛季')
  await page.getByLabel('可验证的成功标准').fill('应用能够继续打开')
  await page.getByLabel('开始状态').fill('尚未记录状态')
  await page.getByLabel('期望结果').fill('旧数据自动兼容')
  await page.getByRole('checkbox', { name: /旧赛季行为/ }).check()
  await page.getByRole('button', { name: '开始赛季' }).click()
  await page.evaluate(async () => {
    const request = indexedDB.open('earth-online-v2')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('seasons', 'readwrite')
    const store = transaction.objectStore('seasons')
    const seasons = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
      const getAll = store.getAll()
      getAll.onsuccess = () => resolve(getAll.result)
      getAll.onerror = () => reject(getAll.error)
    })
    const legacySeason = { ...seasons[0] }
    delete legacySeason.dailySignals
    store.put(legacySeason)
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  })

  await page.reload()
  await expect(page.getByRole('heading', { name: '今天' })).toBeVisible()
  await page.getByRole('button', { name: '管理当前成长赛季' }).click()
  await page.getByRole('button', { name: '记录今日状态' }).click()
  await expect(page.getByRole('heading', { name: '记录今天的现实状态' })).toBeVisible()
})

test('奖励愿望支持二级页面、新增编辑、目标和停用恢复', async ({ page }) => {
  await page.getByRole('button', { name: '角色' }).click()
  await expect(page.locator('.shop-summary')).toBeVisible()
  await page.getByRole('button', { name: '查看奖励愿望' }).click()
  await expect(page).toHaveURL(/#\/rewards$/)
  await page.getByTitle('新增愿望').click()
  await page.locator('.wish-image-field input').setInputFiles('public/app-icon.png')
  await expect(page.locator('.wish-image-field img')).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await page.getByLabel('名称').fill('周末电影')
  await page.getByLabel('为什么期待它').fill('完整看完一部真正期待的电影')
  await page.getByLabel('预计成本（元）').fill('20')
  await page.getByLabel('设为主目标').check()
  await page.getByRole('button', { name: '保存愿望' }).click()

  await expect(page.locator('.primary-wish')).toContainText('周末电影')
  await page.getByRole('button', { name: '返回' }).click()
  await expect(page.locator('.shop-summary')).toContainText('周末电影')
  await page.getByRole('button', { name: '今天' }).click()
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('赚取目标金币')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '完成 赚取目标金币' }).click()
  await expect(page.locator('.feedback-overlay')).toContainText('距离「周末电影」还差 28 金币')
  await page.getByRole('button', { name: '角色' }).click()
  await page.getByRole('button', { name: '查看奖励愿望' }).click()
  await page.getByRole('button', { name: '愿望', exact: true }).click()
  const createdAgain = page.locator('.wish-row').filter({ hasText: '周末电影' })
  await createdAgain.getByTitle('编辑愿望').click()
  await page.getByLabel('名称').fill('周末电影之夜')
  await page.getByLabel('金币价格').fill('80')
  await page.getByRole('button', { name: '保存愿望' }).click()
  const edited = page.locator('.wish-row').filter({ hasText: '周末电影之夜' })
  await expect(edited).toContainText('80')

  await edited.getByTitle('停用愿望').click()
  const disabled = page.locator('.wish-row').filter({ hasText: '周末电影之夜' })
  await expect(disabled).toContainText('已停用')
  await disabled.getByTitle('恢复愿望').click()
  await expect(page.locator('.wish-row').filter({ hasText: '周末电影之夜' })).toBeVisible()
  await page.getByRole('button', { name: '返回' }).click()
  await expect(page.locator('.shop-summary')).toContainText('选择一个真正期待的愿望')
})

test('愿望可以锁定为奖励券并用两次点击完成轻复盘', async ({ page }) => {
  await page.getByRole('button', { name: '角色' }).click()
  await page.getByRole('button', { name: '查看奖励愿望' }).click()
  await page.getByTitle('新增愿望').click()
  await page.getByLabel('名称').fill('安静看一部电影')
  await page.getByLabel('为什么期待它').fill('给注意力一次完整而愉快的休息')
  await page.getByLabel('金币价格').fill('2')
  await page.getByLabel('预计成本（元）').fill('0')
  await page.getByLabel('设为主目标').check()
  await page.getByRole('button', { name: '保存愿望' }).click()
  await page.getByRole('button', { name: '返回' }).click()
  await page.getByRole('button', { name: '今天' }).click()
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('赚取愿望金币')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '完成 赚取愿望金币' }).click()
  await page.getByRole('button', { name: '角色' }).click()
  await page.getByRole('button', { name: '查看奖励愿望' }).click()
  await page.getByRole('button', { name: '锁定奖励' }).click()
  await page.getByRole('button', { name: '确认锁定' }).click()
  await expect(page.locator('.claim-card')).toContainText('安静看一部电影')
  await page.getByRole('button', { name: '已经享用' }).click()
  await page.locator('.satisfaction-grid button').last().click()
  await page.getByRole('button', { name: '仅此一次' }).click()
  await page.locator('.claim-history summary').click()
  await expect(page.locator('.claim-history')).toContainText('满足感 5/5')
})

test('愿望超过八项时可以按名称搜索', async ({ page }) => {
  await page.evaluate(async () => {
    const request = indexedDB.open('earth-online-v2')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('rewards', 'readwrite')
    const store = transaction.objectStore('rewards')
    for (let index = 1; index <= 9; index += 1) {
      store.put({
        id: `search-reward-${index}`,
        title: index === 9 ? '海边旅行' : `测试愿望 ${index}`,
        reason: '验证大量愿望仍然容易找到',
        cost: 30 + index,
        cashCostCents: 0,
        horizon: 'near',
        repeatPolicy: { kind: 'one_time' },
        enabled: true,
        createdAt: new Date().toISOString(),
      })
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  })
  await page.reload()
  await page.getByRole('button', { name: '角色' }).click()
  await page.getByRole('button', { name: '查看奖励愿望' }).click()
  await page.getByRole('button', { name: '愿望', exact: true }).click()
  await page.getByPlaceholder('搜索愿望').fill('海边')
  await expect(page.locator('.wish-row')).toHaveCount(1)
  await expect(page.locator('.wish-row')).toContainText('海边旅行')
})

test('成长轨迹只显示近期摘要，完整有效记录进入月历行动日志', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('旅程示例行动')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '完成 旅程示例行动' }).click()
  await page.getByRole('button', { name: '角色' }).click()
  await expect(page.locator('.growth-section .growth-row')).toHaveCount(1)
  await page.getByRole('button', { name: '行动日志' }).click()
  await expect(page.locator('.action-log-modal')).toBeVisible()
  await expect(page.locator('.journey-summary-grid')).toContainText('活跃天数1')
  await expect(page.locator('.journey-day')).toHaveCount(1)
  await expect(page.locator('.journey-entry')).toHaveCount(1)
})

test('Android 完成声音可试听，并区分普通、层次和角色升级', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android')
  await page.addInitScript(() => {
    Object.defineProperty(window, '__audioStarts', { configurable: true, writable: true, value: 0 })
    Object.defineProperty(window, '__vibrationPatterns', { configurable: true, writable: true, value: [] })
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (pattern: number[]) => { (window as typeof window & { __vibrationPatterns: number[][] }).__vibrationPatterns.push(pattern); return true },
    })
    class FakeAudioContext {
      state = 'running'
      currentTime = 0
      destination = {}
      async resume() { this.state = 'running' }
      createOscillator() {
        return {
          type: 'sine',
          frequency: { setValueAtTime() {} },
          connect(target: unknown) { return target },
          start() { (window as typeof window & { __audioStarts: number }).__audioStarts += 1 },
          stop() {},
        }
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect() { return this },
        }
      }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudioContext })
  })
  await page.reload()
  await page.getByRole('button', { name: '设置' }).click()
  await page.getByRole('switch', { name: '完成声音' }).click()
  await expect(page.getByRole('switch', { name: '完成声音' })).toBeChecked()
  await expect(page.getByText('完成声音已开启，刚才播放的是试听音')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __audioStarts: number }).__audioStarts)).toBe(2)
  await page.getByRole('button', { name: '强烈' }).click()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __audioStarts: number }).__audioStarts)).toBe(4)
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __vibrationPatterns: number[][] }).__vibrationPatterns.at(-1))).toEqual([70])
  await page.getByRole('button', { name: '测试反馈' }).click()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __audioStarts: number }).__audioStarts)).toBe(6)

  await page.getByRole('button', { name: '今天' }).click()
  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('简单完成音')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '完成 简单完成音' }).click()
  await expect(page.locator('.feedback-overlay')).toHaveClass(/condensed/)

  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('分层完成音')
  await page.getByRole('button', { name: '分层目标' }).click()
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '完成 分层完成音' }).click()
  await page.getByRole('button', { name: '选择 基础层' }).click()
  await expect(page.locator('.feedback-overlay')).toHaveClass(/condensed/)
  const tierCompletion = page.getByRole('button', { name: '查看 分层完成音 完成记录' })
  await tierCompletion.evaluate((element) => element.scrollIntoView({ block: 'start' }))
  await tierCompletion.click()
  await page.getByRole('button', { name: '升级到 标准层' }).click()
  await expect(page.locator('.feedback-overlay')).toHaveClass(/condensed/)

  await page.getByRole('button', { name: '创建行动' }).click()
  await page.getByLabel('名称').fill('困难完成音')
  await page.locator('.form-details summary').click()
  await page.getByLabel('难度').selectOption('困难')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.getByRole('button', { name: '完成 困难完成音' }).click()
  await page.getByRole('button', { name: '确认完成' }).click()
  await expect(page.locator('.feedback-overlay')).toHaveClass(/condensed/)

  for (const title of ['升级音一', '升级音二']) {
    await page.getByRole('button', { name: '创建行动' }).click()
    await page.getByLabel('名称').fill(title)
    await page.locator('.form-details summary').click()
    await page.getByLabel('难度').selectOption('Boss')
    await page.getByRole('button', { name: '创建', exact: true }).click()
    await page.getByRole('button', { name: `完成 ${title}` }).click()
    await page.getByLabel('实际成果（必填）').fill(`完成${title}`)
    await page.getByRole('button', { name: '确认完成' }).click()
    await expect(page.locator('.feedback-overlay')).toHaveClass(/condensed/)
  }
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __audioStarts: number }).__audioStarts)).toBe(21)
})

test('移动端中央创建按钮与完成按钮始终不相交', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop')
  for (let index = 1; index <= 7; index += 1) {
    await page.getByRole('button', { name: '创建行动' }).click()
    await page.getByLabel('名称').fill(`滚动任务 ${index}`)
    await page.getByRole('button', { name: '创建', exact: true }).click()
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const lastComplete = page.getByRole('button', { name: '完成 滚动任务 7' })
  await expect(lastComplete).toBeVisible()
  const layout = await page.evaluate(() => {
    const create = document.querySelector<HTMLElement>('.nav-create')!.getBoundingClientRect()
    const navigation = document.querySelector<HTMLElement>('.navigation')!.getBoundingClientRect()
    const visibleCompleteButtons = [...document.querySelectorAll<HTMLElement>('.complete-button')]
      .map((button) => button.getBoundingClientRect())
      .filter((rect) => rect.bottom > 0 && rect.top < window.innerHeight)
    const overlaps = (left: DOMRect, right: DOMRect) => left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top
    return {
      floatingCreates: document.querySelectorAll('.floating-create').length,
      createInsideNavigation: create.left >= navigation.left && create.right <= navigation.right && create.top >= navigation.top && create.bottom <= navigation.bottom,
      createOverlap: visibleCompleteButtons.some((button) => overlaps(create, button)),
      lastBottom: visibleCompleteButtons.at(-1)?.bottom ?? window.innerHeight,
      navigationTop: navigation.top,
    }
  })
  expect(layout).toMatchObject({ floatingCreates: 0, createInsideNavigation: true, createOverlap: false })
  expect(layout.lastBottom).toBeLessThanOrEqual(layout.navigationTop)

  await lastComplete.click()
  await expect(page.locator('.feedback-overlay')).toHaveClass(/condensed/)
  const overlap = await page.evaluate(() => {
    const feedback = document.querySelector<HTMLElement>('.feedback-overlay')!.getBoundingClientRect()
    const complete = document.querySelector<HTMLElement>('button[aria-label="查看 滚动任务 7 完成记录"]')!.getBoundingClientRect()
    return feedback.left < complete.right && feedback.right > complete.left && feedback.top < complete.bottom && feedback.bottom > complete.top
  })
  expect(overlap).toBe(false)
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
