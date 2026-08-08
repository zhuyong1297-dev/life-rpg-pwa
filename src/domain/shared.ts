import { z } from 'zod'

export const datePattern = /^\d{4}-\d{2}-\d{2}$/
export const dateString = z.string().regex(datePattern, '日期必须使用 YYYY-MM-DD')
export const scheduledTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, '时间必须使用 HH:mm')
export const timestamp = z.string().datetime()
