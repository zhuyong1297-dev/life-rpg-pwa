import {
  ActivitySchema,
  type Activity,
  type ApplicationDecision,
  ApplicationTrialRestartSchema,
  type ApplicationTrialRestart,
  ApplicationTrialSchema,
  CoachPlanDraftSchema,
  type CoachPlanDraft,
  type Difficulty,
  type Setting,
  addDays,
} from '../domain'
import {
  SeasonSchema,
  snapshotSeasonActivity,
  type Season,
  type SeasonResult,
  type SuggestionStatus,
} from '../season'
import { aggregateApplicationBehaviors } from '../application-bridge'
import { db, currentGameDate } from './database'

export interface CreateSeasonInput {
  title: string
  successCriterion: string
  baseline: string
  targetOutcome: string
  focusActivityIds: string[]
}
export async function getCoachPlanDraft(database = db) {
  const setting = await database.settings.get('coachPlanDraft')
  return setting?.key === 'coachPlanDraft' ? CoachPlanDraftSchema.parse(setting.value) : undefined
}

export async function saveCoachPlanDraft(draft: CoachPlanDraft, database = db, now = new Date()) {
  const next = CoachPlanDraftSchema.parse({ ...draft, updatedAt: now.toISOString() })
  await database.settings.put({ key: 'coachPlanDraft', value: next })
  return next
}

export async function deleteCoachPlanDraft(draftId: string, database = db) {
  const stored = await database.settings.get('coachPlanDraft')
  if (stored?.key !== 'coachPlanDraft' || stored.value.id !== draftId) return false
  await database.settings.delete('coachPlanDraft')
  return true
}

export async function activateCoachPlanDraft(
  draftId: string,
  startsOn: string | undefined = undefined,
  database = db,
) {
  const eventDate = startsOn ?? await currentGameDate(database)
  return database.transaction('rw', database.settings, database.seasons, database.activities, async () => {
    const alreadyCreated = await database.seasons.filter((season) => season.sourcePlanId === draftId).first()
    if (alreadyCreated) return alreadyCreated
    const storedTrialSetting = await database.settings.get('applicationTrial')
    const storedTrial = storedTrialSetting?.key === 'applicationTrial'
      ? ApplicationTrialSchema.parse(storedTrialSetting.value)
      : undefined
    if (storedTrial?.sourcePlanId === draftId) return storedTrial

    const setting = await database.settings.get('coachPlanDraft')
    if (setting?.key !== 'coachPlanDraft' || setting.value.id !== draftId) throw new Error('找不到这份目标规划草稿')
    const draft = CoachPlanDraftSchema.parse(setting.value)
    if (draft.status !== 'ready') throw new Error('请先完成四步规划和现实检查')
    const activeSeason = await database.seasons.where('status').equals('active').first()
    const source = draft.knowledgeSource
    const isApplicationPackage = source !== undefined && source.schemaVersion !== 1
    if (storedTrial?.status === 'active') {
      throw new Error('当前已有进行中的 7 天试跑，同一时间不能启动赛季')
    }
    if (isApplicationPackage && activeSeason) {
      throw new Error('当前已有进行中的 Application，同一时间只能进行一个试跑或赛季')
    }
    if (!isApplicationPackage && activeSeason) throw new Error('当前赛季尚未结束，只能先保存为下个赛季')

    const existingPlans = draft.behaviors.filter((behavior) => behavior.source === 'existing')
    const existingActivities = await database.activities.bulkGet(existingPlans.map((behavior) => behavior.activityId))
    if (existingActivities.some((activity) => !activity || activity.type !== 'habit' || !activity.enabled || activity.archivedAt)) {
      throw new Error('复用的活动已暂停、归档或删除，请返回草稿替换')
    }

    const createdAt = new Date().toISOString()
    const createdActivities = draft.behaviors.flatMap((behavior) => behavior.source === 'new'
      ? [ActivitySchema.parse({
          id: `coach-activity:${draft.id}:${behavior.id}`,
          title: behavior.title,
          scheduledTime: behavior.schedule.kind === 'daily' ? behavior.scheduledTime : undefined,
          cue: behavior.cue,
          protocol: behavior.protocol,
          type: 'habit',
          domain: behavior.domain,
          difficulty: behavior.difficulty,
          goal: behavior.goal,
          schedule: behavior.schedule,
          isKey: true,
          enabled: true,
          revision: 1,
          createdAt,
        })]
      : [])

    const allActivities = await database.activities.toArray()
    const previousKeyActivityIds = allActivities
      .filter((activity) => activity.isKey && activity.enabled && !activity.archivedAt)
      .map((activity) => activity.id)
    const selectedExistingIds = new Set(existingPlans.map((behavior) => behavior.activityId))
    await database.activities.bulkPut(allActivities
      .filter((activity) => activity.isKey || selectedExistingIds.has(activity.id))
      .map((activity) => ActivitySchema.parse({ ...activity, isKey: selectedExistingIds.has(activity.id) })))
    if (createdActivities.length) await database.activities.bulkAdd(createdActivities)

    const selectedActivities = draft.behaviors.map((behavior) => behavior.source === 'existing'
      ? existingActivities[existingPlans.findIndex((plan) => plan.id === behavior.id)]!
      : createdActivities.find((activity) => activity.id === `coach-activity:${draft.id}:${behavior.id}`)!)
    if (source && source.schemaVersion !== 1 && source.phase === 'trial') {
      const trial = ApplicationTrialSchema.parse({
        id: `trial:${source.applicationId}`,
        version: 1,
        applicationId: source.applicationId,
        sourcePackageId: source.packageId,
        sourcePlanId: draft.id,
        title: draft.title,
        successCriterion: draft.successCriterion,
        baseline: draft.baseline,
        targetOutcome: draft.targetOutcome,
        outcomeIndicator: source.outcomeIndicator,
        knowledge: source.knowledge,
        startsOn: eventDate,
        endsOn: addDays(eventDate, 6),
        focusActivities: selectedActivities.map((activity) => ({
          activityId: activity.id,
          title: activity.title,
          scheduledTime: activity.scheduledTime,
          cue: activity.cue,
          protocol: activity.protocol,
          domain: activity.domain,
          difficulty: activity.difficulty,
          goal: activity.goal,
          schedule: activity.schedule,
        })),
        previousKeyActivityIds,
        status: 'active',
        createdAt,
      })
      await database.settings.put({ key: 'applicationTrial', value: trial })
      await database.settings.delete('coachPlanDraft')
      return trial
    }

    const season = SeasonSchema.parse({
      id: `season:${draft.id}`,
      sourcePlanId: draft.id,
      title: draft.title,
      successCriterion: draft.successCriterion,
      baseline: draft.baseline,
      targetOutcome: draft.targetOutcome,
      startsOn: eventDate,
      endsOn: addDays(eventDate, 27),
      focusActivities: selectedActivities.map(snapshotSeasonActivity),
      dailyPlans: [],
      dailySignals: [],
      suggestions: [],
      applicationContext: source && source.schemaVersion !== 1 ? source : undefined,
      status: 'active',
      createdAt,
    })
    await database.seasons.add(season)
    if (draft.knowledgeSource) {
      const storedMeta = await database.settings.get('meta')
      const meta = storedMeta?.key === 'meta' ? storedMeta.value : {}
      const existingImports = meta.knowledgeActionImports ?? []
      if (!existingImports.some((record) => record.packageId === draft.knowledgeSource!.packageId)) {
        const knowledge = draft.knowledgeSource.schemaVersion === 1
          ? {
              title: draft.knowledgeSource.knowledgeTitle,
              reference: draft.knowledgeSource.knowledgeReference,
            }
          : {
              title: draft.knowledgeSource.knowledge.primary.title,
              reference: draft.knowledgeSource.knowledge.primary.reference,
            }
        await database.settings.put({
          key: 'meta',
          value: {
            ...meta,
            knowledgeActionImports: [
              ...existingImports.slice(-199),
              {
                packageId: draft.knowledgeSource.packageId,
                knowledgeTitle: knowledge.title,
                knowledgeReference: knowledge.reference,
                draftId: draft.id,
                seasonId: season.id,
                activatedAt: createdAt,
              },
            ],
          },
        })
      }
    }
    await database.settings.delete('coachPlanDraft')
    return season
  })
}

export async function getApplicationTrial(database = db) {
  const setting = await database.settings.get('applicationTrial')
  return setting?.key === 'applicationTrial' ? ApplicationTrialSchema.parse(setting.value) : undefined
}

export async function getApplicationTrialRestart(database = db) {
  const setting = await database.settings.get('applicationTrialRestart')
  return setting?.key === 'applicationTrialRestart' ? ApplicationTrialRestartSchema.parse(setting.value) : undefined
}

export async function prepareApplicationTrialRestart(
  sourceTrialId: string,
  replacements: ApplicationTrialRestart['replacements'],
  database = db,
  now = new Date(),
) {
  const today = await currentGameDate(database, now)
  return database.transaction('rw', database.settings, database.activities, async () => {
    const trialSetting = await database.settings.get('applicationTrial')
    if (trialSetting?.key !== 'applicationTrial') throw new Error('找不到进行中的 7 天试跑')
    const trial = ApplicationTrialSchema.parse(trialSetting.value)
    if (trial.id !== sourceTrialId || trial.status !== 'active') throw new Error('试跑状态已经变化，请重新检查修正方案')
    const sourceIds = trial.focusActivities.map((activity) => activity.activityId)
    if (replacements.length !== sourceIds.length || replacements.some((replacement) => !sourceIds.includes(replacement.sourceActivityId))) {
      throw new Error('修正方案必须逐项对应当前试跑行为')
    }
    const sources = await database.activities.bulkGet(sourceIds)
    if (sources.some((activity) => !activity || activity.archivedAt)) throw new Error('原试跑行为已发生变化，无法保存修正方案')
    const pending = ApplicationTrialRestartSchema.parse({
      version: 1,
      sourceTrialId,
      notBefore: addDays(today, 1),
      preparedAt: now.toISOString(),
      replacements,
    })
    await database.settings.put({ key: 'applicationTrialRestart', value: pending })
    return pending
  })
}

export async function activateApplicationTrialRestart(
  database = db,
  now = new Date(),
) {
  const today = await currentGameDate(database, now)
  return database.transaction('rw', database.settings, database.activities, async () => {
    const pendingSetting = await database.settings.get('applicationTrialRestart')
    const trialSetting = await database.settings.get('applicationTrial')
    const currentTrial = trialSetting?.key === 'applicationTrial' ? ApplicationTrialSchema.parse(trialSetting.value) : undefined
    if (pendingSetting?.key !== 'applicationTrialRestart') {
      if (currentTrial?.restartOfTrialId) return currentTrial
      throw new Error('没有待启动的试跑修正方案')
    }
    const pending = ApplicationTrialRestartSchema.parse(pendingSetting.value)
    if (today < pending.notBefore) throw new Error(`请在 ${pending.notBefore} 04:00 后启动新的 7 天试跑`)
    if (!currentTrial || currentTrial.id !== pending.sourceTrialId || currentTrial.status !== 'active') {
      throw new Error('原试跑状态已经变化，不能启动修正方案')
    }

    const sourceIds = currentTrial.focusActivities.map((activity) => activity.activityId)
    const sources = await database.activities.bulkGet(sourceIds)
    if (sources.some((activity) => !activity || activity.archivedAt)) throw new Error('原试跑行为已发生变化，不能启动修正方案')
    const createdAt = now.toISOString()
    const newActivities = pending.replacements.map((replacement, index) => ActivitySchema.parse({
      id: `trial-restart:${today}:${index + 1}:${crypto.randomUUID()}`,
      title: replacement.title,
      scheduledTime: replacement.scheduledTime,
      cue: replacement.cue,
      protocol: replacement.protocol,
      type: 'habit',
      domain: replacement.domain,
      difficulty: replacement.difficulty,
      goal: replacement.goal,
      schedule: replacement.schedule,
      isKey: true,
      enabled: true,
      revision: 1,
      createdAt,
    }))
    const archived = sources.map((activity) => ActivitySchema.parse({
      ...activity!,
      isKey: false,
      enabled: false,
      archivedAt: createdAt,
    }))
    const trial = ApplicationTrialSchema.parse({
      ...currentTrial,
      id: `trial:${currentTrial.applicationId}:restart:${today}`,
      sourcePlanId: `${currentTrial.sourcePlanId}:restart:${today}`,
      restartOfTrialId: currentTrial.id,
      startsOn: today,
      endsOn: addDays(today, 6),
      focusActivities: newActivities.map((activity) => ({
        activityId: activity.id,
        title: activity.title,
        scheduledTime: activity.scheduledTime,
        cue: activity.cue,
        protocol: activity.protocol,
        domain: activity.domain,
        difficulty: activity.difficulty,
        goal: activity.goal,
        schedule: activity.schedule,
      })),
      status: 'active',
      createdAt,
    })
    await database.activities.bulkPut([...archived, ...newActivities])
    await database.settings.put({ key: 'applicationTrial', value: trial })
    await database.settings.delete('applicationTrialRestart')
    return trial
  })
}

export async function completeApplicationTrial(
  applicationId: string,
  observedOutcome: string,
  decision: ApplicationDecision,
  decisionReason: string,
  occurredOn: string | undefined = undefined,
  database = db,
) {
  const eventDate = occurredOn ?? await currentGameDate(database)
  return database.transaction('rw', database.settings, database.activities, database.completions, async () => {
    const setting = await database.settings.get('applicationTrial')
    if (setting?.key !== 'applicationTrial') throw new Error('找不到进行中的 7 天试跑')
    const trial = ApplicationTrialSchema.parse(setting.value)
    if (trial.applicationId !== applicationId || trial.status !== 'active') throw new Error('找不到进行中的 7 天试跑')
    if (eventDate < trial.endsOn) throw new Error(`试跑将在 ${trial.endsOn} 游戏日结束`)
    if (!observedOutcome.trim() || !decisionReason.trim()) throw new Error('请填写现实结果和决定理由')

    const behaviorResults = aggregateApplicationBehaviors(
      trial.focusActivities.map((activity) => ({
        id: activity.activityId,
        title: activity.title,
        schedule: activity.schedule,
        goal: activity.goal,
      })),
      await database.completions.toArray(),
      trial.startsOn,
      trial.endsOn,
    )
    const previousIds = new Set(trial.previousKeyActivityIds)
    const focusIds = new Set(trial.focusActivities.map((activity) => activity.activityId))
    const activities = await database.activities.toArray()
    const changed = activities
      .filter((activity) => focusIds.has(activity.id) || previousIds.has(activity.id))
      .map((activity) => ActivitySchema.parse({
        ...activity,
        isKey: previousIds.has(activity.id) && activity.enabled && !activity.archivedAt,
      }))
    if (changed.length) await database.activities.bulkPut(changed)

    const completed = ApplicationTrialSchema.parse({
      ...trial,
      status: 'completed',
      observedOutcome: observedOutcome.trim(),
      decision,
      decisionReason: decisionReason.trim(),
      behaviorResults,
      completedAt: new Date().toISOString(),
    })
    await database.settings.put({ key: 'applicationTrial', value: completed })
    return completed
  })
}

export async function createSeason(input: CreateSeasonInput, startsOn: string | undefined = undefined, database = db) {
  const eventDate = startsOn ?? await currentGameDate(database)
  return database.transaction('rw', database.seasons, database.activities, database.settings, async () => {
    if (await database.seasons.where('status').equals('active').count()) throw new Error('同一时间只能进行一个成长赛季')
    const trial = await database.settings.get('applicationTrial')
    if (trial?.key === 'applicationTrial' && trial.value.status === 'active') throw new Error('当前 7 天试跑尚未结束，不能启动成长赛季')
    const uniqueIds = [...new Set(input.focusActivityIds)]
    if (uniqueIds.length < 1 || uniqueIds.length > 3) throw new Error('成长赛季需要选择 1 至 3 项核心行为')
    const activities = await database.activities.bulkGet(uniqueIds)
    if (activities.some((activity) => !activity || !activity.enabled || activity.archivedAt)) throw new Error('核心行为必须存在且处于启用状态')
    const createdAt = new Date().toISOString()
    const season = SeasonSchema.parse({
      id: crypto.randomUUID(),
      title: input.title,
      successCriterion: input.successCriterion,
      baseline: input.baseline,
      targetOutcome: input.targetOutcome,
      startsOn: eventDate,
      endsOn: addDays(eventDate, 27),
      focusActivities: activities.map((activity) => snapshotSeasonActivity(activity!)),
      dailyPlans: [],
      suggestions: [],
      status: 'active',
      createdAt,
    })
    await database.seasons.add(season)
    return season
  })
}

export async function setSeasonDailyFocus(seasonId: string, activityIds: string[], occurredOn: string | undefined = undefined, database = db) {
  const eventDate = occurredOn ?? await currentGameDate(database)
  return database.transaction('rw', database.seasons, database.activities, async () => {
    const season = await database.seasons.get(seasonId)
    if (!season || season.status !== 'active') throw new Error('找不到进行中的成长赛季')
    if (eventDate < season.startsOn || eventDate > season.endsOn) throw new Error('今日重点必须位于当前赛季内')
    const uniqueIds = [...new Set(activityIds)]
    if (uniqueIds.length < 1 || uniqueIds.length > 3) throw new Error('今日重点需要选择 1 至 3 项行动')
    const activities = await database.activities.bulkGet(uniqueIds)
    if (activities.some((activity) => !activity || !activity.enabled || activity.archivedAt)) throw new Error('今日重点必须存在且处于启用状态')
    const next = SeasonSchema.parse({
      ...season,
      dailyPlans: [...season.dailyPlans.filter((plan) => plan.date !== eventDate), { date: eventDate, activityIds: uniqueIds }],
    })
    await database.seasons.put(next)
    return next
  })
}
export async function respondToSeasonSuggestion(
  seasonId: string,
  suggestionId: string,
  status: Exclude<SuggestionStatus, 'pending'>,
  responseNote?: string,
  database = db,
) {
  return database.transaction('rw', database.seasons, async () => {
    const season = await database.seasons.get(seasonId)
    if (!season) throw new Error('找不到这个成长赛季')
    const suggestion = season.suggestions.find((item) => item.id === suggestionId)
    if (!suggestion) throw new Error('找不到这条成长建议')
    if (suggestion.status !== 'pending') return season
    if (status === 'modified' && !responseNote?.trim()) throw new Error('修改后接受时请说明你的调整')
    const respondedAt = new Date().toISOString()
    const next = SeasonSchema.parse({
      ...season,
      suggestions: season.suggestions.map((item) => item.id === suggestionId
        ? { ...item, status, responseNote: responseNote?.trim() || undefined, respondedAt }
        : item),
    })
    await database.seasons.put(next)
    return next
  })
}

export interface CompleteSeasonOptions {
  occurredOn?: string
  earlyConclusionReason?: string
}

function getSeasonConclusion(
  season: Season,
  eventDate: string,
  earlyConclusionReason?: string,
) {
  if (eventDate < season.startsOn) throw new Error('赛季尚未开始，不能结项')
  const conclusionType = eventDate < season.endsOn ? 'early' as const : 'scheduled' as const
  const concludedOn = conclusionType === 'early' ? eventDate : season.endsOn
  const reason = earlyConclusionReason?.trim()
  if (conclusionType === 'early' && !reason) throw new Error('提前结项必须填写结束原因')
  if (season.suggestions.length > 0 && !season.suggestions.some((suggestion) => suggestion.status !== 'pending')) {
    throw new Error('结束赛季前请先处理至少一条成长建议')
  }
  return {
    concludedOn,
    conclusionType,
    earlyConclusionReason: conclusionType === 'early' ? reason : undefined,
  }
}

export async function completeSeason(
  seasonId: string,
  result: SeasonResult,
  evidence: string,
  options: CompleteSeasonOptions = {},
  database = db,
) {
  const eventDate = options.occurredOn ?? await currentGameDate(database)
  const normalizedEvidence = evidence.trim()
  if (!normalizedEvidence) throw new Error('请填写现实证据')
  return database.transaction('rw', database.seasons, async () => {
    const storedSeason = await database.seasons.get(seasonId)
    if (!storedSeason) throw new Error('找不到进行中的成长赛季')
    if (storedSeason.status === 'completed') {
      const completed = SeasonSchema.parse(storedSeason)
      const expected = getSeasonConclusion(completed, eventDate, options.earlyConclusionReason)
      if (
        completed.finalResult === result
        && completed.finalEvidence === normalizedEvidence
        && completed.concludedOn === expected.concludedOn
        && completed.conclusionType === expected.conclusionType
        && completed.earlyConclusionReason === expected.earlyConclusionReason
      ) return completed
      throw new Error('这个成长赛季已经结项')
    }
    const season = SeasonSchema.parse(storedSeason)
    const conclusion = getSeasonConclusion(season, eventDate, options.earlyConclusionReason)
    const next = SeasonSchema.parse({
      ...season,
      status: 'completed',
      finalResult: result,
      finalEvidence: normalizedEvidence,
      ...conclusion,
      completedAt: new Date().toISOString(),
    })
    await database.seasons.put(next)
    return next
  })
}

export async function completeApplicationSeason(
  seasonId: string,
  result: SeasonResult,
  evidence: string,
  observedOutcome: string,
  decision: ApplicationDecision,
  decisionReason: string,
  options: CompleteSeasonOptions = {},
  database = db,
) {
  const eventDate = options.occurredOn ?? await currentGameDate(database)
  const normalizedEvidence = evidence.trim()
  const normalizedOutcome = observedOutcome.trim()
  const normalizedDecisionReason = decisionReason.trim()
  if (!normalizedEvidence || !normalizedOutcome || !normalizedDecisionReason) {
    throw new Error('请填写现实证据、结果指标变化和决定理由')
  }
  return database.transaction('rw', database.seasons, async () => {
    const storedSeason = await database.seasons.get(seasonId)
    if (!storedSeason) throw new Error('找不到进行中的成长赛季')
    if (storedSeason.status === 'completed') {
      const completed = SeasonSchema.parse(storedSeason)
      const expected = getSeasonConclusion(completed, eventDate, options.earlyConclusionReason)
      if (
        completed.finalResult === result
        && completed.finalEvidence === normalizedEvidence
        && completed.observedOutcome === normalizedOutcome
        && completed.applicationDecision === decision
        && completed.decisionReason === normalizedDecisionReason
        && completed.concludedOn === expected.concludedOn
        && completed.conclusionType === expected.conclusionType
        && completed.earlyConclusionReason === expected.earlyConclusionReason
      ) return completed
      throw new Error('这个成长赛季已经结项')
    }
    const season = SeasonSchema.parse(storedSeason)
    if (!season.applicationContext) throw new Error('这不是知识应用赛季')
    const conclusion = getSeasonConclusion(season, eventDate, options.earlyConclusionReason)
    const next = SeasonSchema.parse({
      ...season,
      status: 'completed',
      finalResult: result,
      finalEvidence: normalizedEvidence,
      observedOutcome: normalizedOutcome,
      applicationDecision: decision,
      decisionReason: normalizedDecisionReason,
      ...conclusion,
      completedAt: new Date().toISOString(),
    })
    await database.seasons.put(next)
    return next
  })
}
