import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ApiClient } from '../client/api';
import { ApiError } from '../client/api';
import type { CreationRun } from '../server/creation';
import type { Agent } from '../server/types';
import { Avatar, Icon } from './Icons';

const pendingKey = 'grokbot.pending-creation-id'; // Non-secret UUID only; never credentials or profile text.
function storedId() { try { return sessionStorage.getItem(pendingKey); } catch { return null; } }
function saveId(id: string | null) { try { if (id) sessionStorage.setItem(pendingKey, id); else sessionStorage.removeItem(pendingKey); } catch { /* Server list still provides recovery. */ } }

export function NewBot({ api, online, onOpen }: { api: ApiClient; online: boolean; onOpen: (agent: Agent) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [run, setRun] = useState<CreationRun | null>(null);
  const [operationId, setOperationId] = useState<string | null>(storedId);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guard = useRef(false);
  const locked = Boolean(operationId || run);
  useEffect(() => {
    let alive = true;
    void api.creations().then(runs => {
      if (!alive) return;
      const pending = runs.find(r => r.operationId === storedId()) ?? runs.find(r => r.status !== 'verified');
      if (pending) { setRun(pending); setOperationId(pending.operationId); setName(pending.name); setDescription(pending.description); }
    }).catch(() => { if (alive) setError('Could not load saved creations. Reload before creating a bot.'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [api]);
  const accept = (next: CreationRun) => {
    setRun(next); setName(next.name); setDescription(next.description);
    if (next.status === 'verified') saveId(null);
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (guard.current || locked || !online || loading || error || !name.trim()) return;
    guard.current = true;
    const id = crypto.randomUUID();
    setOperationId(id); saveId(id); setBusy(true); setError(null);
    try { accept(await api.createAgent({ operationId: id, name: name.trim(), description })); }
    catch { setError('Creation could not be confirmed. Keep this operation and check its status—do not create it again.'); }
    finally { setBusy(false); guard.current = false; }
  };
  const verify = async () => {
    if (!operationId || guard.current) return;
    guard.current = true; setBusy(true); setError(null);
    try { accept(await api.verifyCreation(operationId)); }
    catch (err) { setError(err instanceof ApiError && err.status === 404 ? 'No saved creation is visible yet. Keep this ID for reconciliation; do not submit another creation.' : 'Status check unavailable. This check did not create another bot.'); }
    finally { guard.current = false; setBusy(false); }
  };
  return <div className="page-content creation-page">
    <div className="page-heading"><h1>Make room for a new idea.</h1><p>Create a bot with its own conversation. Give it a name; the first message can wait.</p></div>
    <div className="bot-preview"><Avatar name={name || 'New bot'} large /><div><strong>{name.trim() || 'Your new bot'}</strong><span>A fresh conversation</span></div></div>
    <form className="creation-form" onSubmit={create}>
      <label htmlFor="bot-name">Bot name <span className="field-meta">Required</span></label>
      <input id="bot-name" value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="e.g. Projects Manager" disabled={locked || loading} autoComplete="off" required />
      <label htmlFor="bot-description">Description <span className="field-meta">Optional</span></label>
      <textarea id="bot-description" value={description} onChange={e => setDescription(e.target.value)} maxLength={4000} placeholder="What will you work on together?" rows={4} disabled={locked || loading} />
      <p className="field-help"><Icon name="chat" size={16} /> No first message or automatic introduction is requested.</p>
      {!online && !locked && <div className="notice"><Icon name="alert" /><p><strong>Grok Bot is not reachable.</strong> You can draft a profile here. Reconnect from Connections before creating it.</p></div>}
      {loading && <p className="muted" role="status">Checking saved creations…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {locked ? <div className="creation-result" aria-live="polite">
        <div className={`result-title ${run?.status === 'verified' ? 'positive' : 'caution'}`}><Icon name={run?.status === 'verified' ? 'check' : 'alert'} /><strong>{busy ? 'Checking your bot…' : run?.status === 'verified' ? 'Bot profile verified' : run?.status === 'created_unverified' ? 'Created. Verification pending.' : 'Creation not confirmed'}</strong></div>
        <p>{run?.status === 'verified' ? 'The remote profile matches. Open the conversation to write your first message.' : 'This operation is saved. Check its status rather than creating a second bot.'}</p>
        <details><summary>Operation details</summary><code>{operationId}</code>{run?.agentId && <code>Agent: {run.agentId}</code>}</details>
        {run?.status === 'verified' && run.agentId ? <button type="button" className="button primary" onClick={() => onOpen({ agentId: run.agentId!, name: run.name })}>Open conversation <Icon name="chevron" size={18} /></button> : <button type="button" className="button secondary" onClick={() => void verify()} disabled={busy}><Icon name="refresh" size={18} />{busy ? 'Checking…' : 'Check creation status'}</button>}
      </div> : <div className="form-actions"><span>Will be stored on your Grok Bot computer.</span><button className="button primary" disabled={!online || !name.trim() || loading || busy || Boolean(error)} type="submit"><Icon name="plus" size={18} />{busy ? 'Creating…' : 'Create bot'}</button></div>}
    </form>
    {run?.status === 'verified' && <button className="text-button" onClick={() => { setRun(null); setOperationId(null); setName(''); setDescription(''); setError(null); saveId(null); }}>Create another bot</button>}
  </div>;
}
