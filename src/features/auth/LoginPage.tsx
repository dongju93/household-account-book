import { useActionState, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { Button, ErrorBanner, Segmented } from '../../ui'

type Mode = 'login' | 'signup'

interface FormState {
  error?: string
  message?: string
}

export function LoginPage() {
  const { status, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const email = String(formData.get('email') ?? '').trim()
      const password = String(formData.get('password') ?? '')
      if (!email || !password) return { error: '이메일과 비밀번호를 입력하세요.' }

      if (mode === 'login') {
        const { error } = await signIn(email, password)
        if (error) return { error }
        navigate('/dashboard', { replace: true })
        return {}
      }

      const { error, needsConfirmation } = await signUp(email, password)
      if (error) return { error }
      if (needsConfirmation) {
        return { message: '확인 메일을 보냈습니다. 메일 인증 후 로그인하세요.' }
      }
      navigate('/dashboard', { replace: true })
      return {}
    },
    {},
  )

  // Already signed in → skip the login screen.
  if (status === 'authed') return <Navigate to="/dashboard" replace />

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-fill1 px-6">
      <div className="w-full max-w-[360px]">
        <div className="mb-7 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">가계부</h1>
          <p className="mt-1 text-sm text-ink2">수입 · 지출 · 저축 · 투자를 한 곳에서</p>
        </div>

        <Segmented
          className="mb-4"
          items={[
            { value: 'login', label: '로그인' },
            { value: 'signup', label: '회원가입' },
          ]}
          value={mode}
          onChange={setMode}
        />

        <form action={formAction} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink2">이메일</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              className="rounded-[12px] border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-ink2">비밀번호</span>
            <input
              name="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              placeholder="6자 이상"
              className="rounded-[12px] border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink"
            />
          </label>

          {state.error && <ErrorBanner message={state.error} />}
          {state.message && (
            <div className="rounded-[12px] border border-ok/40 bg-ok/10 px-3 py-2.5 text-xs font-medium text-ok">
              {state.message}
            </div>
          )}

          <Button type="submit" disabled={pending} className="mt-1">
            {pending ? '처리 중…' : mode === 'login' ? '로그인' : '회원가입'}
          </Button>
        </form>
      </div>
    </div>
  )
}
