import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from '../../../lib/axios_instance';
import useFleet from '../../../lib/use-fleet';
import '../../css/fleet.css';

const emptyForm = { name: '', url: '', apiKey: '' };
export default function SiloServers() {
  const [servers, setServers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(null);
  const { snapshot, refresh } = useFleet();
  const load = async () => {
    const result = await axios.get('/fleet/servers');
    if (!Array.isArray(result.data)) throw new Error('Invalid server list');
    setServers(result.data);
  };
  useEffect(() => { load().catch(() => setError('Could not load server connections. Check your settings access and try again.')); }, []);
  const run = async operation => {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); await load(); await refresh(); }
    catch (error) { setError(error.response?.data?.error || 'The request failed. Check the connection and try again.'); }
    finally { setBusy(false); }
  };
  const submit = event => {
    event.preventDefault();
    void run(async () => {
      if (editing) await axios.put(`/fleet/servers/${editing}`, form, { timeout: 30000 });
      else await axios.post('/fleet/servers', form, { timeout: 30000 });
      setNotice(editing ? 'Server updated.' : 'Server connected. Activity will appear shortly.');
      setForm(emptyForm); setEditing(null);
    });
  };
  return <section className="server-settings">
    <header className="fleet-heading"><div><span className="fleet-eyebrow">Connections</span><h1>Silo Servers</h1></div><Link to="/">View all activity</Link></header>
    <p>Add Silo servers to monitor their live activity together. Use a Silo administrator API key for each server.</p>
    <p className="fleet-footnote">The primary server continues to provide saved playback history and library statistics. Every physical Silo instance must report a unique Server ID under Silo Admin Settings → Compatibility → Jellyfin → Advanced; separate instances sharing that ID must change it and restart before being added.</p>
    {error && <p role="alert" className="fleet-notice">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <form onSubmit={submit}>
      <h2>{editing ? 'Edit server' : 'Add server'}</h2>
      <label>Server name<input required maxLength={80} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Living room Silo" /></label>
      <label>Silo URL<input required maxLength={2048} value={form.url} onChange={event => setForm({ ...form, url: event.target.value })} placeholder="https://silo.example.com" /></label>
      <label>Administrator API key<input type="password" autoComplete="new-password" required={!editing} maxLength={4096} value={form.apiKey} onChange={event => setForm({ ...form, apiKey: event.target.value })} placeholder={editing ? 'Leave blank to keep the saved key' : 'sa_…'} /></label>
      <div className="server-settings-actions"><button type="submit" disabled={busy}>{busy ? 'Checking connection…' : editing ? 'Save server' : 'Test & add server'}</button>
        {editing && <button type="button" disabled={busy} onClick={() => { setEditing(null); setForm(emptyForm); }}>Cancel edit</button>}
      </div>
    </form>
    <div className="server-settings-list">
      {servers.map(server => {
        const status = snapshot?.servers.find(item => item.id === server.id);
        const connection = server.connection || status?.connection;
        return <article className="server-settings-row" key={server.id}>
          <div><strong>{server.name}</strong><small>{server.url}</small><small>{server.isPrimary ? 'Primary server · ' : ''}{!server.enabled ? 'Monitoring disabled' : status?.state === 'connected' ? `${status.activeStreams} active streams` : status?.state || 'Connecting…'}</small>
            {connection?.apiMajor && <small>API v{connection.apiMajor}{connection.apiMajor === 2 ? ` · ${connection.diagnosticsAvailable ? 'Extended diagnostics available' : 'Extended diagnostics unavailable'}` : ' · Legacy API'}</small>}
          </div>
          {server.isPrimary ? <Link to="/settings/integrations/media-server">Primary connection settings</Link> : <div className="server-settings-actions">
            <button disabled={busy} onClick={() => { setEditing(server.id); setForm({ name: server.name, url: server.url, apiKey: '' }); setError(''); }}>Edit</button>
            <button disabled={busy} onClick={() => run(() => axios.put(`/fleet/servers/${server.id}`, { enabled: !server.enabled }))}>{server.enabled ? 'Disable' : 'Enable'}</button>
            {confirmRemove === server.id ? <><button disabled={busy} onClick={() => run(async () => {
              await axios.delete(`/fleet/servers/${server.id}`); setConfirmRemove(null);
              if (editing === server.id) { setEditing(null); setForm(emptyForm); }
            })}>Confirm remove</button><button onClick={() => setConfirmRemove(null)}>Keep server</button></> : <button disabled={busy} onClick={() => setConfirmRemove(server.id)}>Remove</button>}
          </div>}
        </article>;
      })}
    </div>
  </section>;
}
