import { useEffect, useState } from 'react'

/** Protect forms that are destroyed on dismissal; unchanged forms close directly. */
export function useUnsavedChanges(
  value: string,
  active: boolean,
  busy: boolean,
  onClose: () => void,
) {
  const [initialValue] = useState(value)
  const dirty = active && value !== initialValue
  useEffect(() => {
    if (!dirty && !busy) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, busy])

  return () => {
    if (busy) return
    if (!dirty || window.confirm('저장하지 않은 변경 사항을 버리고 닫을까요?')) onClose()
  }
}
