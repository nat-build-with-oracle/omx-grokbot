import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ApiClient } from '../client/api';
import type { ConversationOperation } from '../client/conversation';
import { visibleTranscript } from '../client/transcript';
import type { Agent, TranscriptPage } from '../server/types';
import { Avatar, Icon } from './Icons';

export function ChatHistory({ api, agent, operations, onAuthError }: {
  api: ApiClient; agent: Agent; operations: ConversationOperation[]; onAuthError: (error: unknown) => void;
}) {
  const [page, setPage] = useState<TranscriptPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const currentPage = useRef<TranscriptPage | null>(null);
  const flight = useRef<AbortController | null>(null);
  const lastBefore = useRef<number | undefined>(undefined);
  const scroll = useRef<{ older: boolean; top: number; height: number } | null>(null);
  const load = useCallback(async (before?: number) => {
    if (flight.current) return;
    const controller = new AbortController(); flight.current = controller; lastBefore.current = before;
    setLoading(true); setError(false);
    try {
      const result = await api.transcript(agent.agentId, before, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const container = root.current?.closest('.conversation-scroll');
      scroll.current = { older: before !== undefined, top: container?.scrollTop ?? 0, height: container?.scrollHeight ?? 0 };
      const entries = before === undefined ? result.entries : [...new Map([...result.entries, ...(currentPage.current?.entries ?? [])].map(e => [e.rowid, e])).values()].sort((a, b) => a.rowid - b.rowid);
      currentPage.current = { ...result, entries }; setPage(currentPage.current);
    } catch (e) { if (!controller.signal.aborted) { onAuthError(e); setError(true); } }
    finally { if (flight.current === controller) { flight.current = null; setLoading(false); } }
  }, [api, agent.agentId, onAuthError]);
  useEffect(() => {
    void load();
    return () => { flight.current?.abort(); flight.current = null; };
  }, [load]);
  useLayoutEffect(() => {
    const container = root.current?.closest('.conversation-scroll');
    if (container && scroll.current) container.scrollTop = scroll.current.older ? scroll.current.top + container.scrollHeight - scroll.current.height : container.scrollHeight;
    scroll.current = null;
  }, [page]);
  const entries = useMemo(() => visibleTranscript(agent.agentId, page?.entries ?? [], operations), [agent.agentId, page, operations]);

  return <div className="remote-history" ref={root}>
    <div className="remote-history-header"><div><h3>Grok Bot history</h3><p>Text messages · read-only</p></div><button className="text-button" disabled={loading} onClick={() => void load()}><Icon name="refresh" size={15} />Refresh history</button></div>
    {error && <div className="remote-history-error" role="alert"><span>History could not be loaded. Check SSH access, then try again. Saved bridge messages are unchanged.</span><button className="text-button" disabled={loading} onClick={() => void load(lastBefore.current)}>Retry history</button></div>}
    {loading && <p className="history-loading" role="status">Loading Grok Bot history…</p>}
    {page?.hasMore && <div className="history-pagination"><button className="button secondary" disabled={loading} onClick={() => void load(page.nextBeforeRowid!)}>Load earlier messages</button></div>}
    {entries.map(entry => <article className="conversation-entry transcript-entry" key={entry.rowid} data-rowid={entry.rowid}>
      <div className={`message ${entry.role === 'user' ? 'user-message' : 'bot-message'}`}>
        <div className="message-byline">{entry.role === 'assistant' && <Avatar name={agent.name} />}<strong>{entry.role === 'user' ? 'You' : agent.name}</strong>{entry.timestamp && <time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>}</div>
        <div className="message-text">{entry.content}</div>
        {(entry.contentTruncated || entry.isStreaming) && <p className="message-receipt caution">{entry.contentTruncated ? 'Message shortened for this view. ' : ''}{entry.isStreaming ? 'Still being recorded.' : ''}</p>}
      </div>
    </article>)}
    {page && !loading && !error && entries.length === 0 && <p className="history-loading">{page.entries.length ? 'Messages sent through this bridge are shown below.' : page.hasMore ? 'No user-facing text in this page. Load earlier messages to continue.' : 'No earlier text messages in Grok Bot. Start a conversation below.'}</p>}
    {page && <p className="transcript-note">{page.entries.length} text {page.entries.length === 1 ? 'message' : 'messages'} loaded from Grok Bot. Attachments and internal events aren’t shown.</p>}
    {operations.length > 0 && <p className="bridge-history-divider">Messages sent through this bridge</p>}
  </div>;
}
