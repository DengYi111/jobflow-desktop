import { useEffect, useState } from 'react'
import type { JobFlowChange } from '../../shared/contracts/api'

export function useJobFlowChanges(domains: readonly JobFlowChange['domain'][]): number {
  const domainKey = domains.join('|')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const subscribe = window.jobflow?.changes?.subscribe
    if (!subscribe) return
    const accepted = new Set(domainKey.split('|'))
    return subscribe(({ domain }) => {
      if (accepted.has(domain)) setVersion((current) => current + 1)
    })
  }, [domainKey])

  return version
}
