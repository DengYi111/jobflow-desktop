import { useCallback, useEffect, useRef, useState } from 'react'

export type AutosaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
export interface AutosaveOptions<T> {
  value: T
  revision: string
  save(value: T): Promise<unknown>
  enabled?: boolean
  delayMs?: number
}

export function useAutosave<T>({ value, revision, save, enabled = true, delayMs = 500 }: AutosaveOptions<T>) {
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [error, setError] = useState<string>()
  const valueRef = useRef(value)
  const scheduledValueRef = useRef(value)
  const saveRef = useRef(save)
  const lastSavedRef = useRef(value)
  const revisionRef = useRef(revision)
  const renderedRevisionRef = useRef(revision)
  const sequenceRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const mountedRef = useRef(true)

  valueRef.current = value
  saveRef.current = save
  renderedRevisionRef.current = revision

  const persist = useCallback((snapshot: T, sequence: number) => {
    if (mountedRef.current) {
      setStatus('saving')
      setError(undefined)
    }
    const operation = queueRef.current.then(() => saveRef.current(snapshot))
    queueRef.current = operation.then(
      () => undefined,
      () => undefined,
    )
    return operation.then(
      () => {
        if (sequence === sequenceRef.current && Object.is(snapshot, valueRef.current)) {
          lastSavedRef.current = snapshot
          if (mountedRef.current) setStatus('saved')
        }
      },
      (cause: unknown) => {
        if (sequence === sequenceRef.current) {
          if (mountedRef.current) {
            setError(cause instanceof Error ? cause.message : '保存失败，请重试')
            setStatus('error')
          }
        }
      },
    )
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (revisionRef.current === revision) return
    revisionRef.current = revision
    sequenceRef.current += 1
    if (timerRef.current) clearTimeout(timerRef.current)
    lastSavedRef.current = value
    setError(undefined)
    setStatus('idle')
  }, [revision, value])

  useEffect(() => {
    if (!enabled || Object.is(value, lastSavedRef.current)) return
    const sequence = ++sequenceRef.current
    scheduledValueRef.current = value
    setStatus('dirty')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void persist(value, sequence)
    }, delayMs)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (
        renderedRevisionRef.current !== revision &&
        enabled &&
        !Object.is(scheduledValueRef.current, lastSavedRef.current)
      ) {
        void persist(scheduledValueRef.current, sequenceRef.current)
      }
    }
  }, [delayMs, enabled, persist, revision, value])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (enabled && !Object.is(valueRef.current, lastSavedRef.current)) {
        const sequence = ++sequenceRef.current
        void persist(valueRef.current, sequence)
      }
    },
    [enabled, persist],
  )

  const flush = useCallback(async () => {
    if (!enabled || Object.is(valueRef.current, lastSavedRef.current)) return
    if (timerRef.current) clearTimeout(timerRef.current)
    const sequence = ++sequenceRef.current
    await persist(valueRef.current, sequence)
  }, [enabled, persist])

  const retry = useCallback(async () => {
    const sequence = ++sequenceRef.current
    await persist(valueRef.current, sequence)
  }, [persist])

  return { status, error, flush, retry }
}
