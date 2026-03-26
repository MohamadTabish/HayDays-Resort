import React, { useState, useEffect } from 'react';
import API from '../api';

const STATUS_COLORS = { Open: 'badge-gray', Assigned: 'badge-blue', InProgress: 'badge-amber', 'Pending Parts': 'badge-purple', Resolved: 'badge-green', Closed: 'badge-gray', Escalated: 'badge-red' };
const PRI_COLORS = { Normal: 'badge-gray', High: 'badge-amber', Critical: 'badge-red' };

function TicketModal({ ticket, users, onClose, onUpdate }) {
    const [form, setForm] = useState({ status: ticket.status, assigned_to: ticket.assigned_to || '', notes: ticket.notes || '', priority: ticket.priority });
    const submit = async (e) => { e.preventDefault(); await onUpdate(ticket.id, form); onClose(); };
    return (
        <div className="modal-overlay"><div className="modal fade-in">
            <div className="modal-title">🔧 {ticket.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>📍 {ticket.location} · Created {ticket.created_at ? new Date(ticket.created_at).toLocaleString() : 'N/A'}</div>
            {ticket.notes && <div style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{ticket.notes}</div>}
            <form onSubmit={submit}>
                <div className="grid-2">
                    <div className="form-group">
                        <label className="form-label">Status</label>
                        <select className="form-select" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                            {['Open','Assigned','InProgress','Pending Parts','Resolved','Closed','Escalated'].map(s => <option key={s}>{s}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Priority</label>
                        <select className="form-select" value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
                            {['Normal','High','Critical'].map(p => <option key={p}>{p}</option>)}
                        </select>
                    </div>
                </div>
                <div className="form-group">
                    <label className="form-label">Assign To</label>
                    <select className="form-select" value={form.assigned_to} onChange={e => setForm({...form, assigned_to: e.target.value})}>
                        <option value="">Unassigned</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                    </select>
                </div>
                <div className="form-group"><label className="form-label">Notes / Update</label><textarea className="form-textarea" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
                <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
                    <button type="submit" className="btn btn-primary">Update Ticket</button>
                </div>
            </form>
        </div></div>
    );
}

function NewTicketModal({ users, onClose, onSave }) {
    const [form, setForm] = useState({ title: '', location: '', category: 'Maintenance', priority: 'Normal', notes: '', assigned_to: '' });
    const submit = async (e) => { e.preventDefault(); await onSave(form); onClose(); };
    return (
        <div className="modal-overlay"><div className="modal fade-in">
            <div className="modal-title">🔧 Raise Maintenance Ticket</div>
            <form onSubmit={submit}>
                <div className="form-group"><label className="form-label">Issue Title</label><input className="form-input" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required placeholder="e.g. Leaking pipe in Room 102 bathroom" /></div>
                <div className="grid-2">
                    <div className="form-group"><label className="form-label">Location</label><input className="form-input" value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="e.g. Room 201" /></div>
                    <div className="form-group">
                        <label className="form-label">Priority</label>
                        <select className="form-select" value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
                            {['Normal','High','Critical'].map(p => <option key={p}>{p}</option>)}
                        </select>
                    </div>
                </div>
                <div className="form-group">
                    <label className="form-label">Assign To</label>
                    <select className="form-select" value={form.assigned_to} onChange={e => setForm({...form, assigned_to: e.target.value})}>
                        <option value="">Auto-assign</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                </div>
                <div className="form-group"><label className="form-label">Description</label><textarea className="form-textarea" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Describe the issue in detail..." /></div>
                <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn-primary">Raise Ticket</button>
                </div>
            </form>
        </div></div>
    );
}

export default function MaintenancePage() {
    const [tasks, setTasks] = useState([]);
    const [users, setUsers] = useState([]);
    const [selected, setSelected] = useState(null);
    const [showNew, setShowNew] = useState(false);

    const fetch = async () => {
        const [t, u] = await Promise.all([API.get('/tasks?category=Maintenance'), API.get('/users')]);
        setTasks(t.data); setUsers(u.data);
    };
    useEffect(() => { fetch(); }, []);

    const createTask = async (form) => { await API.post('/tasks', form); fetch(); };
    const updateTask = async (id, form) => { await API.patch(`/tasks/${id}`, form); fetch(); };

    const triggerEscalation = async (taskId) => {
        await API.post('/demo/trigger-escalation', { taskId });
        fetch();
    };

    return (
        <div className="page-content fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                    <div className="section-title">🔧 Maintenance & Facilities</div>
                    <div className="section-subtitle">Issue tracking, assignment, and resolution for all resort facilities</div>
                </div>
                <button className="btn btn-primary" onClick={() => setShowNew(true)}>➕ Raise Ticket</button>
            </div>

            <div className="card">
                <table className="data-table">
                    <thead><tr><th>Ticket</th><th>Location</th><th>Priority</th><th>Status</th><th>Assigned To</th><th>Actions</th></tr></thead>
                    <tbody>
                        {tasks.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>No maintenance tickets</td></tr>}
                        {tasks.map(t => (
                            <tr key={t.id}>
                                <td>{t.title}</td>
                                <td>{t.location || '—'}</td>
                                <td><span className={`status-badge ${PRI_COLORS[t.priority]}`}>{t.priority}</span></td>
                                <td><span className={`status-badge ${STATUS_COLORS[t.status]}`}>{t.status}</span></td>
                                <td>{t.assigned_name || '—'}</td>
                                <td style={{ display: 'flex', gap: 6 }}>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setSelected(t)}>✏️ Edit</button>
                                    {t.status !== 'Escalated' && <button className="btn btn-danger btn-sm" onClick={() => triggerEscalation(t.id)} title="Demo: Trigger escalation">🔴 Escalate</button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {selected && <TicketModal ticket={selected} users={users} onClose={() => setSelected(null)} onUpdate={updateTask} />}
            {showNew && <NewTicketModal users={users} onClose={() => setShowNew(false)} onSave={createTask} />}
        </div>
    );
}
