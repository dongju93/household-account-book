import { useActionState, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { useDocumentTitle } from '../../app/useDocumentTitle'
import { useAuth } from '../../auth/useAuth'
import { Button, ErrorBanner, PasswordInput, Segmented, TextInput } from '../../ui'

type Mode = 'login' | 'signup'

interface FormState {
  error?: string
  message?: string
}

export function LoginPage() {
  useDocumentTitle('로그인')
  const { status, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const emailField = formData.get('email')
      const passwordField = formData.get('password')
      const email = (typeof emailField === 'string' ? emailField : '').trim()
      const password = typeof passwordField === 'string' ? passwordField : ''
      if (!email || !password) return { error: '이메일과 비밀번호를 입력하세요.' }

      if (mode === 'login') {
        const { error } = await signIn(email, password)
        if (error) return { error }
        void navigate('/dashboard', { replace: true })
        return {}
      }

      const { error, needsConfirmation } = await signUp(email, password)
      if (error) return { error }
      if (needsConfirmation) {
        return { message: '확인 메일을 보냈습니다. 메일 인증 후 로그인하세요.' }
      }
      void navigate('/dashboard', { replace: true })
      return {}
    },
    {},
  )

  // Already signed in → skip the login screen.
  if (status === 'authed') return <Navigate to="/dashboard" replace />

  return (
    /*
      §6.1: same single column, same form, same login/signup switch. What changed
      is that the screen now says what the product is before asking for an
      account — in one plain sentence that promises no bank or card linking,
      because there is none — and that the form itself reads more sharply.
    */
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6 py-10">
      <main className="w-full max-w-[360px]">
        <div className="mb-8">
          <h1 className="text-title text-ink">가계부</h1>
          <p className="text-body mt-2 text-ink2 text-pretty">
            직접 기록해서 수입 · 지출 · 저축 · 투자를 한 곳에서 정리합니다.
          </p>
          <p className="text-caption mt-3 text-ink2">
            기록은 로그인한 계정으로만 열립니다. 은행·카드 연결은 없습니다.
          </p>
        </div>

        <Segmented
          className="mb-5"
          label="로그인 또는 회원가입"
          items={[
            { value: 'login', label: '로그인' },
            { value: 'signup', label: '회원가입' },
          ]}
          value={mode}
          onChange={setMode}
        />

        <form action={formAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-caption font-semibold text-ink2">이메일</span>
            <TextInput
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-caption font-semibold text-ink2">비밀번호</span>
            <PasswordInput
              name="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              placeholder="6자 이상"
            />
          </label>

          {/* Both outcomes render in the same slot, directly above the submit
              button, so resolving the action never pushes the button (§6.1). */}
          {state.error && <ErrorBanner message={state.error} />}
          {state.message && (
            <div
              role="status"
              className="text-caption rounded-surface border border-status-success/35 bg-status-success/8 px-3 py-2.5 text-status-success"
            >
              {state.message}
            </div>
          )}

          <Button type="submit" disabled={pending}>
            {pending ? '처리 중…' : mode === 'login' ? '로그인' : '회원가입'}
          </Button>
        </form>
      </main>
    </div>
  )
}
