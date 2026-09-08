import { useCallback, useEffect, useMemo, useState } from 'react';
import { createConversationController, type ConversationState } from "../client/conversation";
import { ApiError, createApiClient } from "../client/api";
import type { Agent, MessageRun, SearchHit } from "../server/types";

type LoginState = 'idle' | 'auth';
type UiTab = 'chat' | 'history' | 'connections';

type ConnectionInfo = {
  grokHost: string;
  historyHost: string;
  mcpUrl: string;
  auth: string;
  publicDeploymentVerified: boolean;
};

function normalizeText(text: string) {
  return text.trim();
}

function statusClass(status: MessageRun['status']) {
  switch (status) {
    case 'reply_recorded':
      return 'ok';
    case 'failed':
    case 'delivery_uncertain':
      return 'warn';
    case 'reply_pending':
    case 'accepted':
    case 'sending':
    default:
      return 'idle';
  }
}

function tabFromPath(pathname: string): UiTab {
  if (pathname.startsWith('/history')) return 'history';
  if (pathname.startsWith('/connections')) return 'connections';
  return 'chat';
}

export function App() {
  const [loginState, setLoginState] = useState<LoginState>('idle');
  const isAuthed = loginState === 'auth';
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
  const [activeTab, setActiveTab] = useState<UiTab>(() => tabFromPath(window.location.pathname));
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);

  const api = useMemo(() => createApiClient(), []);

  const activeOperation = state.activeByAgent[state.selectedAgentId ?? '']
    ? state.operations[state.activeByAgent[state.selectedAgentId ?? '']]
    : null;

  const setRoute = (tab: UiTab) => {
    const target = tab === 'chat' ? '/' : `/${tab}`;
    history.pushState({ tab }, '', target);
    setActiveTab(tab);
  };

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
  }, [api, state.selectedAgentId, controller]);

  const loadConnectionsInfo = useCallback(async () => {
    try {
      const response = await fetch('/api/connections', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data?.grokHost && data?.historyHost && data?.mcpUrl) {
        setConnectionInfo(data as ConnectionInfo);
      }
    } catch {
      // leave undefined until auth and data are available
    }
  }, []);

  useEffect(() => {
    loadConnections().catch(() => undefined);
    loadConnectionsInfo();
  }, [loadConnections, loadConnectionsInfo]);

  useEffect(() => {
    const onPopState = () => setActiveTab(tabFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') return;
      api.session().catch(() => undefined).then(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [api]);

  const refreshMessages = useCallback(async () => {
    let fallbackState = controller.getState();
    try {
      const list = await api.messages();
      fallbackState = controller.getState();
      for (const run of list) controller.dispatch({ type: 'restore', run });
      for (const run of list) {
        if (run.status === 'reply_pending' || run.status === 'sending' || run.status === 'delivery_uncertain' || run.status === 'accepted') {
          const activeId = controller.getState().activeByAgent[run.agentId];
          if (activeId) {
            void api.verify(activeId);
          }
        }
      }
      setState(controller.getState());
      setLoginState((prev) => (prev === 'idle' ? 'idle' : prev));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'csrf_missing') setLoginState('idle');
      setState(fallbackState);
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
      await Promise.all([loadConnections(), loadConnectionsInfo()]);
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
    setMessageText(controller.getState().drafts[agentId] ?? '');
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
        <button disabled={isBusy} onClick={() => void verify(activeOperation.messageId)}>
          Verify latest message
        </button>
      )}
    </section>
  );

  const loginPanel = (
    <section className="panel">
      <h2>Sign in</h2>
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
  );

  const chatPanel = (
    <>
      {active}
      <section className="panel">
        <h2>Chat / Send</h2>
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
    </>
  );

  const historyPanel = (
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
        {hits.length === 0 && <p className="small muted">No matching excerpt in imported corpus.</p>}
      </div>
    </section>
  );

  const connectionsPanel = (
    <section className="panel">
      <h2>Connections</h2>
      <div className="grid-two">
        <p>Internal bridge: <span className="code">{connectionInfo?.grokHost ?? 'Unavailable'}</span></p>
        <p>History source: <span className="code">{connectionInfo?.historyHost ?? 'Unavailable'}</span></p>
        <p>MCP URL: <span className="code">{connectionInfo?.mcpUrl ?? 'Unavailable'}</span></p>
        <p>Auth posture: <span className={connectionInfo?.publicDeploymentVerified ? 'ok' : 'warn'}>{connectionInfo?.auth ?? 'Sign in first'}</span></p>
      </div>
      <p className="small muted">For Claude.ai and Grok Bot external runtime verification, use the deployment runbook and evidence workflow.</p>
      <a href="/docs/operations/connector-deployment-runbook.md" target="_blank" rel="noreferrer">Connector runbook</a>
    </section>
  );

  const mainPanel = (() => {
    if (!isAuthed) return loginPanel;
    if (activeTab === 'chat') return chatPanel;
    if (activeTab === 'history') return historyPanel;
    return connectionsPanel;
  })();

  return (
    <main className="app-shell">
      <header>
        <h1>Grok Bot Bridge Console</h1>
        <p className="muted">Owner session + history + direct Grok agent messaging (durable operation IDs).</p>
        <nav className="tabs" aria-label="Primary">
          <button className={activeTab === 'chat' ? 'tab active' : 'tab'} onClick={() => setRoute('chat')}>Chat</button>
          <button className={activeTab === 'history' ? 'tab active' : 'tab'} onClick={() => setRoute('history')}>History</button>
          <button className={activeTab === 'connections' ? 'tab active' : 'tab'} onClick={() => setRoute('connections')}>Connections</button>
        </nav>
      </header>
      {mainPanel}
      {activeTab === 'history' && isAuthed && hits.length === 0 && <p className="small muted">Run a query to inspect search results.</p>}
      {error && <p className="warn">⚠ {error}</p>}
    </main>
  );
}
