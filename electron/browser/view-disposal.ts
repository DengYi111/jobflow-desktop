export function createViewDisposer(
  windowIsDestroyed: () => boolean,
  contentsIsDestroyed: () => boolean,
  detach: () => void,
  close: () => void,
): () => void {
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    if (!windowIsDestroyed()) detach()
    if (!contentsIsDestroyed()) close()
  }
}
