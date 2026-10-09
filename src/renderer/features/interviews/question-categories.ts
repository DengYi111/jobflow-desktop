import { defaultQuestionCategories } from '../../../main/services/interviews.service'

export function getQuestionCategories(existing: readonly string[]): string[] {
  const defaults = new Set<string>(defaultQuestionCategories)
  const custom = [
    ...new Set(
      existing.map((category) => category.trim()).filter((category) => category && !defaults.has(category)),
    ),
  ].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  return [...defaultQuestionCategories, ...custom]
}
