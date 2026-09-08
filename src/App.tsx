import { useCallback, useEffect, useMemo, useState } from 'react';
import { createConversationController, type ConversationState } from '../client/conversation';
import { ApiError, createApiClient } from '../client/api';
import type { Agent, MessageRun, SearchHit } from '../server/types';

type LoginState = 'idle' | 'saving' | 'auth';

function normalizeText(text: string) {
  return text.trim();
}

function statusClass(status: MessageRun['status']) {
  switch (status) {
    case 'reply_recorded': return 'ok';
    case 'failed':
    case 'delivery_uncertain': return 'warn';
    case 'reply_pending':
    case 'accepted':
    case 'sending':
    default: return 'idle';
  }
}

export function App() {
  const [loginState, setLoginState] = useState<LoginState>('idle');
  const [ownerSecret, setOwnerSecret] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'vector' | 'keyword'>('vector');
  const [historyProject, setHistoryProject] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [state, setState] = useState<ConversationState>(() => {
    const controller = createConversationController();
    return controller.getState();
  });
  const [messageText, setMessageText] = useState('');
  const [controller] = useState(() => createConversationController());
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setBusy] = useState(false);

  const api = useMemo(() => createApiClient(), []);

  const activeOperation = state.activeByAgent[state.selectedAgentId ?? '']
    ? state.operations[state.activeByAgent[state.selectedAgentId ?? '']]
    : null;

  const loadConnections = useCallback(async () => {
    try {
      const [agentsResponse, historyResponse] = await Promise.all([
        api.agents(),
        api.historyStatus(),
      ]);
      setAgents(agentsResponse.agents);
      setProjects(historyResponse.projects);
      if (!state.selectedAgentId && agentsResponse.agents[0]) {
        controller.dispatch({ type: 'select_agent', agentId: agentsResponse.agents[0].agentId });
        setState(controller.getState());
      }
    } catch {
      // unauthenticated state is handled on first API call after login
    }
  }, [api, state.selectedAgentId, controller, setState]);

  useEffect(() => {
    loadConnections().catch(() => undefined);
  }, [loadConnections]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') return;
      api.session().catch(() => undefined).then(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [api]);

  const refreshMessages = useCallback(async () => {
    try {
      const list = await api.messages();
      let nextState = controller.getState();
      for (const run of list) controller.dispatch({ type: 'restore', run });
      for (const run of list) {
        if (run.status === 'reply_pending' || run.status === 'sending' || run.status === 'delivery_uncertain' || run.status === 'accepted') {
          const command = controller.getState().activeByAgent[run.agentId];
          if (command) {
            void api.verify(command);
          }
        }
      }
      setState(controller.getState());
      setLoginState((prev) => (prev === 'saving' ? 'auth' : prev));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'csrf_missing') setLoginState('idle');
      setState(nextState as ConversationState);
    }
  }, [api, controller]);

  useEffect(() => {
    const t = setInterval(() => {
      void refreshMessages();
    }, 5000);
    return () => clearInterval(t);
  }, [refreshMessages]);

  const handleLogin = async () => {
    if (!ownerSecret.trim()) return;
    try {
      setBusy(true);
      setError(null);
      await api.login(ownerSecret.trim());
      setLoginState('auth');
      await loadConnections();
      const messages = await api.messages();
      messages.forEach((run) => controller.dispatch({ type: 'restore', run }));
      setState(controller.getState());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed.');
    } finally {
      setBusy(false);
      setOwnerSecret('');
    }
  };

  const doSearch = async () => {
    if (!query.trim()) return;
    try {
      setBusy(true);
      const response = await api.search({
        query: query.trim(),
        mode: searchMode,
        limit: 10,
        project: historyProject || undefined,
      });
      setHits(response);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed.');
    } finally {
      setBusy(false);
    }
  };

  const onSelectAgent = (agentId: string) => {
    controller.dispatch({ type: 'select_agent', agentId });
    setState(controller.getState());
    setMessageText(state.drafts[agentId] ?? '');
  };

  const onDraftChange = (value: string) => {
    if (!state.selectedAgentId) return;
    const agentId = state.selectedAgentId;
    controller.dispatch({ type: 'edit_draft', agentId, prompt: value });
    setMessageText(value);
    setState(controller.getState());
  };

  const submit = async () => {
    if (!state.selectedAgentId) return;
    const command = controller.prepareAndSubmit(
      `${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`,
    );
    if (!command) return;
    setBusy(true);
    setError(null);
    try {
      const run = await api.send(command.input);
      controller.dispatch({ type: 'receive', messageId: run.id, run });
      setState(controller.getState());
    } catch (err) {
      controller.dispatch({ type: 'send_unknown', messageId: command.input.messageId, message: err instanceof ApiError ? err.message : 'Could not send now.' });
      setState(controller.getState());
      setError(err instanceof ApiError ? err.message : 'Could not send now.');
    } finally {
      setBusy(false);
      setMessageText('');
    }
  };

  const verify = async (messageId: string) => {
    const command = { type: 'verify', messageId } as const;
    if (command.type !== 'verify') return;
    setBusy(true);
    try {
      const run = await api.verify(messageId);
      controller.dispatch({ type: 'receive', messageId: run.id, run });
      setState(controller.getState());
      setError(null);
    } catch (err) {
      controller.dispatch({ type: 'verify_failed', messageId, message: err instanceof ApiError ? err.message : 'Verification failed.' });
      setState(controller.getState());
      setError(err instanceof ApiError ? err.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const active = activeOperation && (
    <section className="panel">
      <h2>Active conversation</h2>
      <p className="small muted">Agent: {activeOperation.agentId}</p>
      <p>Prompt:</p>
      <pre>{normalizeText(activeOperation.prompt)}</pre>
      <p>Status: <span className={statusClass(activeOperation.phase)}>{activeOperation.phase}</span></p>
      {activeOperation.run?.reply && (
        <div>
          <p>Reply:</p>
          <pre>{activeOperation.run.reply}</pre>
        </div>
      )}
      {activeOperation.error && <p className="warn">Error: {activeOperation.error}</p>}
      {activeOperation.phase !== 'recorded' && (
        <button disabled={isBusy} onClick={() => void verify(activeOperation.messageId)}>Verify</button>
      )}
    </section>
  );

  return (
    <main className="app-shell">
      <h1>Grok Bot Bridge Console</h1>
      <p className="muted">Owner session + history + direct Grok agent messaging (durable operation IDs).</p>
      {loginState !== 'auth' ? (
        <section className="panel">
          <h2>Owner login</h2>
          <label className="label" htmlFor="secret">Owner secret</label>
          <input
            id="secret"
            type="password"
            placeholder="••••••••••"
            value={ownerSecret}
            autoComplete="off"
            onChange={(event) => setOwnerSecret(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleLogin();
            }}
          />
          <button onClick={() => void handleLogin()} disabled={isBusy || !ownerSecret.trim()}>
            {isBusy ? 'Signing in...' : 'Sign in'}
          </button>
        </section>
      ) : (
        <section className="panel">
          <h2>Agents</h2>
          <label className="label" htmlFor="agent">Active agent</label>
          <select
            id="agent"
            value={state.selectedAgentId ?? ''}
            onChange={(event) => onSelectAgent(event.target.value)}
          >
            {agents.map((agent) => (
              <option key={agent.agentId} value={agent.agentId}>{agent.name}</option>
            ))}
          </select>
          <label className="label" htmlFor="prompt">Message draft</label>
          <textarea
            id="prompt"
            value={messageText}
            onChange={(event) => onDraftChange(event.target.value)}
            rows={6}
            placeholder="Ask a technical question tied to your imported history..."
          />
          <button onClick={() => void submit()} disabled={isBusy || !normalizeText(messageText)}>
            Send to Grok
                   </button>
        </section>
      )}
      {active}
      <section className="panel">
        <h2>History search</h2>
        <div className="row">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search imported history..." />
          <select value={searchMode} onChange={(event) => setSearchMode(event.target.value as 'vector' | 'keyword')}>
            <option value="vector">Vector</option>
            <option value="keyword">Keyword</option>
          </select>
          <input value={historyProject} onChange={(event) => setHistoryProject(event.target.value)} placeholder="Project filter (optional)" list="project-options" />
          <datalist id="project-options">
            {projects.map((project) => <option key={project} value={project} />)}
          </datalist>
          <button onClick={() => void doSearch()} disabled={isBusy || !query.trim()}>Search</button>
        </div>
        <div className="results">
          {hits.map((hit) => (
            <article key={hit.id} className="hit">
              <header>
                <strong>{hit.project}</strong>
                <span>{hit.mode}</span>
                <span>{hit.lineStart}-{hit.lineEnd}</span>
              </header>
              <pre>{hit.text}</pre>
            </article>
          ))}
        </div>
      </section>
      {error && <p className="warn">⚠ {error}</p>}
    </main>
  );
}
