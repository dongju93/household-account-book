import { useAuth } from '../../auth/useAuth'
import { Card, SectionHeader } from '../../ui'

/**
 * 계정 (docs/5. frontend-redesign-plan.md §6.7, last section).
 *
 * 로그아웃 used to be a full-width ghost `Button` floating under the managed
 * lists, which read like the screen's primary action. §6.7 puts it in its own
 * account group and asks that it not look like a main setting — so it is a row
 * inside the section's card, at the bottom of the screen, styled as an action
 * rather than a call to action. Signing out is not destructive, so it carries no
 * danger colour and keeps its current one-step behaviour.
 */
export function AccountSection() {
  const { user, signOut } = useAuth()

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="계정" />
      <Card pad="p-0">
        {user?.email && (
          <div className="flex min-h-12 items-center justify-between gap-3 border-b border-line-soft px-3 py-2.5">
            <span className="text-body font-semibold text-ink">이메일</span>
            <span className="text-body truncate text-ink2">{user.email}</span>
          </div>
        )}
        <button
          type="button"
          onClick={signOut}
          className="pressable text-body flex min-h-12 w-full items-center px-3 py-2.5 text-left font-semibold text-ink2 hover:bg-fill1 hover:text-ink"
        >
          로그아웃
        </button>
      </Card>
    </section>
  )
}
