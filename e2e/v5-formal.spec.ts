import { expect, test, type Page } from '@playwright/test'

async function openV5(page: Page) {
  await page.goto('./')
  const wizard = page.getByRole('heading', { name: '建立六个成长领域' })
  const today = page.getByRole('heading', { name: '今天', exact: true })
  await Promise.race([wizard.waitFor(), today.waitFor()])
  if (await wizard.isVisible()) {
    await page.getByRole('button', { name: '启用新领域体系' }).click()
  }
  await expect(today).toBeVisible()
}

async function createSimpleActivity(page: Page, title: string) {
  await page.getByRole('button', { name: '创建行动' }).last().click()
  await page.getByLabel('名称').fill(title)
  await page.getByRole('button', { name: '创建', exact: true }).click()
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
  await page.getByRole('button', { name: '完成 V5 闭环验证' }).click()
  const feedback = page.locator('.v5-feedback')
  await expect(feedback).toContainText('+5 XP')
  await expect(feedback).toContainText('+2 金币')
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

test('分层行动达到基础层后仍留在今天并可直接继续提升', async ({ page }) => {
  await page.getByRole('button', { name: '创建行动' }).last().click()
  await page.getByLabel('名称').fill('分层晚间行动')
  await page.getByRole('button', { name: '分层目标' }).click()
  await page.getByLabel('基础层（分钟）').fill('5')
  await page.getByLabel('标准层（分钟）').fill('15')
  await page.getByLabel('突破层（分钟）').fill('30')
  await page.getByRole('button', { name: '创建', exact: true }).click()

  await page.getByRole('button', { name: '完成 分层晚间行动' }).click()
  await page.getByRole('button', { name: '选择 基础层' }).click()
  await expect(page.getByText('基础已达标 · 可升级标准', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '继续提升 分层晚间行动' }).click()
  await page.getByRole('button', { name: '升级到 标准层' }).click()
  await expect(page.getByText('标准已达标 · 可升级突破', { exact: true })).toBeVisible()

  await page.getByText(/今日已达标 1 项 · 1 项仍可提升/).click()
  await page.getByRole('tab', { name: '可提升 1' }).click()
  await expect(page.getByRole('button', { name: '继续提升', exact: true })).toBeVisible()
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

test('320px 可以预览知识行动包并进入规划确认而不直接创建活动', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'narrow', '专门覆盖 320px 移动端导入预览')
  const actionPackage = {
    packageType: 'earth-online.obsidian-knowledge-action',
    schemaVersion: 1,
    packageId: 'demo.focus-principle.v1',
    knowledge: {
      title: '单点推进原则',
      reference: 'Knowledge/方法/单点推进.md',
      principle: '一次只推进一个可验证结果，把其他想法留到工作段结束后处理。',
    },
    application: {
      goal: '建立稳定开工节奏',
      successCriterion: '28 天内至少 20 天完成基础开工行为',
      baseline: '开始工作时容易被其他想法带走',
      targetOutcome: '每天可以更快进入第一段有效工作',
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
  await page.getByLabel('选择行动包').setInputFiles({
    name: 'knowledge-action-demo.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(actionPackage)),
  })
  const preview = page.getByRole('dialog', { name: '导入预览' })
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('只生成规划草稿')
  await expect(preview).toContainText('写下当前唯一结果')
  await expect(preview).toContainText('完成记录、XP 和金币')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'test-results/knowledge-action-import-320.png', fullPage: true })

  await preview.getByRole('button', { name: '进入规划确认' }).click()
  await expect(page).toHaveURL(/#\/coach\/plan$/)
  await expect(page.getByText('来自 Obsidian 知识行动包')).toBeVisible()
  await expect(page.getByText('单点推进原则', { exact: true })).toBeVisible()
  await expect(page.getByLabel('成长主题')).toHaveValue('建立稳定开工节奏')
  await page.getByRole('button', { name: '下一步' }).click()
  await expect(page.getByText('写下当前唯一结果', { exact: true })).toBeVisible()
})

test('V5 核心页面在当前视口无横向溢出', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: '成长', exact: true }).last().click()
  const growthOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(growthOverflow).toBeLessThanOrEqual(1)
})
