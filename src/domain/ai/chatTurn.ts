/**
 * Pure helpers for the in-app Q&A chat turn (docs/4 §5.4, tracker S12).
 *
 * The Edge enforces the caps again (`CHAT_TURN_LIMITS`); these exist so the
 * client can shape a valid turn *before* spending a round trip, and so the
 * shaping rule (which history survives the cap) is testable without React.
 */

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatTurnLimits {
  messagesMax: number
  contentMax: number
}

export type AppendUserTurnResult =
  | {
      ok: true
      /** The conversation to keep on screen — assistant replies stay full length. */
      messages: ChatMessage[]
      /** The same turns clamped to the wire caps — the only shape to send to the Edge. */
      wire: ChatMessage[]
    }
  | { ok: false; reason: 'empty' | 'too_long' }

/** Marks a history message that was shortened to fit `contentMax` on the wire. */
export const TRUNCATION_MARK = '…'

/**
 * Append the user's next message to the history and trim to the wire caps.
 *
 * Returns the full-length `messages` for display and a `wire` copy whose every
 * message fits `contentMax`; only `wire` may be sent as `ChatTurnInput.messages`.
 *
 * Keeps the **newest** messages when the history overflows: the question being
 * asked is the one that must survive, and the oldest turns are the least likely
 * to still matter. Trimming never splits below a whole message, so the model
 * may see a conversation that starts mid-way — acceptable, since every turn
 * also carries the full snapshot and the prompt treats history as data only.
 */
export function appendUserTurn(
  history: readonly ChatMessage[],
  text: string,
  limits: ChatTurnLimits,
): AppendUserTurnResult {
  const content = text.trim()
  if (content.length === 0) return { ok: false, reason: 'empty' }
  if (content.length > limits.contentMax) return { ok: false, reason: 'too_long' }

  const messages = [...history, { role: 'user' as const, content }].slice(-limits.messagesMax)
  return {
    ok: true,
    messages,
    wire: messages.map((m) => ({ ...m, content: clampContent(m.content, limits.contentMax) })),
  }
}

/**
 * Fit one history message under the per-message wire cap.
 *
 * Only assistant replies can actually exceed it: the Edge accepts a reply up to
 * `replyMax` (1,200) but validates every *historical* message against
 * `contentMax` (500), so an unclamped long reply would make every later turn in
 * the conversation fail `validation`. Raising `contentMax` for assistant rows
 * instead would blow the 32 KiB request body cap on a full 12-message history,
 * so the old reply is shortened here — it is context for the model, not the
 * answer the user reads.
 */
function clampContent(content: string, max: number): string {
  if (content.length <= max) return content
  let head = content.slice(0, max - TRUNCATION_MARK.length)
  // Never leave a lone high surrogate where an astral character was cut in half.
  if (/[\uD800-\uDBFF]$/.test(head)) head = head.slice(0, -1)
  return head + TRUNCATION_MARK
}
