import { useDocumentTitle } from '../../app/useDocumentTitle'
import { useLedger } from '../../auth/useLedger'
import { AppBar, ErrorBanner, LoadingState, ScreenBody } from '../../ui'
import { AccountSection } from './AccountSection'
import { CategoryManager } from './CategoryManager'
import { GeneralSettings } from './GeneralSettings'
import { InAppAiSettings } from './InAppAiSettings'
import { RecurringManager } from './RecurringManager'

export function SettingsPage() {
  useDocumentTitle('설정')
  const { status, ledgerId, canManage, canEdit } = useLedger()

  return (
    <>
      <AppBar title="설정" center />
      {/*
        §6.7 order: 가계부 일반 → 카테고리 → 고정 항목 → 인앱 AI → 계정.
        It runs from "what this ledger is", through the two lists that get edited
        most, to the two things that should not be hit casually — the AI opt-in
        and signing out. Previously 고정 항목 led the screen and 로그아웃 sat loose
        underneath, so the least-frequent action was the most prominent.
      */}
      <ScreenBody className="flex flex-col gap-7">
        {status === 'loading' && <LoadingState />}
        {status === 'error' && <ErrorBanner message="가계부 정보를 불러오지 못했습니다." />}

        {status === 'ready' && ledgerId && (
          <>
            <GeneralSettings />
            <CategoryManager ledgerId={ledgerId} canManage={canManage} />
            <RecurringManager ledgerId={ledgerId} canEdit={canEdit} />
            <InAppAiSettings />
            <AccountSection />
          </>
        )}
      </ScreenBody>
    </>
  )
}
