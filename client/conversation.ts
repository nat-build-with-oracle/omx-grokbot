import type { MessageRun, MessageStatus } from '../server/types.js';
import type { SendInput } from './api.js';

export type ConversationPhase = 'prepared' | 'sending' | 'accepted' | 'uncertain' | 'pending' | 'recorded' | 'error';
export interface ConversationOperation {
  messageId: string;
  agentId: string;
  prompt: string;
  phase: ConversationPhase;
  sendAttempted: boolean;
  verifying: boolean;
  error: string | null;
  run: MessageRun | null;
}
export interface ConversationState {
  selectedAgentId: string | null;
  drafts: Readonly<Record<string, string>>;
  operations: Readonly<Record<string, ConversationOperation>>;
  activeByAgent: Readonly<Record<string, string>>;
}
export type ConversationEvent =
  | { type: 'select_agent'; agentId: string | null }
  | { type: 'edit_draft'; agentId: string; prompt: string }
  | { type: 'prepare'; messageId: string }
  | { type: 'send_started'; messageId: string }
  | { type: 'verify_started'; messageId: string; refreshRecorded?: boolean }
  | { type: 'receive'; messageId: string; run: MessageRun }
  | { type: 'send_unknown'; messageId: string; message?: string }
  | { type: 'verify_failed'; messageId: string; message?: string }
  | { type: 'restore'; run: MessageRun };
export type ConversationCommand =
  | { type: 'send'; input: SendInput }
  | { type: 'verify'; messageId: string };

const phases: Record<MessageStatus, ConversationPhase> = {
  prepared: 'prepared', sending: 'sending', accepted: 'accepted',
  delivery_uncertain: 'uncertain', reply_pending: 'pending', reply_recorded: 'recorded', failed: 'error',
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function initialConversationState(): ConversationState {
  return { selectedAgentId: null, drafts: {}, operations: {}, activeByAgent: {} };
}

export function activeOperation(state: ConversationState, agentId = state.selectedAgentId): ConversationOperation | null {
  if (!agentId) return null;
  const id = state.activeByAgent[agentId];
  return id ? state.operations[id] ?? null : null;
}

function replaceOperation(state: ConversationState, operation: ConversationOperation): ConversationState {
  return { ...state, operations: { ...state.operations, [operation.messageId]: operation } };
}

/** Pure state transition: no fetch, timers, UUID generation, storage, or React effects. */
export function conversationReducer(state: ConversationState, event: ConversationEvent): ConversationState {
  if (event.type === 'select_agent') return { ...state, selectedAgentId: event.agentId };
  if (event.type === 'edit_draft') return { ...state, drafts: { ...state.drafts, [event.agentId]: event.prompt } };
  if (event.type === 'prepare') {
    const agentId = state.selectedAgentId;
    if (!uuid.test(event.messageId)) throw new TypeError('A stable UUID is required for a prepared message.');
    if (!agentId || state.operations[event.messageId]) return state;
    const previous = activeOperation(state);
    if (previous && previous.phase !== 'recorded' && !(previous.phase === 'error' && previous.run?.status === 'failed')) return state;
    const prompt = state.drafts[agentId] ?? '';
    if (!prompt.trim()) return state;
    const operation: ConversationOperation = { messageId: event.messageId, agentId, prompt, phase: 'prepared', sendAttempted: false, verifying: false, error: null, run: null };
    return { ...replaceOperation(state, operation), activeByAgent: { ...state.activeByAgent, [agentId]: event.messageId } };
  }
  if (event.type === 'restore') {
    // Hydrated server operations are never automatically eligible for a POST,
    // including a server operation whose last known status was "prepared".
    if (state.operations[event.run.id]) return state;
    const run = event.run;
    const operation: ConversationOperation = { messageId: run.id, agentId: run.agentId, prompt: run.prompt, phase: phases[run.status], sendAttempted: true, verifying: false, error: run.error, run };
    const current = activeOperation(state, run.agentId);
    const useAsActive = !current || (current.run !== null && current.run.createdAt < run.createdAt);
    return { ...replaceOperation(state, operation), activeByAgent: useAsActive ? { ...state.activeByAgent, [run.agentId]: run.id } : state.activeByAgent };
  }
  const operation = state.operations[event.messageId];
  if (!operation) return state;
  switch (event.type) {
    case 'send_started':
      if (operation.sendAttempted || operation.phase !== 'prepared') return state;
      return replaceOperation(state, { ...operation, phase: 'sending', sendAttempted: true, error: null });
    case 'verify_started':
      if (!operation.sendAttempted || operation.verifying || (operation.phase === 'recorded' && !event.refreshRecorded)) return state;
      return replaceOperation(state, { ...operation, verifying: true, error: null });
    case 'send_unknown':
      if (!operation.sendAttempted || operation.phase === 'recorded') return state;
      return replaceOperation(state, { ...operation, phase: 'uncertain', verifying: false, error: event.message ?? 'Delivery is uncertain. Check the existing reply; do not send again.' });
    case 'verify_failed':
      if (!operation.verifying) return state;
      return replaceOperation(state, { ...operation, verifying: false, error: event.message ?? 'Reply verification failed. The original operation is unchanged.' });
    case 'receive': {
      const run = event.run;
      if (run.id !== operation.messageId || run.agentId !== operation.agentId) {
        return operation.phase === 'recorded' ? state : replaceOperation(state, { ...operation, phase: 'uncertain', verifying: false, error: 'The response did not match this operation. Check its original identifier.' });
      }
      // Late accepted/pending observations cannot undo an already verified reply.
      if (operation.phase === 'recorded' && run.status !== 'reply_recorded') return replaceOperation(state, { ...operation, verifying: false });
      const phase = phases[run.status];
      const next = replaceOperation(state, { ...operation, phase, verifying: false, error: run.error, run });
      // Do not erase text the user has edited while waiting for the response.
      return phase === 'recorded' && state.drafts[operation.agentId] === operation.prompt
        ? { ...next, drafts: { ...next.drafts, [operation.agentId]: '' } } : next;
    }
  }
}

/**
 * Synchronous command producer for event handlers. Commands are data, not work:
 * the caller explicitly executes api.send/api.verify and dispatches the result.
 * Its synchronous claim protects against duplicate clicks before a UI rerender.
 */
export function createConversationController(initial = initialConversationState()) {
  let state = initial;
  const dispatch = (event: ConversationEvent): ConversationState => (state = conversationReducer(state, event));
  const prepare = (messageId: string): boolean => {
    const before = state;
    dispatch({ type: 'prepare', messageId });
    return state !== before;
  };
  const submit = (): ConversationCommand | null => {
    const operation = activeOperation(state);
    if (!operation || operation.phase !== 'prepared' || operation.sendAttempted) return null;
    dispatch({ type: 'send_started', messageId: operation.messageId });
    return { type: 'send', input: { messageId: operation.messageId, agentId: operation.agentId, prompt: operation.prompt } };
  };
  const verify = (messageId = activeOperation(state)?.messageId, refreshRecorded = false): ConversationCommand | null => {
    const operation = messageId ? state.operations[messageId] : undefined;
    if (!operation || !operation.sendAttempted || operation.verifying || (operation.phase === 'recorded' && !refreshRecorded)) return null;
    dispatch({ type: 'verify_started', messageId: operation.messageId, refreshRecorded });
    return { type: 'verify', messageId: operation.messageId };
  };
  return {
    getState: (): ConversationState => state, dispatch, prepare, submit, verify,
    prepareAndSubmit: (messageId: string): ConversationCommand | null => prepare(messageId) ? submit() : null,
  };
}
