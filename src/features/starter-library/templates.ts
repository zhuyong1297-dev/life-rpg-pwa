import type { NewActivity } from '../../db'
import {
  CoachPlanDraftSchema,
  createCoachPlanDraft,
  type CoachBehaviorRole,
  type CoachPlanDraft,
  type GrowthDomain,
  type HabitAnchor,
} from '../../domain'

export interface StarterHabitTemplate extends Omit<NewActivity, 'isKey' | 'habitFormation'> {
  id: string
  summary: string
  habitAnchor?: HabitAnchor
}

export interface StarterPlanTemplate {
  id: string
  title: string
  summary: string
  successCriterion: string
  targetOutcome: string
  behaviors: Array<StarterHabitTemplate & { role: CoachBehaviorRole }>
}

const dailyDuration = (
  id: string,
  title: string,
  summary: string,
  domain: GrowthDomain,
  difficulty: NewActivity['difficulty'],
  cue: string,
  protocol: string,
  minutes: [number, number],
  scheduledTime?: string,
): StarterHabitTemplate => ({
  id,
  title,
  summary,
  scheduledTime,
  habitAnchor: scheduledTime ? { kind: 'time', time: scheduledTime } : { kind: 'event', label: cue },
  cue,
  protocol,
  type: 'habit',
  domain,
  difficulty,
  goal: {
    kind: 'tiered',
    metric: 'duration',
    unit: '秒',
    inputUnit: '分钟',
    thresholds: [minutes[0] * 60, minutes[1] * 60],
  },
  schedule: { kind: 'daily' },
  enabled: true,
})

export const starterHabitTemplates: readonly StarterHabitTemplate[] = [
  dailyDuration('health-outdoor-walk', '户外走一走', '用短时间活动身体，不要求运动强度。', 'health', '简单', '白天第一次可以出门时', '基础：到户外走 5 分钟。标准：继续走到 15 分钟。', [5, 15]),
  dailyDuration('health-phone-off', '睡前放下手机', '给睡前留一段不被信息占用的时间。', 'health', '简单', '准备上床前', '基础：手机离开床边 10 分钟。标准：保持 30 分钟无手机缓冲。', [10, 30], '22:30'),
  dailyDuration('learning-read', '阅读一点', '把阅读门槛降到随时能开始。', 'learning', '简单', '固定阅读时段或有空时', '基础：阅读 5 分钟。标准：阅读并标记一个重点，共 15 分钟。', [5, 15]),
  dailyDuration('learning-practice', '练习一个知识点', '从看懂转向一次可验证的练习。', 'learning', '普通', '学习开始前', '基础：完成 10 分钟练习。标准：完成 25 分钟并检查结果。', [10, 25]),
  dailyDuration('creation-small-piece', '写下一小段', '先产生可见内容，不等灵感完整。', 'creation', '简单', '准备创作或想法出现时', '基础：写 5 分钟。标准：写 15 分钟并留下可继续的下一句。', [5, 15]),
  dailyDuration('creation-project', '推进作品十五分钟', '每天让作品向前移动一小步。', 'creation', '普通', '今天的其他事情挤进来前', '基础：只推进当前作品 15 分钟。标准：不切换目标推进 30 分钟。', [15, 30]),
  dailyDuration('career-single-start', '单点开工', '用一个结果和一个下一步减少开工犹豫。', 'career', '普通', '第一段正式工作开始前', '基础：写下当前结果和立即动作，开始 10 分钟。标准：不切换目标工作 25 分钟。', [10, 25]),
  dailyDuration('career-deliverable', '收尾一个可交付成果', '把进行中的事收束成别人或未来的自己能使用的结果。', 'career', '普通', '今天工作进入收尾阶段时', '基础：用 10 分钟明确缺口并补一步。标准：用 25 分钟形成一份可交付结果。', [10, 25]),
  dailyDuration('life-reset', '五分钟复位', '只处理一个小区域，让生活环境恢复可用。', 'life', '简单', '看到最影响当下的杂乱时', '基础：整理 5 分钟。标准：整理 10 分钟并清除一个明显阻碍。', [5, 10]),
  dailyDuration('life-tomorrow-step', '写下明日第一步', '把未完成事项从脑中移到一个可开始的动作。', 'life', '简单', '结束今天的事务前', '基础：写下明天第一个动作，用时 3 分钟。标准：再整理未完成事项，共 5 分钟。', [3, 5], '23:00'),
  dailyDuration('mindset-breathe', '三分钟呼吸', '用一段安静呼吸为当前状态留出空间。', 'mindset', '简单', '情绪紧绷或准备切换事情时', '基础：安静呼吸 3 分钟。标准：继续到 5 分钟，只要走神就回到呼吸。', [3, 5]),
  dailyDuration('mindset-one-line', '写一句今日感受', '用一句话识别当下状态，不强迫分析。', 'mindset', '简单', '一天中想停一下时', '基础：用 3 分钟写下感受。标准：用 10 分钟补充什么帮助或阻碍了今天。', [3, 10]),
]

const habitById = new Map(starterHabitTemplates.map((template) => [template.id, template]))

function planBehavior(id: string, role: CoachBehaviorRole): StarterHabitTemplate & { role: CoachBehaviorRole } {
  const template = habitById.get(id)
  if (!template) throw new Error(`找不到推荐行动：${id}`)
  return { ...template, role }
}

const weeklyDuration = (
  id: string,
  title: string,
  summary: string,
  domain: GrowthDomain,
  difficulty: NewActivity['difficulty'],
  cue: string,
  protocol: string,
  minutes: [number, number],
  times: number,
  role: CoachBehaviorRole,
): StarterHabitTemplate & { role: CoachBehaviorRole } => ({
  ...dailyDuration(id, title, summary, domain, difficulty, cue, protocol, minutes),
  schedule: { kind: 'weekly', times },
  role,
})

export const starterPlanTemplates: readonly StarterPlanTemplate[] = [
  {
    id: 'steady-rhythm',
    title: '稳定生活节奏',
    summary: '用早晨启动、单点推进和夜间收尾给一天建立边界。',
    successCriterion: '28 天内三项行为各完成基础层至少 20 天，并用一次复盘判断生活是否更稳定。',
    targetOutcome: '早上能开始、白天能推进一件重要的事、晚上能结束当天。',
    behaviors: [
      planBehavior('health-outdoor-walk', 'start'),
      planBehavior('career-single-start', 'progress'),
      planBehavior('life-tomorrow-step', 'maintain'),
    ],
  },
  {
    id: 'body-reset',
    title: '重启身体状态',
    summary: '从户外活动、短时练习和睡前缓冲建立可持续的恢复节奏。',
    successCriterion: '28 天内三项行为各完成基础层至少 18 天，并记录自己的白天状态变化。',
    targetOutcome: '白天更愿意活动，晚上有明确的缓冲过程。',
    behaviors: [
      planBehavior('health-outdoor-walk', 'start'),
      { ...dailyDuration('health-basic-training', '基础训练', '用小份量身体练习建立可持续性。', 'health', '普通', '当天精力较稳定时', '基础：完成 10 分钟训练。标准：完成 25 分钟并做简短放松。', [10, 25]), role: 'progress' },
      planBehavior('health-phone-off', 'maintain'),
    ],
  },
  {
    id: 'learning-rhythm',
    title: '建立学习节奏',
    summary: '先打开材料，再主动练习，最后用输出检验理解。',
    successCriterion: '28 天内阅读和练习各完成基础层至少 20 天，并完成至少 3 次每周输出。',
    targetOutcome: '学习不再只停留在收集和浏览，能留下练习或输出证据。',
    behaviors: [
      planBehavior('learning-read', 'start'),
      planBehavior('learning-practice', 'progress'),
      weeklyDuration('learning-weekly-output', '每周输出', '用一份小输出检查本周真正理解了什么。', 'creation', '普通', '每周复盘学习时', '基础：用 10 分钟整理一条要点。标准：用 20 分钟形成一份可查看的小输出。', [10, 20], 1, 'maintain'),
    ],
  },
  {
    id: 'important-project',
    title: '推进重要项目',
    summary: '用明确下一步、不切换的推进和每周检查防止项目失速。',
    successCriterion: '28 天内至少 20 天明确并推进了下一步，完成 4 次每周检查，并留下一项可验证成果。',
    targetOutcome: '重要项目每周都有可见进展，而不是只有更多想法和待办。',
    behaviors: [
      { ...dailyDuration('career-next-step', '明确下一步', '在开始前把项目缩小成一个可立即执行的动作。', 'career', '简单', '准备推进项目前', '基础：用 3 分钟写下下一步。标准：用 5 分钟同时写清完成标准。', [3, 5]), role: 'start' },
      planBehavior('career-single-start', 'progress'),
      weeklyDuration('career-weekly-check', '每周检查', '每周只判断结果、阻力和下一步。', 'career', '简单', '每周固定的项目检查时段', '基础：用 10 分钟检查进展。标准：用 20 分钟补充主要阻力和下周第一步。', [10, 20], 1, 'maintain'),
    ],
  },
]

export function buildStarterActivity(template: StarterHabitTemplate, isKey: boolean, now = new Date()): NewActivity {
  const { id: _id, summary: _summary, habitAnchor, ...activity } = template
  return {
    ...activity,
    habitFormation: activity.schedule.kind === 'daily' ? { configuredAt: now.toISOString(), anchor: habitAnchor } : undefined,
    isKey,
  }
}

export function buildStarterPlanDraft(template: StarterPlanTemplate, now = new Date(), id = crypto.randomUUID()): CoachPlanDraft {
  const base = createCoachPlanDraft(now, id)
  return CoachPlanDraftSchema.parse({
    ...base,
    title: template.title,
    successCriterion: template.successCriterion,
    targetOutcome: template.targetOutcome,
    behaviors: template.behaviors.map(({ id: _templateId, summary: _summary, habitAnchor, role, ...behavior }) => ({
      ...behavior,
      habitAnchor: behavior.schedule.kind === 'daily' ? habitAnchor : undefined,
      id: crypto.randomUUID(),
      role,
      source: 'new' as const,
      confirmed: false,
    })),
  })
}

export function getStarterHabitsForDomain(domain: GrowthDomain) {
  return starterHabitTemplates.filter((template) => template.domain === domain)
}
