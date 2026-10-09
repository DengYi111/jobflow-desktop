export const interviewTypes = ['TECHNICAL', 'HR', 'MANAGER', 'CROSS_FUNCTIONAL', 'OTHER'] as const
export type InterviewType = (typeof interviewTypes)[number]

export const interviewTypeLabels: Record<InterviewType, string> = {
  TECHNICAL: '技术面',
  HR: 'HR 面',
  MANAGER: '主管面',
  CROSS_FUNCTIONAL: '交叉面',
  OTHER: '其他',
}

export function interviewRoundLabel(roundNumber: number): string {
  const chinese = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
  const ordinal = roundNumber <= 10 ? chinese[roundNumber] : String(roundNumber)
  return `第${ordinal}面`
}
