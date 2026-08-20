import { expect, test, type Page } from '@playwright/test'

async function openV5(page: Page) {
  await page.goto('./')
  const wizard = page.getByRole('heading', { name: '建立六个成长领域' })
  const today = page.getByRole('heading', { name: '今天', exact: true })
  const travelerDialog = page.getByRole('dialog', { name: '选择你的旅者' })
  await Promise.race([wizard.waitFor(), today.waitFor(), travelerDialog.waitFor()])
  if (await travelerDialog.isVisible()) {
    await travelerDialog.getByRole('button', { name: /男性旅者/ }).click()
    await expect(travelerDialog).toBeHidden()
  }
  if (await wizard.isVisible()) {
    await page.getByRole('button', { name: '启用新领域体系' }).click()
  }
  await expect(today).toBeVisible()
}

async function openNonKeyActivityForm(page: Page) {
  const fullSettings = page.getByRole('button', { name: '完整设置' })
  if (await fullSettings.isVisible().catch(() => false)) await fullSettings.click()
  else await page.getByRole('button', { name: '创建行动' }).last().click()
  const keyActivity = page.getByLabel('关键行为')
  if (await keyActivity.isChecked()) await keyActivity.uncheck()
}

async function createSimpleActivity(page: Page, title: string) {
  await openNonKeyActivityForm(page)
  await page.getByLabel('名称', { exact: true }).fill(title)
  await page.getByRole('button', { name: '创建', exact: true }).click()
}

async function seedFinishedApplicationTrialWindow(page: Page) {
  await page.evaluate(async () => {
    const current = new Date()
    current.setHours(current.getHours() - 4)
    const endsOn = [
      current.getFullYear(),
      String(current.getMonth() + 1).padStart(2, '0'),
      String(current.getDate()).padStart(2, '0'),
    ].join('-')
    const start = new Date(`${endsOn}T12:00:00`)
    start.setDate(start.getDate() - 6)
    const startsOn = [
      start.getFullYear(),
      String(start.getMonth() + 1).padStart(2, '0'),
      String(start.getDate()).padStart(2, '0'),
    ].join('-')
    const request = indexedDB.open('earth-online-v2')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction(['activities', 'settings'], 'readwrite')
    const activity = {
      id: 'e2e-application-trial-behavior',
      title: '学习前检索旧知识',
      cue: '准备搜索新资料前',
      protocol: '先搜索 Knowledge，并写下一句本次如何复用。',
      type: 'habit',
      domain: 'learning',
      difficulty: '简单',
      goal: { kind: 'tiered', metric: 'duration', unit: '秒', inputUnit: '分钟', thresholds: [120, 300] },
      schedule: { kind: 'daily' },
      isKey: true,
      enabled: true,
      revision: 1,
      createdAt: new Date().toISOString(),
    }
    transaction.objectStore('activities').put(activity)
    transaction.objectStore('settings').put({
      key: 'applicationTrial',
      value: {
        id: 'trial:app-20990101-e2e',
        version: 1,
        applicationId: 'app-20990101-e2e',
        sourcePackageId: 'e2e.application.trial.v1',
        sourcePlanId: 'application-plan:app-20990101-e2e:trial',
        title: '让旧知识参与下一次学习',
        successCriterion: '两次学习都先调用已有知识',
        baseline: '新问题通常从重新搜索开始',
        targetOutcome: '先复用再补充来源',
        outcomeIndicator: '两次学习中旧知识被实际复用的次数与帮助',
        knowledge: {
          primary: {
            kind: 'principle',
            title: '可复用成果进入下一轮才会形成复利',
            reference: '20 Knowledge/复利原则.md',
            principle: '每次学习至少留下一个能被下一次调用的成果。',
          },
          supporting: [],
        },
        startsOn,
        endsOn,
        focusActivities: [{
          activityId: activity.id,
          title: activity.title,
          cue: activity.cue,
          protocol: activity.protocol,
          domain: activity.domain,
          difficulty: activity.difficulty,
          goal: activity.goal,
          schedule: activity.schedule,
        }],
        previousKeyActivityIds: [],
        status: 'active',
        createdAt: new Date().toISOString(),
      },
    })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await openV5(page)
})

test('正式入口使用 V5 导航且不显示预览提示', async ({ page }) => {
  const navigation = page.getByRole('navigation', { name: '主要导航' }).last()
  for (const label of ['行动', '成长', '复盘', '愿望', '我的']) {
    await expect(navigation.getByRole('button', { name: label, exact: true })).toBeVisible()
  }
  await expect(page.getByText('测试数据与正式版完全分开')).toHaveCount(0)
  await expect(page.locator('.preview-banner')).toHaveCount(0)
})

test('记录行动、即时反馈、撤销与刷新形成持久化闭环', async ({ page }) => {
  await createSimpleActivity(page, 'V5 闭环验证')
  const actionRow = page.locator('.v5-focus-action, .v5-compact-action').filter({ hasText: 'V5 闭环验证' })
  await expect(actionRow.locator('.v5-action-reward')).toContainText('本次 +5 XP · +2 金币')
  await page.getByRole('button', { name: '完成 V5 闭环验证' }).click()
  const feedback = page.locator('.v5-feedback')
  await expect(feedback).toContainText('+5 XP')
  await expect(feedback).toContainText('+2 金币')
  await expect(page.locator('.v5-status-strip')).toContainText('今日 +5 XP · +2 金币')
  await expect(feedback).toContainText('本次行动已记录', { timeout: 2_500 })
  await expect(feedback).not.toContainText('+5 XP')
  await feedback.getByRole('button', { name: '撤销' }).click()
  await expect(page.getByRole('button', { name: '完成 V5 闭环验证' })).toBeVisible()

  await page.getByRole('button', { name: '完成 V5 闭环验证' }).click()
  await expect(page.locator('.v5-feedback')).toContainText('+5 XP')
  await page.reload()
  await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '成长', exact: true }).last().click()
  await expect(page.locator('.v5-growth-metrics > div').first()).toContainText('5 XP')
  await expect(page.locator('.v5-growth-metrics > div').nth(1)).toContainText('2')
})

test('每日评分习惯选择分数即完成，改分不会重复发奖', async ({ page }) => {
  await openNonKeyActivityForm(page)
  await page.getByLabel('名称', { exact: true }).fill('每日恢复体验')
  await page.getByRole('button', { name: '评分体验' }).click()
  await page.getByLabel('评分问题').fill('今天的恢复感如何？')
  await page.getByLabel('1 分锚点').fill('很差')
  await page.getByLabel('3 分锚点').fill('一般')
  await page.getByLabel('5 分锚点').fill('很好')
  await page.getByLabel('备注提示（可选）').fill('主要影响因素')
  await page.getByRole('button', { name: '创建', exact: true }).click()

  await page.getByRole('button', { name: '记录体验 每日恢复体验' }).click()
  const ratingDialog = page.getByRole('dialog', { name: '今天的恢复感如何？' })
  await expect(ratingDialog).toBeVisible()
  await ratingDialog.locator('.rating-score-grid button').nth(3).click()

  const feedback = page.locator('.v5-feedback')
  await expect(feedback).toContainText('今天的恢复感如何？ 4/5')
  await feedback.getByRole('button', { name: '补充影响因素' }).click()

  const completionDialog = page.getByRole('dialog', { name: '完成记录' })
  await completionDialog.locator('.completion-rating-editor .rating-score-grid button').nth(1).click()
  await completionDialog.getByLabel('主要影响因素').fill('下午咖啡较晚')
  await completionDialog.getByRole('button', { name: '保存评分' }).click()
  await expect(page.getByText('今天的评分已更新，XP 和金币没有变化')).toBeVisible()

  const persisted = await page.evaluate(async () => {
    const request = indexedDB.open('earth-online-v2')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const readAll = <T,>(storeName: string) => new Promise<T[]>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly')
      const result = transaction.objectStore(storeName).getAll()
      result.onsuccess = () => resolve(result.result as T[])
      result.onerror = () => reject(result.error)
    })
    const activities = await readAll<{ id: string; title: string }>('activities')
    const activity = activities.find((item) => item.title === '每日恢复体验')
    const completions = await readAll<{ id: string; activityId: string; ratingValue?: number; note?: string }>('completions')
    const completion = completions.find((item) => item.activityId === activity?.id)
    const events = await readAll<{ sourceId: string }>('ledgerEvents')
    database.close()
    return {
      ratingValue: completion?.ratingValue,
      note: completion?.note,
      rewardEvents: events.filter((event) => event.sourceId === completion?.id).length,
    }
  })
  expect(persisted).toEqual({ ratingValue: 2, note: '下午咖啡较晚', rewardEvents: 1 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
})

test('分层行动达到基础层后仍留在今天并可直接继续提升', async ({ page }) => {
  await openNonKeyActivityForm(page)
  await page.getByLabel('名称', { exact: true }).fill('分层晚间行动')
  await page.getByRole('button', { name: '分层目标' }).click()
  await page.getByLabel('基础层（分钟）').fill('5')
  await page.getByLabel('标准层（分钟）').fill('15')
  await page.getByLabel('突破层（分钟）').fill('30')
  await page.getByRole('button', { name: '创建', exact: true }).click()

  await expect(page.locator('.v5-focus-action, .v5-compact-action').filter({ hasText: '分层晚间行动' }).locator('.v5-action-reward')).toContainText('可得 +3～5 XP · +2 金币')
  await page.getByRole('button', { name: /^基础 5分钟/ }).click()
  await expect(page.getByText('基础已达标 · 可升级标准', { exact: true })).toBeVisible()
  await expect(page.locator('.v5-focus-action, .v5-compact-action').filter({ hasText: '分层晚间行动' }).locator('.v5-action-reward')).toContainText('升级可再得 +1～2 XP · 金币已领取')
  await page.getByRole('button', { name: '继续提升 分层晚间行动' }).click()
  await page.getByRole('button', { name: '升级到 标准层' }).click()
  await expect(page.getByText('标准已达标 · 可升级突破', { exact: true })).toBeVisible()

  await page.getByText(/今日已达标 1 项 · 1 项仍可提升/).click()
  await page.getByRole('tab', { name: '可提升 1' }).click()
  await expect(page.getByRole('button', { name: '继续提升', exact: true })).toBeVisible()
})

test('旅者外观切换后刷新仍保留', async ({ page }) => {
  await createSimpleActivity(page, '外观持久化行动')
  await page.getByRole('button', { name: '我的' }).click()
  const appearance = page.getByRole('group', { name: '旅者外观' })
  await appearance.getByRole('button', { name: /女性旅者/ }).click()
  await expect(appearance.getByRole('button', { name: /女性旅者/ })).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page.getByRole('group', { name: '旅者外观' }).getByRole('button', { name: /女性旅者/ })).toHaveAttribute('aria-pressed', 'true')
})

test('完成前置行动后会触发行动链推荐', async ({ page }) => {
  await createSimpleActivity(page, '晨间启动')
  await page.getByRole('button', { name: '创建行动' }).last().click()
  await page.getByLabel('名称').fill('开始阅读')
  await page.getByText('启动与执行', { exact: true }).click()
  await page.getByRole('button', { name: '另一行动后' }).click()
  await page.getByLabel('完成这项行动后').selectOption({ label: '晨间启动' })
  await page.getByRole('button', { name: '创建', exact: true }).click()

  await expect(page.getByText('晨间启动完成后', { exact: false }).first()).toBeVisible()
  await page.getByRole('button', { name: '完成 晨间启动' }).click()
  await expect(page.getByText('晨间启动完成后 · 已触发', { exact: false }).first()).toBeVisible()
})

test('成长总值并入旅者主卡且页面没有旧总成长信息行', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: '成长', exact: true }).last().click()
  const hero = page.locator('.v5-growth-hero')
  await expect(hero).toContainText('累计成长')
  await expect(hero).toContainText('持有金币')
  await expect(hero).toContainText('完成下一份成长报告后选择')
  await expect(hero.locator('img')).toHaveCSS('width', '96px')
  await expect(page.locator('.v5-plain-row')).toHaveCount(0)
  await expect(page.locator('.v5-growth-aside')).toHaveCount(0)
  await expect(page.getByText(/^总成长/)).toHaveCount(0)
  const rewardBeforeDomains = await page.evaluate(() => {
    const reward = document.querySelector('.v5-feature-row')
    const domains = document.querySelector('.v5-domain-grid')
    return Boolean(reward && domains && reward.compareDocumentPosition(domains) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  expect(rewardBeforeDomains).toBe(true)

  await page.getByRole('button', { name: /查看健康领域详情/ }).click()
  await expect(page.getByRole('dialog', { name: '健康领域' })).toBeVisible()
  await page.getByRole('button', { name: '关闭健康领域' }).click()
  await page.screenshot({
    path: `test-results/v5-growth-hero-${testInfo.project.name}.png`,
    fullPage: true,
  })
})

test('目标规划器和愿望商店保留为可返回的二级页面', async ({ page }) => {
  await createSimpleActivity(page, '导航验证行动')
  await page.getByRole('button', { name: '规划一个 28 天目标' }).click()
  await expect(page).toHaveURL(/#\/coach\/plan$/)
  await expect(page.getByRole('heading', { name: '目标规划器' })).toBeVisible()
  await page.getByRole('button', { name: '返回' }).click()

  await page.getByRole('button', { name: '愿望', exact: true }).last().click()
  await expect(page).toHaveURL(/#\/rewards$/)
  await expect(page.getByRole('heading', { name: '奖励愿望' })).toBeVisible()
  await page.getByRole('button', { name: '返回' }).click()
  await expect(page.getByRole('heading', { name: '成长', exact: true })).toBeVisible()
})

test('数据中心支持二级地址刷新、恢复差异预览和浏览器返回', async ({ page }) => {
  await page.getByRole('button', { name: '我的', exact: true }).last().click()
  await page.getByRole('button', { name: /数据中心/ }).click()
  await expect(page).toHaveURL(/#\/profile\/data$/)
  await expect(page.getByRole('heading', { name: '数据中心' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: '数据中心' })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /导出完整 JSON/ }).click()
  const download = await downloadPromise
  const backupPath = await download.path()
  if (!backupPath) throw new Error('没有生成用于恢复预览的备份文件')
  await page.getByLabel('选择完整备份').setInputFiles(backupPath)

  const restoreDialog = page.getByRole('dialog', { name: '完整备份差异' })
  await expect(restoreDialog).toBeVisible()
  await expect(restoreDialog.getByRole('button', { name: '确认整体恢复' })).toBeDisabled()
  await restoreDialog.getByTitle('关闭').click()
  await expect(restoreDialog).toHaveCount(0)

  await page.goBack()
  await expect(page.getByRole('heading', { name: '设置', exact: true })).toBeVisible()
})

test('320px 可以预览 v2 试跑行动包并进入规划确认而不直接创建活动', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'narrow', '专门覆盖 320px 移动端导入预览')
  const actionPackage = {
    packageType: 'earth-online.obsidian-knowledge-action',
    schemaVersion: 2,
    packageId: 'demo.focus-principle.v1',
    applicationId: 'app-20990101-focus-demo',
    phase: 'trial',
    knowledge: {
      primary: {
        kind: 'principle',
        title: '单点推进原则',
        reference: '20 Knowledge/单点推进.md',
        principle: '一次只推进一个可验证结果，把其他想法留到工作段结束后处理。',
      },
      supporting: [{
        kind: 'procedure',
        title: '开工前写唯一结果',
        reference: '20 Knowledge/开工前写唯一结果.md',
        contribution: '把抽象原则变成工作开始前的触发协议。',
      }],
    },
    application: {
      goal: '建立稳定开工节奏',
      successCriterion: '28 天内至少 20 天完成基础开工行为',
      baseline: '开始工作时容易被其他想法带走',
      targetOutcome: '每天可以更快进入第一段有效工作',
      outcomeIndicator: '一周内从坐下到开始唯一任务的平均等待时间',
    },
    behaviors: [{
      role: 'start',
      title: '写下当前唯一结果',
      scheduledTime: '09:00',
      cue: '第一段工作开始前',
      protocol: '写下一个当前结果和一个可以立即执行的动作。',
      domain: 'career',
      difficulty: '简单',
      goal: { kind: 'tiered', metric: 'duration', unit: '秒', inputUnit: '分钟', thresholds: [120, 300] },
      schedule: { kind: 'daily' },
    }],
  }

  await page.getByRole('button', { name: '我的', exact: true }).last().click()
  await page.getByRole('button', { name: /数据中心/ }).click()
  await expect(page).toHaveURL(/#\/profile\/data$/)
  await page.getByLabel('选择行动包').setInputFiles({
    name: 'knowledge-action-demo.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(actionPackage)),
  })
  const preview = page.getByRole('dialog', { name: '导入预览' })
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('只生成规划草稿')
  await expect(preview).toContainText('写下当前唯一结果')
  await expect(preview).toContainText('7 天试跑')
  await expect(preview).toContainText('开工前写唯一结果')
  await expect(preview).toContainText('完成记录、XP 和金币')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'test-results/knowledge-action-import-320.png', fullPage: true })

  await preview.getByRole('button', { name: '进入规划确认' }).click()
  await expect(page).toHaveURL(/#\/coach\/plan$/)
  await expect(page.getByText('来自 Obsidian 知识行动包')).toBeVisible()
  await expect(page.getByText('单点推进原则', { exact: true })).toBeVisible()
  await expect(page.getByText(/结果指标：一周内从坐下到开始唯一任务的平均等待时间/)).toBeVisible()
  await expect(page.getByLabel('成长主题')).toHaveValue('建立稳定开工节奏')
  await page.getByRole('button', { name: '下一步' }).click()
  await expect(page.getByText('写下当前唯一结果', { exact: true })).toBeVisible()
})

test('7 天试跑复盘与最小结果导出在各视口可用', async ({ page }, testInfo) => {
  await seedFinishedApplicationTrialWindow(page)
  await page.getByRole('button', { name: '复盘', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: '让旧知识参与下一次学习' })).toBeVisible()
  await expect(page.getByText('可复用成果进入下一轮才会形成复利', { exact: false })).toBeVisible()
  await page.getByLabel('两次学习中旧知识被实际复用的次数与帮助').fill('两次学习都先调用了旧知识，其中一次避免了重复搜索')
  await page.locator('[aria-label="试跑决定"]').getByRole('button', { name: '调整' }).click()
  await page.getByLabel('决定理由').fill('保留前置检索，但把记录要求缩短为一句')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: `test-results/application-trial-review-${testInfo.project.name}.png`, fullPage: true })
  await page.getByRole('button', { name: '保存人工判断' }).click()
  await expect(page.getByText('7 天结果：调整')).toBeVisible()

  await page.getByRole('button', { name: '我的', exact: true }).last().click()
  await page.getByRole('button', { name: /数据中心/ }).click()
  const nativeShare = await page.evaluate(() => Boolean(navigator.share))
  if (nativeShare) {
    await page.getByRole('button', { name: /导出最近 7 天结果/ }).click()
  } else {
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: /导出最近 7 天结果/ }).click()
    expect((await download).suggestedFilename()).toBe('app-20990101-e2e.trial.result.json')
  }
})

test('V5 核心页面在当前视口无横向溢出', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: '成长', exact: true }).last().click()
  const growthOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(growthOverflow).toBeLessThanOrEqual(1)
})
