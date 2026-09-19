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
  | { ok: true; messages: ChatMessage[] }
  | { ok: false; reason: 'empty' | 'too_long' }

/**
 * Append the user's next message to the history and trim to the wire caps.
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

  const messages = [...history, { role: 'user' as const, content }]
  return { ok: true, messages: messages.slice(-limits.messagesMax) }
}
