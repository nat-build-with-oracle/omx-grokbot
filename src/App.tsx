import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createConversationController, type ConversationOperation } from '../client/conversation';
import { ApiError, createApiClient, type ConnectionInfo } from '../client/api';
import type { Agent, HistoryStatus, MessageRun, SearchHit } from '../server/types';
import { Avatar, Icon, Mark, type IconName } from './Icons';
import { NewBot } from './NewBot';
import { ChatHistory } from './ChatHistory';

type Route = 'chat' | 'new' | 'history' | 'connections';
type Connection = 'unchecked' | 'checking' | 'online' | 'offline';
const routePath: Record<Route, string> = { chat: '/', new: '/new', history: '/history', connections: '/connections' };
function currentRoute(): Route { return ({ '/new': 'new', '/history': 'history', '/connections': 'connections' } as Record<string, Route>)[window.location.pathname] ?? 'chat'; }
const statusLabel: Record<Connection, string> = { unchecked: 'Not checked', checking: 'Connecting…', online: 'Reachable', offline: 'Connection failed' };
const phaseLabel: Record<ConversationOperation['phase'], string> = { prepared: 'Prepared', sending: 'Submitting…', accepted: 'Submitted · reply not verified', uncertain: 'Delivery not confirmed', pending: 'Waiting for a recorded reply', recorded: 'Reply verified', error: 'Not sent' };
const errorMessage = (error: unknown, fallback: string) => error instanceof ApiError ? error.message : fallback;

function Status({ state, children }: { state: Connection; children?: React.ReactNode }) {
  return <span className={`connection-status status-${state}`}><span className="status-dot" />{children ?? statusLabel[state]}</span>;
}
function ConversationEntry({ operation, onVerify }: { operation: ConversationOperation; onVerify: (id: string) => void }) {
  const pending = !['recorded', 'error', 'prepared'].includes(operation.phase);
  return <article className="conversation-entry">
    <div className="message user-message"><div className="message-byline"><span>You</span>{operation.run?.createdAt && <time dateTime={operation.run.createdAt}>{new Date(operation.run.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>}</div><div className="message-text">{operation.prompt}</div></div>
    {operation.run?.reply && <div className="message bot-message"><div className="message-byline"><Avatar name={operation.run.agentName} /><strong>{operation.run.agentName}</strong></div><div className="message-text">{operation.run.reply}</div></div>}
    <div className={`message-receipt ${operation.phase === 'recorded' ? 'positive' : operation.phase === 'uncertain' || operation.phase === 'error' ? 'caution' : ''}`}>
      <Icon name={operation.phase === 'recorded' ? 'check' : operation.phase === 'uncertain' ? 'alert' : 'chat'} size={15} /><span>{phaseLabel[operation.phase]}</span>
      {pending && <button className="text-button" disabled={operation.verifying || operation.phase === 'sending'} onClick={() => onVerify(operation.messageId)}>{operation.verifying ? 'Checking…' : 'Check reply'}</button>}
    </div>
    {operation.error && <p className="form-error">{operation.error}</p>}
    <details className="message-details"><summary>Message details</summary><code>{operation.messageId}</code><p>Checks read the transcript. They never send the message again.</p></details>
  </article>;
}

export function App() {
  const api = useMemo(() => createApiClient(), []);
  const [controller] = useState(() => createConversationController());
  const [conversation, setConversation] = useState(controller.getState);
  const [auth, setAuth] = useState<'checking' | 'guest' | 'owner'>('checking');
  const [secret, setSecret] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(currentRoute);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [remoteState, setRemoteState] = useState<Connection>('unchecked');
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [connections, setConnections] = useState<ConnectionInfo | null>(null);
  const [historyInfo, setHistoryInfo] = useState<HistoryStatus | null>(null);
  const [botFilter, setBotFilter] = useState('');
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'vector' | 'keyword'>('vector');
  const [project, setProject] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [searchError, setSearchError] = useState<string | null>(null);
  const sessionEpoch = useRef(0);
  const remoteFlight = useRef(false);
  const loginFlight = useRef(false);
  const searchFlight = useRef(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const pageTitle = useRef<HTMLHeadingElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const isAuthed = auth === 'owner';
  const sync = () => setConversation(controller.getState());

  const handleAuthError = useCallback((error: unknown) => {
    if (error instanceof ApiError && (error.status === 401 || error.code === 'csrf_missing')) {
      sessionEpoch.current++; setAuth('guest'); setLoginError('Your session ended. Sign in again to continue.');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void api.session().then(s => { if (alive) setAuth(s.authenticated ? 'owner' : 'guest'); }).catch(() => { if (alive) { setAuth('guest'); setLoginError('The bridge is unavailable. Check that the local server is running.'); } });
    return () => { alive = false; };
  }, [api]);

  const refreshAgents = useCallback(async () => {
    if (remoteFlight.current) return;
    remoteFlight.current = true;
    const epoch = sessionEpoch.current;
    setRemoteBusy(true); setRemoteState('checking');
    try {
      const value = await api.agents();
      if (epoch !== sessionEpoch.current) return;
      setAgents(value.agents); setRemoteState('online');
    } catch (error) {
      if (epoch !== sessionEpoch.current) return;
      handleAuthError(error); setRemoteState('offline');
    } finally { if (epoch === sessionEpoch.current) { setRemoteBusy(false); remoteFlight.current = false; } }
  }, [api, handleAuthError]);

  useEffect(() => {
    const epoch = ++sessionEpoch.current;
    remoteFlight.current = false;
    if (!isAuthed) { setAgents([]); setConnections(null); setHistoryInfo(null); setRemoteState('unchecked'); setRemoteBusy(false); setHits([]); return; }
    setWorkspaceError(null);
    void refreshAgents();
    void api.connections().then(value => { if (epoch === sessionEpoch.current) setConnections(value); }).catch(e => { if (epoch === sessionEpoch.current) { handleAuthError(e); setWorkspaceError('Connection settings could not be loaded. Reload the page to try again.'); } });
    void api.historyStatus().then(value => { if (epoch === sessionEpoch.current) setHistoryInfo(value); }).catch(e => { if (epoch === sessionEpoch.current) handleAuthError(e); });
    let timer: ReturnType<typeof setTimeout>;
    const readMessages = async () => {
      try {
        const runs = await api.messages();
        if (epoch !== sessionEpoch.current) return;
        for (const run of runs) controller.dispatch(controller.getState().operations[run.id] ? { type: 'receive', messageId: run.id, run } : { type: 'restore', run });
        setConversation(controller.getState());
      } catch (e) { if (epoch === sessionEpoch.current) { handleAuthError(e); setWorkspaceError('Saved messages could not be loaded. Your drafts are unchanged.'); } }
      if (epoch === sessionEpoch.current) timer = setTimeout(() => void readMessages(), 7000);
    };
    void readMessages();
    return () => { sessionEpoch.current++; clearTimeout(timer); };
  }, [isAuthed, api, controller, handleAuthError, refreshAgents]);

  useEffect(() => {
    const pop = () => { setRoute(currentRoute()); drawer.current?.close(); };
    const resize = () => { if (window.innerWidth > 800) drawer.current?.close(); };
    window.addEventListener('popstate', pop); window.addEventListener('resize', resize);
    return () => { window.removeEventListener('popstate', pop); window.removeEventListener('resize', resize); };
  }, []);
  useEffect(() => { document.title = `${route === 'new' ? 'New bot' : route === 'history' ? 'History' : route === 'connections' ? 'Connections' : 'Conversations'} · ARRA Oracle GrokBot Bridge`; }, [route]);

  const navigate = (next: Route) => {
    if (window.location.pathname !== routePath[next]) window.history.pushState({}, '', routePath[next]);
    setRoute(next); drawer.current?.close(); setSendError(null);
    requestAnimationFrame(() => pageTitle.current?.focus());
  };
  const chooseAgent = (agent: Agent) => {
    setAgents(previous => previous.some(a => a.agentId === agent.agentId) ? previous : [...previous, agent]);
    controller.dispatch({ type: 'select_agent', agentId: agent.agentId }); sync(); navigate('chat');
  };
  const knownAgents = useMemo(() => {
    const result = new Map(agents.map(a => [a.agentId, a]));
    if (isAuthed) for (const operation of Object.values(conversation.operations)) {
      const run = operation.run;
      if (run && !result.has(run.agentId)) result.set(run.agentId, { agentId: run.agentId, name: run.agentName });
    }
    return [...result.values()];
  }, [agents, conversation.operations, isAuthed]);
  const selected = knownAgents.find(a => a.agentId === conversation.selectedAgentId);
  const selectedIsLive = agents.some(a => a.agentId === selected?.agentId);
  const draft = conversation.drafts[conversation.selectedAgentId ?? ''] ?? '';
  const operations = Object.values(conversation.operations).filter(o => o.agentId === selected?.agentId);
  const activeId = conversation.activeByAgent[selected?.agentId ?? ''];
  const active = activeId ? conversation.operations[activeId] : undefined;
  const hasPending = Boolean(active && !['recorded', 'error'].includes(active.phase));
  const sendEnabled = isAuthed && remoteState === 'online' && selectedIsLive && Boolean(selected) && Boolean(draft.trim()) && !hasPending;

  const login = async (event: FormEvent) => {
    event.preventDefault(); if (!secret.trim() || loginFlight.current) return;
    loginFlight.current = true; setLoginBusy(true); setLoginError(null);
    try { await api.login(secret.trim()); setAuth('owner'); }
    catch (error) { setLoginError(error instanceof ApiError && error.status === 401 ? 'That secret was not accepted. Use the owner secret configured for this bridge.' : error instanceof ApiError && error.status === 429 ? 'Too many attempts. Wait 15 minutes before trying again.' : 'Sign-in could not be completed. Check the bridge and try again.'); }
    finally { setSecret(''); setLoginBusy(false); loginFlight.current = false; }
  };
  const logout = async () => {
    if (loginFlight.current) return;
    loginFlight.current = true;
    try { await api.logout(); setAuth('guest'); }
    catch { setWorkspaceError('Sign-out could not be confirmed. Try again before leaving this browser.'); }
    finally { loginFlight.current = false; }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!sendEnabled) return;
    const command = controller.prepareAndSubmit(crypto.randomUUID());
    if (!command || command.type !== 'send') return;
    const epoch = sessionEpoch.current; sync(); setSendError(null);
    try { const run = await api.send(command.input); if (epoch === sessionEpoch.current) controller.dispatch({ type: 'receive', messageId: run.id, run }); }
    catch (error) { if (epoch === sessionEpoch.current) { handleAuthError(error); controller.dispatch({ type: 'send_unknown', messageId: command.input.messageId }); setSendError('Delivery could not be confirmed. Check this message; your draft is kept.'); } }
    finally { if (epoch === sessionEpoch.current) { sync(); chatEnd.current?.scrollIntoView({ block: 'nearest' }); } }
  };
  const verify = async (id: string) => {
    const command = controller.verify(id); if (!command) return;
    const epoch = sessionEpoch.current; sync();
    try { const run = await api.verify(id); if (epoch === sessionEpoch.current) controller.dispatch({ type: 'receive', messageId: run.id, run }); }
    catch (error) { if (epoch === sessionEpoch.current) { handleAuthError(error); controller.dispatch({ type: 'verify_failed', messageId: id }); } }
    finally { if (epoch === sessionEpoch.current) sync(); }
  };
  const search = async (text = query) => {
    if (!text.trim() || searchFlight.current) return;
    searchFlight.current = true; const epoch = sessionEpoch.current;
    setQuery(text); setSearchState('loading'); setSearchError(null);
    try { const result = await api.search({ query: text.trim(), mode: searchMode, project: project || undefined, limit: 10 }); if (epoch === sessionEpoch.current) setHits(result); }
    catch (error) { if (epoch === sessionEpoch.current) { setHits([]); handleAuthError(error); setSearchError(errorMessage(error, 'History search failed. Try exact-word search.')); } }
    finally { if (epoch === sessionEpoch.current) setSearchState('done'); searchFlight.current = false; }
  };

  const sidebarContent = <>
    <a className="brand" aria-label="ARRA Oracle GrokBot Bridge" href="/" onClick={e => { e.preventDefault(); navigate('chat'); }}><Mark /><span className="brand-wordmark"><strong>ARRA Oracle</strong><span className="brand-subtle">GrokBot Bridge</span></span></a>
    <button className={`button new-bot-button ${route === 'new' ? 'selected' : ''}`} onClick={() => navigate('new')}><Icon name="plus" />New bot <span className="button-tail"><Icon name="chevron" size={16} /></span></button>
    <nav className="workspace-nav" aria-label="Workspace">{([['chat', 'chat', 'Conversations'], ['history', 'book', 'History'], ['connections', 'link', 'Connections']] as [Route, IconName, string][]).map(([value, icon, label]) => <a key={value} href={routePath[value]} className={`nav-link${route === value ? ' active' : ''}`} aria-current={route === value ? 'page' : undefined} onClick={e => { e.preventDefault(); navigate(value); }}><Icon name={icon} size={19} />{label}</a>)}</nav>
    <div className="sidebar-section"><div className="section-label"><span>Your bots</span>{isAuthed && <button className="icon-button" aria-label="Refresh bots" disabled={remoteBusy} onClick={() => void refreshAgents()}><Icon name="refresh" size={15} /></button>}</div>
      {isAuthed && knownAgents.length > 0 && <div className="bot-filter"><Icon name="search" size={15} /><input aria-label="Find a bot" placeholder="Find a bot" value={botFilter} onChange={e => setBotFilter(e.target.value)} /></div>}
      <div className="bot-list">
        {isAuthed && knownAgents.filter(a => a.name.toLocaleLowerCase().includes(botFilter.toLocaleLowerCase())).map(agent => <button className={`bot-item${route === 'chat' && selected?.agentId === agent.agentId ? ' active' : ''}`} key={agent.agentId} onClick={() => chooseAgent(agent)} aria-pressed={route === 'chat' && selected?.agentId === agent.agentId}><Avatar name={agent.name} /><span className="bot-item-text"><strong>{agent.name}</strong><span>{agents.some(a => a.agentId === agent.agentId) && remoteState === 'online' ? 'Open conversation' : 'Saved conversation'}</span></span></button>)}
        {!isAuthed ? <p className="sidebar-empty">Sign in to see your bots.<br />Your workspace stays private.</p> : remoteState === 'checking' && knownAgents.length === 0 ? <div className="skeleton-list" aria-label="Loading bots" role="status"><span /><span /><span /></div> : knownAgents.length === 0 ? <p className="sidebar-empty">{remoteState === 'offline' ? 'Bots are unavailable while the remote computer is disconnected.' : 'A fresh workspace. Create a bot to start a conversation.'}</p> : !knownAgents.some(a => a.name.toLowerCase().includes(botFilter.toLowerCase())) && <p className="sidebar-empty">No bots match “{botFilter}”.</p>}
      </div>
    </div>
    <div className="sidebar-footer"><button className="network-link" onClick={() => navigate('connections')}><span className={`status-dot ${remoteState === 'online' ? 'positive' : remoteState === 'offline' ? 'caution' : ''}`} /><span>NetBird connection<small>{isAuthed ? statusLabel[remoteState] : 'Sign in to check'}</small></span><Icon name="chevron" size={15} /></button><div className="owner-row"><span className="owner-avatar"><Icon name="lock" size={16} /></span><span><strong>{isAuthed ? 'Owner workspace' : 'Private workspace'}</strong><small>{isAuthed ? 'Signed in on this browser' : 'Owner access only'}</small></span>{isAuthed && <button className="icon-button" aria-label="Sign out" onClick={() => void logout()}><Icon name="logout" size={18} /></button>}</div></div>
  </>;
  const title = route === 'new' ? 'New bot' : route === 'history' ? 'History' : route === 'connections' ? 'Connections' : selected?.name ?? 'Conversations';

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="sidebar">{sidebarContent}</aside>
    <dialog ref={drawer} aria-label="Workspace navigation" className="mobile-drawer" onClick={e => { if (e.target === e.currentTarget) drawer.current?.close(); }}><div className="drawer-inner"><button className="icon-button drawer-close" aria-label="Close navigation" onClick={() => drawer.current?.close()}><Icon name="close" /></button>{sidebarContent}</div></dialog>
    <main className="workspace" id="main-content">
      <header className="workspace-header"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => drawer.current?.showModal()}><Icon name="menu" /></button><div className="workspace-title">{route === 'chat' && selected ? <Avatar name={selected.name} /> : <Icon name={route === 'new' ? 'plus' : route === 'history' ? 'book' : route === 'connections' ? 'link' : 'chat'} />}<h2 ref={pageTitle} tabIndex={-1}>{title}</h2></div><div className="header-end">{isAuthed ? <Status state={remoteState}>{remoteState === 'online' ? 'Grok Bot connected' : remoteState === 'offline' ? 'Grok Bot unavailable' : statusLabel[remoteState]}</Status> : <span className="header-private"><Icon name="lock" size={14} />Private bridge</span>}</div></header>
      {workspaceError && isAuthed && <div className="global-notice" role="alert"><Icon name="alert" size={18} /><span>{workspaceError}</span><button className="icon-button" aria-label="Dismiss message" onClick={() => setWorkspaceError(null)}><Icon name="close" size={16} /></button></div>}
      {!isAuthed ? <div className="welcome"><div className="welcome-content"><Mark large /><h1>ARRA Oracle<br /><span>GrokBot Bridge</span></h1><p>Conversations, new ideas, and the history behind them.<br className="desktop-break" /> All through your private bridge.</p><form className="login-form" onSubmit={login}><label htmlFor="owner-secret">Owner secret</label><div className="secret-input"><Icon name="lock" size={18} /><input id="owner-secret" name="owner-secret" type="password" autoComplete="current-password" placeholder="Enter your owner secret" value={secret} onChange={e => setSecret(e.target.value)} disabled={auth === 'checking' || loginBusy} required /></div>{loginError && <p className="form-error" role="alert">{loginError}</p>}<button className="button primary" disabled={auth === 'checking' || loginBusy || !secret.trim()} type="submit">{auth === 'checking' ? 'Checking session…' : loginBusy ? 'Signing in…' : 'Open workspace'}<Icon name="chevron" size={18} /></button><details className="login-help"><summary>Where do I find my secret?</summary><p>Use <code>ownerSecret</code> in <code>data/access.json</code> on the computer running this bridge. It must match the bridge configuration. Your secret is not saved in browser storage.</p></details></form></div><div className="welcome-footer"><Icon name="lock" size={14} />Local access · Your conversations stay behind sign-in</div></div> : <>
        {route === 'chat' && <div className="chat-page">{remoteState === 'offline' && <div className="offline-strip"><Icon name="alert" size={17} /><span>Remote gateway connection failed. Saved conversations and local history still work.</span><button className="text-button" disabled={remoteBusy} onClick={() => void refreshAgents()}>Reconnect</button></div>}
          <div className="conversation-scroll">{selected ? <div className="conversation-feed"><ChatHistory key={selected.agentId} api={api} agent={selected} operations={operations} onAuthError={handleAuthError} />{operations.map(operation => <ConversationEntry key={operation.messageId} operation={operation} onVerify={id => void verify(id)} />)}<div ref={chatEnd} /></div> : <div className="empty-conversation"><Mark large /><h1>A little space for your next idea.</h1><p>Choose a bot from the sidebar, or give a new one<br className="desktop-break" /> a name and a conversation of its own.</p><button className="button primary" onClick={() => navigate('new')}><Icon name="plus" size={18} />Create a bot</button><button className="text-button" onClick={() => navigate('history')}>Pick up from your history <Icon name="chevron" size={15} /></button></div>}</div>
          <div className="composer-area">{selected && <form className="composer" onSubmit={submit}><label className="sr-only" htmlFor="message-draft">Message {selected.name}</label><textarea id="message-draft" value={draft} maxLength={8000} rows={3} onChange={e => { controller.dispatch({ type: 'edit_draft', agentId: selected.agentId, prompt: e.target.value }); sync(); }} placeholder={`Message ${selected.name}…`} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} /><div className="composer-actions"><span>{hasPending ? 'Draft kept · check the previous reply before sending' : remoteState !== 'online' ? 'Draft locally · reconnect to send' : '⌘ / Ctrl + Enter to send'}</span><button className="send-button" type="submit" aria-label="Send message" disabled={!sendEnabled}><Icon name="arrow" size={20} /></button></div></form>}{sendError && <p className="form-error" role="alert">{sendError}</p>}<p className="composer-note"><Icon name="lock" size={12} />{selected ? 'Messages are sent once. Replies are checked against the transcript.' : 'A private connection to your Grok Bot workspace.'}</p></div>
        </div>}
        <div hidden={route !== 'new'} className="scroll-page"><NewBot api={api} online={remoteState === 'online'} onOpen={chooseAgent} /></div>
        {route === 'history' && <div className="scroll-page"><div className="page-content history-page"><div className="page-heading"><h1>Pick up where you left off.</h1><p>Search your imported history by meaning or exact words.<br />{historyInfo ? `${historyInfo.documents} documents · ${historyInfo.chunks} excerpts indexed locally` : 'The local history index is separate from the remote bot connection.'}</p></div><form className="history-form" onSubmit={e => { e.preventDefault(); void search(); }}><label className="sr-only" htmlFor="history-query">Search history</label><div className="history-query"><Icon name="search" /><input id="history-query" placeholder="Find an idea, decision, or line of code…" value={query} onChange={e => setQuery(e.target.value)} maxLength={1000} /><button className="button primary" disabled={!query.trim() || searchState === 'loading'}>{searchState === 'loading' ? 'Searching…' : 'Search'}</button></div><div className="search-filters"><label>Match<select value={searchMode} onChange={e => setSearchMode(e.target.value as 'vector' | 'keyword')}><option value="vector">Meaning</option><option value="keyword">Exact words</option></select></label><label>Project<select value={project} onChange={e => setProject(e.target.value)}><option value="">All projects</option>{historyInfo?.projects.map(p => <option key={p} value={p}>{p}</option>)}</select></label><span className="search-local"><Icon name="server" size={14} />Local index</span></div></form>{searchError && <p className="form-error" role="alert">{searchError}</p>}{searchState === 'idle' ? <div className="search-start"><p>A few places to start</p><div className="suggestions">{['React & Tailwind', 'MCP setup', 'LanceDB'].map(q => <button key={q} className="button secondary" onClick={() => void search(q)}>{q}<Icon name="chevron" size={14} /></button>)}</div></div> : <div className="search-results" aria-busy={searchState === 'loading'}><p className="results-count" role="status">{searchState === 'loading' ? 'Searching the local index…' : `${hits.length} matching ${hits.length === 1 ? 'excerpt' : 'excerpts'}`}</p>{hits.map(hit => <article className="history-hit" key={hit.id}><div className="hit-heading"><Icon name="book" size={18} /><h2>{hit.project}</h2><span>Lines {hit.lineStart}–{hit.lineEnd}</span></div><p className="hit-text">{hit.text}</p><details><summary>View source</summary><code>{hit.source}</code><p>{hit.mode === 'vector' ? 'Semantic match' : 'Exact-word match'} · Historical content, not live instructions.</p></details></article>)}{hits.length === 0 && searchState === 'done' && !searchError && <div className="inline-empty"><Icon name="search" size={28} /><h2>No matching excerpts.</h2><p>Try fewer words, choose a different project, or switch to exact-word search.</p></div>}</div>}</div></div>}
        {route === 'connections' && <div className="scroll-page"><div className="page-content connections-page"><div className="page-heading"><h1>Know what’s connected.</h1><p>Your browser, local history, and remote bots are separate connections.<br />A running bridge does not mean Grok Bot is reachable.</p></div><div className="connection-row"><span className="connection-icon"><Icon name="chat" /></span><div><h2>Grok Bot</h2><p>HTTP gateway via SSH over NetBird</p><code>{connections?.grokHost ?? 'Loading connection settings…'}</code></div><Status state={remoteState} /></div><div className="connection-detail">{remoteState === 'offline' && <p className="caution">The bridge could not connect to the gateway. Check SSH access and the gateway service, then try again. This check does not create a bot.</p>}<button className="button secondary" disabled={remoteBusy} onClick={() => void refreshAgents()}><Icon name="refresh" size={16} />{remoteBusy ? 'Checking connection…' : 'Check connection'}</button></div><div className="connection-row"><span className="connection-icon"><Icon name="server" /></span><div><h2>History index</h2><p>Imported from {connections?.historyHost ?? 'm5'}</p><span className="muted">{historyInfo ? `${historyInfo.documents} documents · ${historyInfo.embeddedChunks} embedded excerpts` : 'Index status unavailable'}</span></div><Status state={historyInfo ? 'online' : 'unchecked'}>{historyInfo ? 'Local' : 'Unavailable'}</Status></div><div className="connection-row"><span className="connection-icon"><Icon name="link" /></span><div><h2>MCP endpoint</h2><p>For an authenticated MCP client</p><code>{connections?.mcpUrl ?? 'Loading endpoint…'}</code></div><button className="icon-button" aria-label={copied ? 'MCP URL copied' : 'Copy MCP URL'} disabled={!connections} onClick={async () => { try { await navigator.clipboard.writeText(connections!.mcpUrl); setCopied(true); } catch { setWorkspaceError('Clipboard unavailable. Select and copy the endpoint shown below.'); } }}><Icon name={copied ? 'check' : 'copy'} size={18} /></button></div><p className="endpoint-note" role="status">{copied ? 'Endpoint copied. ' : ''}{connections?.publicDeploymentVerified ? 'Public deployment verified.' : 'Public access is not verified. A loopback URL is only reachable on this computer.'}</p><div className="connection-security"><Icon name="lock" size={18} /><div><h2>Private by default.</h2><p>Owner-approved access. Credentials stay out of browser storage. A submission is shown as verified only after its remote record is checked.</p></div></div></div></div>}
      </>}
    </main>
  </div>;
}
