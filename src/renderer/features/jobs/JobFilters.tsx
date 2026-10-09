import { Button, Input, Select } from 'antd'
import { selectableApplicationStages, stageLabels } from '../../../shared/constants/stages'

export interface JobFilterValues {
  query?: string
  city?: string
  stage?: (typeof selectableApplicationStages)[number] | 'TECH_INTERVIEW' | 'HR_INTERVIEW' | 'DELETED'
  priority?: 1 | 2 | 3
}

export function JobFilters({
  value,
  onChange,
  onReset,
}: {
  value: JobFilterValues
  onChange: (value: JobFilterValues) => void
  onReset: () => void
}) {
  return (
    <div className="job-filters" aria-label="岗位筛选">
      <Input.Search
        aria-label="搜索岗位"
        placeholder="搜索公司、岗位或关键词"
        allowClear
        value={value.query}
        onChange={(event) => onChange({ ...value, query: event.target.value || undefined })}
      />
      <Input
        aria-label="城市筛选"
        placeholder="城市"
        allowClear
        value={value.city}
        onChange={(event) => onChange({ ...value, city: event.target.value || undefined })}
      />
      <Select
        aria-label="阶段筛选"
        allowClear
        placeholder="全部阶段"
        value={value.stage}
        onChange={(stage) => onChange({ ...value, stage })}
        options={[
          ...selectableApplicationStages.map((stage) => ({
            value: stage,
            label: stageLabels['zh-CN'][stage],
          })),
          { value: 'DELETED', label: '已删除' },
        ]}
      />
      <Select
        aria-label="优先级筛选"
        allowClear
        placeholder="全部优先级"
        value={value.priority}
        onChange={(priority) => onChange({ ...value, priority })}
        options={[
          { value: 1, label: '高优先级' },
          { value: 2, label: '普通' },
          { value: 3, label: '低优先级' },
        ]}
      />
      <Button onClick={onReset}>重置</Button>
    </div>
  )
}
