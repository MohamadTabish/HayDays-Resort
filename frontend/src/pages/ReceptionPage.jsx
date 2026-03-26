import React, { useState, useEffect } from 'react';
import API from '../api';

const ROOM_STATUS_COLOR = { Ready: 'badge-green', Occupied: 'badge-blue', Checkout: 'badge-amber', 'Being cleaned': 'badge-amber', Inspected: 'badge-green' };

export default function ReceptionPage() {
    const [bookings, setBookings] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [msg, setMsg] = useState('');
    const [msgType, setMsgType] = useState('success');

    const fetch = async () => {
        const [b, r] = await Promise.all([API.get('/bookings'), API.get('/rooms')]);
        setBookings(b.data); setRooms(r.data);
    };
    useEffect(() => { fetch(); }, []);

    const showMsg = (text, type = 'success') => { setMsg(text); setMsgType(type); setTimeout(() => setMsg(''), 4000); };

    const checkin = async (id, guestName, isVip) => {
        await API.patch(`/bookings/${id}/checkin`);
        showMsg(`✅ ${guestName} checked in successfully.${isVip ? ' ⭐ VIP alert sent to manager.' : ''}`);
        fetch();
    };
    const checkout = async (id, guestName) => {
        const { data } = await API.patch(`/bookings/${id}/checkout`);
        showMsg(`✅ ${guestName} checked out. Housekeeping task auto-created.`);
        fetch();
    };

    const checkedIn = bookings.filter(b => b.status === 'CheckedIn');
    const confirmed = bookings.filter(b => b.status === 'Confirmed');

    return (
        <div className="page-content fade-in">
            <div className="section-title">🏨 Reception & Guest Handling</div>
            <div className="section-subtitle">Check-in, check-out, and room status management</div>

            {msg && (
                <div style={{ background: msgType === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)', color: msgType === 'success' ? 'var(--success)' : 'var(--danger)', border: `1px solid`, borderRadius: 'var(--radius-sm)', padding: '10px 16px', marginBottom: 16, fontSize: 13 }}>
                    {msg}
                </div>
            )}

            <div className="grid-2 mb-6">
                {/* Ready for Check-in */}
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">🛎️ Arriving Today / Confirmed</div>
                        <span className="status-badge badge-blue">{confirmed.length}</span>
                    </div>
                    {confirmed.length === 0 ? <div className="empty-state"><p>No confirmed bookings pending check-in</p></div> : (
                        confirmed.map(b => (
                            <div key={b.id} style={{ borderBottom: '1px solid var(--border)', padding: '12px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ fontWeight: 600 }}>{b.guest_name} {b.is_vip ? '⭐' : ''}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Room {b.room_number} · {b.source} · {b.checkin_date}</div>
                                </div>
                                <button className="btn btn-success btn-sm" onClick={() => checkin(b.id, b.guest_name, b.is_vip)}>Check In ✅</button>
                            </div>
                        ))
                    )}
                </div>

                {/* Currently Checked In */}
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">🔑 Currently Staying</div>
                        <span className="status-badge badge-green">{checkedIn.length}</span>
                    </div>
                    {checkedIn.length === 0 ? <div className="empty-state"><p>No guests currently checked in</p></div> : (
                        checkedIn.map(b => (
                            <div key={b.id} style={{ borderBottom: '1px solid var(--border)', padding: '12px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ fontWeight: 600 }}>{b.guest_name} {b.is_vip ? '⭐' : ''}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Room {b.room_number} · Check-out: {b.checkout_date}</div>
                                </div>
                                <button className="btn btn-danger btn-sm" onClick={() => checkout(b.id, b.guest_name)}>Check Out 🚪</button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Room Status Board */}
            <div className="card">
                <div className="card-title" style={{ marginBottom: 16 }}>🛏️ Room Status Board</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                    {rooms.map(r => (
                        <div key={r.id} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 16, textAlign: 'center' }}>
                            <div style={{ fontSize: 24, marginBottom: 8 }}>🛏️</div>
                            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Room {r.room_number}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{r.type}</div>
                            <span className={`status-badge ${ROOM_STATUS_COLOR[r.status] || 'badge-gray'}`}>{r.status}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
