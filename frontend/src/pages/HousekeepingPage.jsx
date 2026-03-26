import React, { useState, useEffect } from 'react';
import API from '../api';

const STATUS_COLORS = { Open: 'badge-gray', Assigned: 'badge-blue', InProgress: 'badge-amber', Complete: 'badge-green', Escalated: 'badge-red', Closed: 'badge-gray' };
const PRI_COLORS = { Normal: 'badge-gray', High: 'badge-amber', Critical: 'badge-red' };

function TaskCard({ task, onStart, onComplete }) {
    return (
        <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{task.title}</div>
                <span className={`status-badge ${PRI_COLORS[task.priority]}`}>{task.priority}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>📍 {task.location || '—'} · {task.assigned_name || 'Unassigned'}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={`status-badge ${STATUS_COLORS[task.status]}`}>{task.status}</span>
                {task.status === 'Assigned' && <button className="btn btn-warning btn-sm" onClick={() => onStart(task.id)}>▶ Start</button>}
                {task.status === 'InProgress' && <button className="btn btn-success btn-sm" onClick={() => onComplete(task.id)}>✅ Complete</button>}
            </div>
        </div>
    );
}

export default function HousekeepingPage() {
    const [tasks, setTasks] = useState([]);
    const [users, setUsers] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ title: '', assigned_to: '', location: '', priority: 'Normal', notes: '' });

    const fetch = async () => {
        const [t, u] = await Promise.all([API.get('/tasks?category=Housekeeping'), API.get('/users')]);
        setTasks(t.data); setUsers(u.data.filter(u => u.role === 'Housekeeping Staff'));
    };
    useEffect(() => { fetch(); }, []);

    const onStart = async (id) => { await API.patch(`/tasks/${id}/start`); fetch(); };
    const onComplete = async (id) => { await API.patch(`/tasks/${id}/complete`); fetch(); };
    const createTask = async (e) => {
        e.preventDefault();
        await API.post('/tasks', { ...form, category: 'Housekeeping' });
        setShowForm(false); setForm({ title: '', assigned_to: '', location: '', priority: 'Normal', notes: '' });
        fetch();
    };

    const byStatus = (status) => tasks.filter(t => t.status === status);

    return (
        <div className="page-content fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                    <div className="section-title">🧹 Housekeeping & Laundry</div>
                    <div className="section-subtitle">Task allocation and room cleaning management</div>
                </div>
                <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>➕ New Task</button>
            </div>

            {showForm && (
                <div className="card mb-6 fade-in">
                    <div className="card-title" style={{ marginBottom: 16 }}>New Housekeeping Task</div>
                    <form onSubmit={createTask}>
                        <div className="grid-2">
                            <div className="form-group"><label className="form-label">Task</label><input className="form-input" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required placeholder="e.g. Clean Room 101" /></div>
                            <div className="form-group"><label className="form-label">Location</label><input className="form-input" value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="e.g. Room 101" /></div>
                        </div>
                        <div className="grid-2">
                            <div className="form-group">
                                <label className="form-label">Assign To</label>
                                <select className="form-select" value={form.assigned_to} onChange={e => setForm({...form, assigned_to: e.target.value})}>
                                    <option value="">Unassigned</option>
                                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Priority</label>
                                <select className="form-select" value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
                                    {['Normal','High','Critical'].map(p => <option key={p}>{p}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Any special instructions..." /></div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button type="submit" className="btn btn-primary">Create Task</button>
                            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="grid-3">
                <div>
                    <div style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>📋 Open / Assigned ({byStatus('Open').length + byStatus('Assigned').length})</div>
                    {[...byStatus('Open'), ...byStatus('Assigned')].map(t => <TaskCard key={t.id} task={t} onStart={onStart} onComplete={onComplete} />)}
                    {byStatus('Open').length + byStatus('Assigned').length === 0 && <div className="empty-state"><p>No tasks</p></div>}
                </div>
                <div>
                    <div style={{ color: 'var(--warning)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>⚙️ In Progress ({byStatus('InProgress').length})</div>
                    {byStatus('InProgress').map(t => <TaskCard key={t.id} task={t} onStart={onStart} onComplete={onComplete} />)}
                    {byStatus('InProgress').length === 0 && <div className="empty-state"><p>None in progress</p></div>}
                </div>
                <div>
                    <div style={{ color: 'var(--success)', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>✅ Completed ({byStatus('Complete').length})</div>
                    {byStatus('Complete').map(t => <TaskCard key={t.id} task={t} onStart={onStart} onComplete={onComplete} />)}
                    {byStatus('Complete').length === 0 && <div className="empty-state"><p>None completed</p></div>}
                </div>
            </div>
        </div>
    );
}
