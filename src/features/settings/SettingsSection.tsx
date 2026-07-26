import type { ReactNode } from 'react'

import type { DescribedError } from '../../data/errors'
import {
  Card,
  EmptyState,
  ErrorBanner,
  SectionHeader,
  SettingsListSkeleton,
  TextAction,
} from '../../ui'

/**
 * One managed list in 설정 (docs/5. frontend-redesign-plan.md §6.7).
 *
 * §6.7 asks for the long management list to be grouped and for each group's
 * title and description to sit at clearly different levels — while adding no new
 * derived information (no item counts). So the header is a real `SectionHeader`,
 * an optional `description` explains the group in the words already available,
 * and the loading state is a row-shaped skeleton rather than a spinner (§7.1).
 */
export function SettingsSection({
  title,
  description,
  canAdd,
  onAdd,
  actionError,
  loading,
  error,
  empty,
  children,
}: {
  title: string
  description?: string
  canAdd?: boolean
  onAdd?: () => void
  actionError?: string | null
  loading?: boolean
  error?: DescribedError | null
  empty?: { title: string; description: string } | null
  children?: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader
        title={title}
        action={
          // §6.7: a read-only member never sees an affordance they cannot use.
          canAdd && onAdd ? <TextAction onClick={onAdd}>＋ 추가</TextAction> : undefined
        }
      />
      {description && <p className="text-caption -mt-1 text-ink2 text-pretty">{description}</p>}

      {actionError && <ErrorBanner message={actionError} />}

      <Card pad="p-0">
        {loading && <SettingsListSkeleton />}
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
