export const jobsPageSizes = [6, 15, 30, 50] as const
export type JobsPageSize = (typeof jobsPageSizes)[number]
const storageKey = 'jobflow.jobs.pageSize'

function isJobsPageSize(value: number): value is JobsPageSize {
  return jobsPageSizes.some((size) => size === value)
}

export function getJobsPageSize(): JobsPageSize {
  try {
    const value = Number(window.localStorage.getItem(storageKey))
    return isJobsPageSize(value) ? value : 6
  } catch {
    return 6
  }
}

export function setJobsPageSize(value: JobsPageSize): void {
  if (!isJobsPageSize(value)) return
  try {
    window.localStorage.setItem(storageKey, String(value))
  } catch {
    // The current page still works when browser storage is unavailable.
  }
}
