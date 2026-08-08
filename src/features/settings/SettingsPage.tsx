import { useAsyncData } from '../../app/useAsyncData'
import { useDocumentTitle } from '../../app/useDocumentTitle'
import { useRefresh } from '../../app/useRefresh'
import { useLedger } from '../../auth/useLedger'
import { fetchTransactionsInRange, materializeMonths } from '../../data/summary'
import {
  addMonths,
  currentYearMonth,
  lastMonths,
  monthKey,
  monthWindowRange,
} from '../../lib/month'
import { AppBar, ErrorBanner, LoadingState, ScreenBody } from '../../ui'
import { AccountSection } from './AccountSection'
import { CategoryManager } from './CategoryManager'
import { GeneralSettings } from './GeneralSettings'
import { InAppAiSettings } from './InAppAiSettings'
import { RecurringManager } from './RecurringManager'

export function SettingsPage() {
  useDocumentTitle('설정')
  const { status, ledgerId, canManage, canEdit } = useLedger()
  const { version } = useRefresh()
  const historyAnchor = addMonths(currentYearMonth(), -1)
  const historyMonths = lastMonths(historyAnchor, 6)
  const historyRange = monthWindowRange(historyAnchor, historyMonths.length)
  const historyMonthKeys = historyMonths.map((month) => monthKey(month.year, month.month))
  const {
    data: suggestionTransactions,
    loading: suggestionLoading,
    error: suggestionError,
  } = useAsyncData(async () => {
    // Viewers get no recommendation data path. Editors/owners materialize the
    // six completed months before reading so recurring rows cannot be silently
    // omitted from the budget evidence.
    if (!ledgerId || !canEdit) return []
    await materializeMonths(ledgerId, historyMonths)
    return fetchTransactionsInRange(ledgerId, historyRange.start, historyRange.endExclusive)
  }, [ledgerId, canEdit, version])
  // useAsyncData retains the previous result during a dependency reload. Never
  // let one ledger's history briefly produce suggestions for the next ledger.
  const readySuggestionTransactions =
    suggestionLoading || suggestionError ? [] : (suggestionTransactions ?? [])

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
            {canEdit && suggestionError && (
              <ErrorBanner
                message="추천용 거래 이력을 불러오지 못했습니다. 기존 설정은 계속 사용할 수 있습니다."
                variant={suggestionError.permission ? 'permission' : 'error'}
              />
            )}
            <CategoryManager
              ledgerId={ledgerId}
              canManage={canManage}
              historyTransactions={readySuggestionTransactions}
              historyMonthKeys={historyMonthKeys}
            />
            <RecurringManager
              ledgerId={ledgerId}
              canEdit={canEdit}
              historyTransactions={readySuggestionTransactions}
            />
            <InAppAiSettings />
            <AccountSection />
          </>
        )}
      </ScreenBody>
    </>
  )
}
