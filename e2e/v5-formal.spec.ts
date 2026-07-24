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
  await feedback.getByRole('button', { name: '撤销' }).click()
  await expect(page.getByRole('button', { name: '完成 V5 闭环验证' })).toBeVisible()

  await page.getByRole('button', { name: '完成 V5 闭环验证' }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '成长', exact: true }).last().click()
  await expect(page.locator('.v5-growth-metrics > div').first()).toContainText('5 XP')
  await expect(page.locator('.v5-growth-metrics > div').nth(1)).toContainText('2')
})

test('成长总值并入旅者主卡且页面没有旧总成长信息行', async ({ page }) => {
  await page.getByRole('button', { name: '成长', exact: true }).last().click()
  const hero = page.locator('.v5-growth-hero')
  await expect(hero).toContainText('累计成长')
  await expect(hero).toContainText('持有金币')
  await expect(page.locator('.v5-plain-row')).toHaveCount(0)
  await expect(page.getByText(/^总成长/)).toHaveCount(0)

  await page.getByRole('button', { name: /查看健康领域详情/ }).click()
  await expect(page.getByRole('dialog', { name: '健康领域' })).toBeVisible()
  await page.getByRole('button', { name: '关闭健康领域' }).click()
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

test('V5 核心页面在当前视口无横向溢出', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: '成长', exact: true }).last().click()
  const growthOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(growthOverflow).toBeLessThanOrEqual(1)
})
