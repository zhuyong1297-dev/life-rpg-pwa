import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createBackup, restoreBackup } from '../backup'
import { LifeRpgDatabase, acknowledgeReleaseNotes, initializeDatabase } from '../db'
import { MetaSchema } from '../domain'

let database: LifeRpgDatabase

beforeEach(async () => {
  database = new LifeRpgDatabase(`release-notes-${crypto.randomUUID()}`)
  await initializeDatabase(database)
})

afterEach(async () => {
  database.close()
  await database.delete()
})

describe('更新说明状态', () => {
  it('兼容没有更新说明字段的旧 Meta，并拒绝非 SemVer 版本', () => {
    expect(MetaSchema.parse({ lastBackupAt: '2026-08-18T08:00:00.000Z' })).toEqual({
      lastBackupAt: '2026-08-18T08:00:00.000Z',
    })
    expect(() => MetaSchema.parse({
      releaseNotes: { lastSeenVersion: 'V5.7', acknowledgedAt: '2026-08-18T08:00:00.000Z' },
    })).toThrow('SemVer')
  })

  it('首次确认合并写入且保留其他 Meta', async () => {
    const stored = await database.settings.get('meta')
    expect(stored?.key).toBe('meta')
    if (stored?.key !== 'meta') throw new Error('测试 Meta 未初始化')
    await database.settings.put({
      ...stored,
      value: { ...stored.value, lastBackupAt: '2026-08-17T08:00:00.000Z' },
    })

    const result = await acknowledgeReleaseNotes('5.7.0', database, new Date('2026-08-18T08:00:00.000Z'))
    expect(result).toEqual({
      lastSeenVersion: '5.7.0',
      acknowledgedAt: '2026-08-18T08:00:00.000Z',
    })
    expect(await database.settings.get('meta')).toMatchObject({
      value: {
        lastBackupAt: '2026-08-17T08:00:00.000Z',
        levelSystem: stored.value.levelSystem,
        releaseNotes: result,
      },
    })
  })

  it('同版本重复确认保留首次确认时间', async () => {
    const first = await acknowledgeReleaseNotes('5.7.0', database, new Date('2026-08-18T08:00:00.000Z'))
    const duplicate = await acknowledgeReleaseNotes('5.7.0', database, new Date('2026-08-19T08:00:00.000Z'))
    expect(duplicate).toEqual(first)
    expect(await database.settings.get('meta')).toMatchObject({ value: { releaseNotes: first } })
  })

  it('完整备份恢复保留已查看版本', async () => {
    await acknowledgeReleaseNotes('5.7.0', database, new Date('2026-08-18T08:00:00.000Z'))
    const backup = await createBackup(database)
    await acknowledgeReleaseNotes('5.8.0', database, new Date('2026-08-19T08:00:00.000Z'))

    await restoreBackup(backup, database)
    expect(await database.settings.get('meta')).toMatchObject({
      value: {
        releaseNotes: {
          lastSeenVersion: '5.7.0',
          acknowledgedAt: '2026-08-18T08:00:00.000Z',
        },
      },
    })
  })
})
