import type { ReactNode } from 'react'

import type { DescribedError } from '../../data/errors'
import { Card, EmptyState, ErrorBanner, LoadingState } from '../../ui'

export function SettingsSection({
  title,
  canAdd,
  onAdd,
  actionError,
  loading,
  error,
  empty,
  children,
}: {
  title: string
  canAdd?: boolean
  onAdd?: () => void
  actionError?: string | null
  loading?: boolean
  error?: DescribedError | null
  empty?: { title: string; description: string } | null
  children?: ReactNode
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <h2 className="text-[12.5px] font-bold text-ink2">{title}</h2>
        {canAdd && onAdd && (
          <button type="button" onClick={onAdd} className="text-xs font-bold text-ink">
            ＋ 추가
          </button>
        )}
      </div>

      {actionError && <ErrorBanner message={actionError} />}

      <Card pad="p-0">
        {loading && <LoadingState />}
        {error && (
          <div className="p-3">
            <ErrorBanner
              message={error.message}
              variant={error.permission ? 'permission' : 'error'}
            />
          </div>
        )}
        {!loading && !error && (
          <>
            {empty && <EmptyState title={empty.title} description={empty.description} />}
            {!empty && children}
          </>
        )}
      </Card>
    </section>
  )
}
