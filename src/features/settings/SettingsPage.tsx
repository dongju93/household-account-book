import { useAuth } from '../../auth/useAuth'
import { useLedger } from '../../auth/useLedger'
import { AppBar, Button, ErrorBanner, LoadingState, ScreenBody } from '../../ui'
import { CategoryManager } from './CategoryManager'
import { GeneralSettings } from './GeneralSettings'
import { RecurringManager } from './RecurringManager'

export function SettingsPage() {
  const { status, ledgerId, canManage, canEdit } = useLedger()
  const { signOut } = useAuth()

  return (
    <>
      <AppBar title="설정" center />
      <ScreenBody className="flex flex-col gap-5">
        {status === 'loading' && <LoadingState />}
        {status === 'error' && <ErrorBanner message="가계부 정보를 불러오지 못했습니다." />}

        {status === 'ready' && ledgerId && (
          <>
            <RecurringManager ledgerId={ledgerId} canEdit={canEdit} />
            <CategoryManager ledgerId={ledgerId} canManage={canManage} />
            <GeneralSettings />
            <Button variant="ghost" onClick={signOut}>
              로그아웃
            </Button>
          </>
        )}
      </ScreenBody>
    </>
  )
}
