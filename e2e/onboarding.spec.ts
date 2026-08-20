import { expect, test } from '@playwright/test'

async function activityCount(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('earth-online-v2')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const count = await new Promise<number>((resolve, reject) => {
      const request = database.transaction('activities').objectStore('activities').count()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    database.close()
    return count
  })
}

test('全新空库选择领域、预览推荐并完成首次行动', async ({ page }) => {
  await page.goto('./')

  await expect(page.getByRole('heading', { name: '建立六个成长领域' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible()
  await expect(page.getByText('地球 Online · 第一次行动')).toBeVisible()
  await page.getByText('生活', { exact: true }).click()
  await expect(page.getByRole('button', { name: /五分钟复位/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /写下明日第一步/ })).toBeVisible()

  await page.getByRole('button', { name: /五分钟复位/ }).click()
  let preview = page.getByRole('dialog', { name: '五分钟复位' })
  await expect(preview).toContainText('基础层')
  await expect(preview).toContainText('标准层')
  await expect(preview).toContainText('关键行动')
  await preview.getByRole('button', { name: '关闭' }).click()
  await expect(page.getByText('地球 Online · 第一次行动')).toBeVisible()
  await expect.poll(() => activityCount(page)).toBe(0)

  await page.getByRole('button', { name: /五分钟复位/ }).click()
  preview = page.getByRole('dialog', { name: '五分钟复位' })
  await preview.getByRole('button', { name: '确认创建' }).evaluate((button) => {
    button.click()
    button.click()
  })

  await expect(page.getByText('第一条行动已创建')).toBeVisible()
  await expect.poll(() => activityCount(page)).toBe(1)
  await expect(page.getByText('五分钟复位', { exact: true })).toBeVisible()
  await expect(page.getByText('七日体验 · 第 1/7 天')).toBeVisible()
  await page.getByRole('button', { name: /^基础 5分钟/ }).click()
  await expect(page.locator('.v5-feedback')).toContainText('+3 XP')
  await expect(page.getByRole('dialog', { name: '数据保存在这台设备' })).toHaveCount(0)

  await page.reload()
  const storageGuide = page.getByRole('dialog', { name: '数据保存在这台设备' })
  await expect(storageGuide).toBeVisible()
  await expect(storageGuide).toContainText('不同入口可能彼此隔离')
  await storageGuide.getByRole('button', { name: '我知道了' }).click()
  await expect(page.getByText('第一项行动已完成 1 天')).toBeVisible()

  await page.reload()
  await expect(page.getByText('五分钟复位', { exact: true })).toBeVisible()
  await expect(page.getByText('第一项行动已完成 1 天')).toBeVisible()
})

test('已有用户从推荐库创建普通行动且计划模板只生成未确认草稿', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '我想自己定义行动' }).click()
  await page.getByText('生活', { exact: true }).click()
  await page.getByLabel('行动名称').fill('已有关键行动')
  await page.getByRole('button', { name: '创建并开始' }).click()

  await page.goto('./#/coach/library')
  await page.getByRole('tab', { name: '学习' }).click()
  await page.locator('.starter-habit-grid').getByRole('button', { name: /阅读一点/ }).click()
  await page.getByRole('dialog', { name: '阅读一点' }).getByRole('button', { name: '确认创建' }).click()
  await expect(page).toHaveURL(/#\/today$/)

  const state = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('earth-online-v2')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const activities = await new Promise<Array<{ title: string; isKey: boolean }>>((resolve, reject) => {
      const request = database.transaction('activities').objectStore('activities').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const seasons = await new Promise<unknown[]>((resolve, reject) => {
      const request = database.transaction('seasons').objectStore('seasons').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    database.close()
    return { activities, seasons }
  })
  expect(state.activities.find((activity) => activity.title === '已有关键行动')?.isKey).toBe(true)
  expect(state.activities.find((activity) => activity.title === '阅读一点')?.isKey).toBe(false)
  expect(state.seasons).toHaveLength(0)

  await page.goto('./#/coach/library')
  await page.locator('.starter-plan-grid').getByRole('button', { name: /稳定生活节奏/ }).click()
  const planPreview = page.getByRole('dialog', { name: '稳定生活节奏' })
  await expect(planPreview).toContainText('填写个人基线')
  await planPreview.getByRole('button', { name: '生成规划草稿' }).click()
  await expect(page).toHaveURL(/#\/coach\/plan$/)
  await expect(page.getByRole('heading', { name: '先定义现实结果' })).toBeVisible()
  await expect(page.getByLabel('开始状态')).toHaveValue('')

  await page.goto('./#/coach/library')
  await page.locator('.starter-plan-grid').getByRole('button', { name: /推进重要项目/ }).click()
  const replacement = page.getByRole('dialog', { name: '推进重要项目' })
  await expect(replacement).toContainText('当前已有一份规划草稿')
  await replacement.getByRole('button', { name: '确认替换并继续' }).click()
  await expect(page.getByLabel('成长主题')).toHaveValue('推进重要项目')
})

test('390px 推荐库和预览弹层没有横向溢出', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./#/coach/library')
  await expect(page.getByRole('heading', { name: '习惯与计划库' })).toBeVisible()
  await page.getByRole('tab', { name: '创作' }).click()
  await page.locator('.starter-habit-grid').getByRole('button', { name: /推进作品十五分钟/ }).click()
  const dialog = page.getByRole('dialog', { name: '推进作品十五分钟' })
  await expect(dialog.getByRole('button', { name: '确认创建' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('微信首次打开先说明浏览器数据隔离', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 15) MicroMessenger/8.0',
    })
  })
  await page.goto('./')

  const dialog = page.getByRole('dialog', { name: '先用系统浏览器打开' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('不会自动迁移')
  await expect(dialog.getByRole('button', { name: '复制正式版地址' })).toBeVisible()
  await dialog.getByRole('button', { name: '仍在微信中临时体验' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('地球 Online · 第一次行动')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('dialog', { name: '先用系统浏览器打开' })).toHaveCount(0)
})

test('首次使用完整设置时默认启用关键行为', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '完整设置' }).click()
  await expect(page.getByRole('heading', { name: '创建行动' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: '关键行为' })).toBeChecked()
})

test('帮助与反馈只展示安全摘要与用户确认发送', async ({ page }) => {
  await page.goto('./#/profile')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await page.getByRole('button', { name: /告诉我哪里阻碍了行动/ }).click()
  await expect(page).toHaveURL(/#\/profile\/feedback$/)
  await expect(page.getByRole('heading', { name: '帮助与反馈' })).toBeVisible()
  await expect(page.getByText('只附带必要的安全摘要')).toBeVisible()
  await expect(page.getByText('应用不会自动上传任何内容')).toBeVisible()
  await expect(page.getByRole('button', { name: '打开邮件应用' })).toBeVisible()
  await expect(page.getByRole('button', { name: '复制反馈内容' })).toBeVisible()
  await expect(page.getByRole('button', { name: '复制邮箱' })).toBeVisible()
})

test('Android 安装提示由用户手势触发并显示接受结果', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Linux; Android 15) Chrome/140' })
  })
  await page.goto('./#/profile')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true })
    Object.defineProperties(event, {
      prompt: { value: async () => undefined },
      userChoice: { value: Promise.resolve({ outcome: 'accepted' }) },
    })
    window.dispatchEvent(event)
  })
  await page.getByRole('button', { name: /安装与数据保存/ }).click()
  const dialog = page.getByRole('dialog', { name: '数据保存在这台设备' })
  await dialog.getByRole('button', { name: '安装应用' }).click()
  await expect(dialog.getByRole('button', { name: '已接受安装' })).toBeVisible()
})

test('iOS 和已安装模式显示各自的数据安全说明', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' })
  })
  await page.goto('./#/profile')
  await page.getByRole('button', { name: /安装与数据保存/ }).click()
  const dialog = page.getByRole('dialog', { name: '数据保存在这台设备' })
  await expect(dialog).toContainText('在当前浏览器点击“分享”')
  await expect(dialog).toContainText('如果新入口没有原数据')
  await dialog.getByRole('button', { name: '我知道了' }).click()

  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }))
  await page.reload()
  await page.getByRole('button', { name: /安装与数据保存/ }).click()
  await expect(page.getByRole('dialog', { name: '数据保存在这台设备' })).toContainText('已经安装')
})

test('反馈页显式返回后，浏览器返回不会重新打开反馈页', async ({ page }) => {
  await page.goto('./#/today')
  await page.getByRole('button', { name: '我的', exact: true }).last().click()
  await page.getByRole('button', { name: /告诉我哪里阻碍了行动/ }).click()
  await expect(page).toHaveURL(/#\/profile\/feedback$/)
  await page.getByRole('button', { name: '返回我的页面' }).click()
  await expect(page).toHaveURL(/#\/profile$/)
  await page.goBack()
  await expect(page).toHaveURL(/#\/today$/)
})

test('反馈复制失败时只提供本地手工复制，不发送网络请求', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new Error('denied') } },
    })
    document.execCommand = () => false
  })
  await page.goto('./#/profile/feedback')
  await page.getByRole('button', { name: '复制反馈内容' }).click()
  await expect(page.getByRole('textbox', { name: '手动复制内容' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('无法自动复制')
})
