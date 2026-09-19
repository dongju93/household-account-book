import { useAiSettings } from '../../ai/useAiSettings'
import { useLedger } from '../../auth/useLedger'
import { CHAT_SURFACE_LABEL } from './ChatSheet'

/**
 * Global entry to the chat sheet (spec §5.4 "AppLayout에 AI 진입"). A pill
 * floated above the tab bar rather than a tab: chat is opt-in and dark-launched,
 * so it must be able to disappear without reshaping the navigation.
 *
 * Renders nothing for opted-out users (the Edge rejects them anyway) and after
 * the gateway has said `flag_off` for this session (`hidden`), so the flag can
 * stay off for as long as the rollout plan wants without a dead button.
 */
export function ChatLauncher({ hidden, onOpen }: { hidden: boolean; onOpen: () => void }) {
  const { enabled } = useAiSettings()
  const { ledgerId } = useLedger()
  if (hidden || !enabled || !ledgerId) return null

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${CHAT_SURFACE_LABEL}에게 묻기`}
      // Above the 56px tab bar (+ home indicator), tucked to the right edge of
      // the 480px column so it never sits over the centre add button.
      className="pressable text-caption fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-(--z-nav) flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-paper px-3.5 font-semibold text-ink shadow-raised hover:bg-fill1"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
      </svg>
      {CHAT_SURFACE_LABEL}
    </button>
  )
}
