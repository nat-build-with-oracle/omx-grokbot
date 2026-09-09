import type { CreationRun } from '../server/creation.js';
import type { Agent, HistoryStatus, MessageRun, SearchHit, TranscriptPage } from '../server/types.js';
import { isTranscriptPage } from './transcript.js';

export interface SessionState { authenticated: boolean }
export interface RequestOptions { signal?: AbortSignal }
export interface SendInput { messageId: string; agentId: string; prompt: string }
export interface SearchInput { query: string; mode?: 'vector' | 'keyword'; limit?: number; project?: string }
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Contains only the server's safe error fields, never response bodies or headers. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number | undefined;
  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export interface CreationInput { operationId: string; name: string; description?: string }
export interface ConnectionInfo { grokHost: string; historyHost: string; mcpUrl: string; auth: string; publicDeploymentVerified: boolean }
export interface ApiClient {
  transcript(agentId: string, beforeRowid?: number, options?: RequestOptions): Promise<TranscriptPage>;
  connections(options?: RequestOptions): Promise<ConnectionInfo>;
  creations(options?: RequestOptions): Promise<CreationRun[]>;
  createAgent(input: CreationInput, options?: RequestOptions): Promise<CreationRun>;
  verifyCreation(operationId: string, options?: RequestOptions): Promise<CreationRun>;
  session(options?: RequestOptions): Promise<SessionState>;
  login(secret: string, options?: RequestOptions): Promise<SessionState>;
  logout(options?: RequestOptions): Promise<SessionState>;
  agents(options?: RequestOptions): Promise<{ agents: Agent[]; health: Record<string, unknown> }>;
  messages(options?: RequestOptions): Promise<MessageRun[]>;
  send(input: SendInput, options?: RequestOptions): Promise<MessageRun>;
  verify(messageId: string, options?: RequestOptions): Promise<MessageRun>;
  historyStatus(options?: RequestOptions): Promise<HistoryStatus>;
  search(input: SearchInput, options?: RequestOptions): Promise<SearchHit[]>;
  readHistory(id: string, options?: RequestOptions): Promise<SearchHit | null>;
}

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => typeof value === 'object' && value !== null && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === 'string';
const nullableString = (value: unknown): value is string | null => value === null || string(value);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const statuses = new Set(['prepared', 'sending', 'accepted', 'delivery_uncertain', 'reply_pending', 'reply_recorded', 'failed']);

function isCreation(value: unknown): value is CreationRun {
  return object(value) && string(value.operationId) && string(value.name) && string(value.description)
    && nullableString(value.agentId) && ['creation_uncertain', 'created_unverified', 'verified'].includes(String(value.status))
    && (value.status !== 'verified' || (string(value.agentId) && value.agentId.length > 0));
}

function isAgent(value: unknown): value is Agent {
  return object(value) && string(value.agentId) && string(value.name);
}

function isMessage(value: unknown): value is MessageRun {
  return object(value) && string(value.id) && string(value.agentId) && string(value.agentName)
    && string(value.prompt) && string(value.marker) && (value.afterRowid === null || integer(value.afterRowid))
    && string(value.status) && statuses.has(value.status) && nullableString(value.reply)
    && nullableString(value.requestId) && nullableString(value.error)
    && string(value.createdAt) && string(value.updatedAt);
}

function isSearchHit(value: unknown): value is SearchHit {
  return object(value) && string(value.id) && string(value.text) && string(value.project) && string(value.source)
    && integer(value.lineStart) && integer(value.lineEnd) && value.lineEnd >= value.lineStart
    && typeof value.score === 'number' && Number.isFinite(value.score)
    && (value.mode === 'vector' || value.mode === 'keyword');
}

function isHistoryStatus(value: unknown): value is HistoryStatus {
  return object(value) && integer(value.documents) && integer(value.chunks) && integer(value.embeddedChunks)
    && string(value.model) && Array.isArray(value.projects) && value.projects.every(string);
}

function expected<T>(value: unknown, guard: (candidate: unknown) => candidate is T): T {
  if (!guard(value)) throw new ApiError('invalid_response', 'The server returned an unexpected response. Check the existing operation before sending again.');
  return value;
}

function requireId(id: string): string {
  if (!id.trim()) throw new ApiError('invalid_input', 'An identifier is required.');
  return encodeURIComponent(id);
}

/** Same-origin only. Authentication/CSRF material is held in memory, never storage. */
export function createApiClient(fetcher: FetchLike = (input, init) => globalThis.fetch(input, init), base = '/'): ApiClient {
  let csrfToken: string | null = null;
  let authRevision = 0;

  async function request(path: string, method: 'GET' | 'POST', body: unknown, options: RequestOptions = {}, csrf = true): Promise<unknown> {
    const requestAuthRevision = authRevision;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
      if (csrf) {
        if (!csrfToken) throw new ApiError('csrf_missing', 'Refresh your signed-in session before performing this action.');
        headers['X-CSRF-Token'] = csrfToken;
      }
    }
    let response: Response;
    try {
      response = await fetcher(`${base}${path.replace(/^\//, '')}`, {
        method, headers, credentials: 'same-origin', redirect: 'error', cache: 'no-store',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
    } catch {
      // A timeout/abort may happen after the server has performed a send.
      throw new ApiError('network_error', 'The request could not be confirmed. Check the existing operation before sending again.');
    }
    let value: unknown;
    try { value = await response.json(); } catch { value = undefined; }
    if (!response.ok) {
      if (response.status === 401 && requestAuthRevision === authRevision) { csrfToken = null; authRevision += 1; }
      const safe = object(value) && object(value.error) ? value.error : null;
      const code = safe && string(safe.code) && /^[a-zA-Z0-9_-]{1,80}$/.test(safe.code) ? safe.code : 'http_error';
      const message = safe && string(safe.message) ? safe.message.slice(0, 500) : `The server rejected the request (HTTP ${response.status}).`;
      throw new ApiError(code, message, response.status);
    }
    if (value === undefined) throw new ApiError('invalid_response', 'The server returned an unreadable response. Check the existing operation before sending again.', response.status);
    return value;
  }

  function applySession(value: unknown, revision: number, requireToken = false): SessionState {
    if (!object(value) || typeof value.authenticated !== 'boolean'
      || (value.csrfToken !== undefined && !string(value.csrfToken))
      || (requireToken && (!value.authenticated || !string(value.csrfToken) || !value.csrfToken))) {
      throw new ApiError('invalid_response', 'The server returned an unexpected session response.');
    }
    if (revision === authRevision) csrfToken = value.authenticated && string(value.csrfToken) && value.csrfToken ? value.csrfToken : null;
    // Do not expose the CSRF value to view models or persistence callers.
    return { authenticated: value.authenticated };
  }

  return {
    async transcript(agentId, beforeRowid, options) {
      requireId(agentId);
      if (beforeRowid !== undefined && (!Number.isSafeInteger(beforeRowid) || beforeRowid < 1)) throw new ApiError('invalid_input', 'History page must use a positive row identifier.');
      const page = expected(await request(`/api/agents/${agentId}/transcript${beforeRowid === undefined ? '' : `?before=${beforeRowid}`}`, 'GET', undefined, options), isTranscriptPage);
      if (page.agentId !== agentId || (beforeRowid !== undefined && (page.entries.some(e => e.rowid >= beforeRowid) || (page.nextBeforeRowid !== null && page.nextBeforeRowid >= beforeRowid)))) {
        throw new ApiError('invalid_response', 'History did not match the selected bot or page.');
      }
      return page;
    },
    async connections(options) {
      return expected(await request('/api/connections', 'GET', undefined, options), (v): v is ConnectionInfo =>
        object(v) && string(v.grokHost) && string(v.historyHost) && string(v.mcpUrl) && string(v.auth) && typeof v.publicDeploymentVerified === 'boolean');
    },
    async creations(options) {
      return expected(await request('/api/agent-creations', 'GET', undefined, options), (v): v is CreationRun[] => Array.isArray(v) && v.every(isCreation));
    },
    async createAgent(input, options) {
      requireId(input.operationId);
      if (!input.name.trim() || input.name.trim().length > 120 || (input.description?.length ?? 0) > 4000) throw new ApiError('invalid_input', 'Name your bot using 1–120 characters.');
      const normalized = { ...input, name: input.name.trim(), description: input.description ?? '' };
      const run = expected(await request('/api/agents', 'POST', normalized, options), isCreation);
      if (run.operationId !== input.operationId || run.name !== normalized.name || run.description !== normalized.description) throw new ApiError('invalid_response', 'Creation response did not match. Check the saved operation; do not create again.');
      return run;
    },
    async verifyCreation(operationId, options) {
      const run = expected(await request(`/api/agent-creations/${requireId(operationId)}/verify`, 'POST', {}, options), isCreation);
      if (run.operationId !== operationId) throw new ApiError('invalid_response', 'Verification did not match the saved creation.');
      return run;
    },
    async session(options) {
      const revision = authRevision;
      return applySession(await request('/api/session', 'GET', undefined, options), revision);
    },
    async login(secret, options) {
      const revision = ++authRevision;
      csrfToken = null;
      return applySession(await request('/api/login', 'POST', { secret }, options, false), revision, true);
    },
    async logout(options) {
      const revision = ++authRevision;
      try { return applySession(await request('/api/logout', 'POST', {}, options), revision); }
      finally { if (revision === authRevision) csrfToken = null; }
    },
    async agents(options) {
      return expected(await request('/api/agents', 'GET', undefined, options), (value): value is { agents: Agent[]; health: ObjectValue } =>
        object(value) && Array.isArray(value.agents) && value.agents.every(isAgent) && object(value.health));
    },
    async messages(options) {
      return expected(await request('/api/messages', 'GET', undefined, options), (value): value is MessageRun[] => Array.isArray(value) && value.every(isMessage));
    },
    async send(input, options) {
      requireId(input.messageId); requireId(input.agentId);
      if (!input.prompt.trim()) throw new ApiError('invalid_input', 'Enter a message before sending.');
      const run = expected(await request('/api/messages', 'POST', input, options), isMessage);
      if (run.id !== input.messageId || run.agentId !== input.agentId) throw new ApiError('invalid_response', 'The send response did not match the prepared operation. Check its original identifier.');
      return run;
    },
    async verify(messageId, options) {
      const run = expected(await request(`/api/messages/${requireId(messageId)}/verify`, 'POST', {}, options), isMessage);
      if (run.id !== messageId) throw new ApiError('invalid_response', 'The verification response did not match the requested operation.');
      return run;
    },
    async historyStatus(options) {
      return expected(await request('/api/history/status', 'GET', undefined, options), isHistoryStatus);
    },
    async search(input, options) {
      return expected(await request('/api/history/search', 'POST', input, options), (value): value is SearchHit[] => Array.isArray(value) && value.every(isSearchHit));
    },
    async readHistory(id, options) {
      try { return expected(await request(`/api/history/${requireId(id)}`, 'GET', undefined, options), isSearchHit); }
      catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error; }
    },
  };
}
