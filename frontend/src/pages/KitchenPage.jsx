import React, { useState, useEffect } from 'react';
import API from '../api';
import { useAuth } from '../AuthContext';

const STATUS_BG = { Received: 'var(--info-bg)', Preparing: 'var(--warning-bg)', Ready: 'var(--success-bg)', Served: 'var(--bg-tertiary)' };
const STATUS_COL = { Received: 'var(--info)', Preparing: 'var(--warning)', Ready: 'var(--success)', Served: 'var(--text-muted)' };

function NewOrderModal({ onClose, onSave }) {
    const [form, setForm] = useState({ guest_name: '', room_number: '', items: '', dietary_notes: '' });
    const submit = async (e) => {
        e.preventDefault();
        await onSave({ ...form, items: form.items.split(',').map(s => s.trim()).filter(Boolean) });
        onClose();
    };
    return (
        <div className="modal-overlay"><div className="modal fade-in">
            <div className="modal-title">🍽️ New Order</div>
            <form onSubmit={submit}>
                <div className="grid-2">
                    <div className="form-group"><label className="form-label">Guest Name</label><input className="form-input" value={form.guest_name} onChange={e => setForm({...form, guest_name: e.target.value})} required /></div>
                    <div className="form-group"><label className="form-label">Room Number</label><input className="form-input" value={form.room_number} onChange={e => setForm({...form, room_number: e.target.value})} required /></div>
                </div>
                <div className="form-group"><label className="form-label">Items (comma separated)</label><input className="form-input" value={form.items} onChange={e => setForm({...form, items: e.target.value})} placeholder="Full English Breakfast, Orange Juice" required /></div>
                <div className="form-group"><label className="form-label">Dietary Notes</label><input className="form-input" value={form.dietary_notes} onChange={e => setForm({...form, dietary_notes: e.target.value})} placeholder="e.g. No pork, Vegan" /></div>
                <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn-primary">Place Order</button>
                </div>
            </form>
        </div></div>
    );
}

export default function KitchenPage() {
    const [orders, setOrders] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const { socket } = useAuth();

    const fetch = async () => { const { data } = await API.get('/kitchen/orders'); setOrders(data); };
    useEffect(() => { fetch(); }, []);
    useEffect(() => {
        if (!socket) return;
        socket.on('kitchen_order', fetch); socket.on('kitchen_order_updated', fetch);
        return () => { socket.off('kitchen_order', fetch); socket.off('kitchen_order_updated', fetch); };
    }, [socket]);

    const advance = async (id, current) => {
        const next = { Received: 'Preparing', Preparing: 'Ready', Ready: 'Served' }[current];
        if (next) { await API.patch(`/kitchen/orders/${id}`, { status: next }); fetch(); }
    };

    const active = orders.filter(o => o.status !== 'Served');
    const served = orders.filter(o => o.status === 'Served');

    return (
        <div className="page-content fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                    <div className="section-title">👨‍🍳 Kitchen & Dining</div>
                    <div className="section-subtitle">Live order management and kitchen workflow</div>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>➕ New Order</button>
            </div>

            {active.length === 0 && <div className="card" style={{ marginBottom: 20 }}><div className="empty-state"><p>No active orders 🎉 Kitchen is clear!</p></div></div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
                {active.map(o => {
                    const items = (() => { try { return JSON.parse(o.items); } catch { return [o.items]; } })();
                    const nextLabel = { Received: '▶ Start Preparing', Preparing: '🔔 Mark Ready', Ready: '✅ Mark Served' }[o.status];
                    return (
                        <div key={o.id} style={{ background: STATUS_BG[o.status], border: `1px solid ${STATUS_COL[o.status]}40`, borderRadius: 'var(--radius-lg)', padding: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 15 }}>{o.guest_name}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Room {o.room_number}</div>
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COL[o.status] }}>{o.status.toUpperCase()}</span>
                            </div>
                            <div style={{ marginBottom: 10 }}>
                                {items.map((item, i) => <div key={i} style={{ fontSize: 13, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>• {item}</div>)}
                            </div>
                            {o.dietary_notes && <div style={{ fontSize: 12, color: 'var(--warning)', marginBottom: 10 }}>⚠️ {o.dietary_notes}</div>}
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>{new Date(o.created_at).toLocaleTimeString()}</div>
                            {nextLabel && <button className="btn btn-primary btn-sm w-full" onClick={() => advance(o.id, o.status)}>{nextLabel}</button>}
                        </div>
                    );
                })}
            </div>

            {served.length > 0 && (
                <div className="card">
                    <div className="card-title" style={{ marginBottom: 12 }}>✅ Served Today ({served.length})</div>
                    <table className="data-table">
                        <thead><tr><th>Guest</th><th>Room</th><th>Items</th><th>Time</th></tr></thead>
                        <tbody>{served.map(o => {
                            const items = (() => { try { return JSON.parse(o.items); } catch { return [o.items]; } })();
                            return <tr key={o.id}><td>{o.guest_name}</td><td>{o.room_number}</td><td>{items.join(', ')}</td><td>{new Date(o.created_at).toLocaleTimeString()}</td></tr>;
                        })}</tbody>
                    </table>
                </div>
            )}
            {showModal && <NewOrderModal onClose={() => setShowModal(false)} onSave={(d) => API.post('/kitchen/orders', d).then(fetch)} />}
        </div>
    );
}
