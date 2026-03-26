import React, { useState, useEffect } from 'react';
import API from '../api';

const SOURCE_COLORS = { Direct: 'badge-blue', Airbnb: 'badge-amber', Agoda: 'badge-purple', Corporate: 'badge-green', OTA: 'badge-amber' };
const STATUS_COLORS = { Confirmed: 'badge-blue', CheckedIn: 'badge-green', CheckedOut: 'badge-gray', Enquiry: 'badge-amber', Cancelled: 'badge-red' };

function BookingModal({ onClose, onSave, rooms }) {
    const [form, setForm] = useState({ guest_name: '', room_id: '', source: 'Direct', checkin_date: '', checkout_date: '', is_vip: false });
    const [error, setError] = useState('');
    const handle = e => setForm({ ...form, [e.target.name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
    const submit = async (e) => {
        e.preventDefault(); setError('');
        try { await onSave(form); onClose(); }
        catch (err) { setError(err.response?.data?.error || 'Failed to create booking'); }
    };
    return (
        <div className="modal-overlay">
            <div className="modal fade-in">
                <div className="modal-title">➕ New Booking</div>
                {error && <div className="login-error">{error}</div>}
                <form onSubmit={submit}>
                    <div className="form-group"><label className="form-label">Guest Name</label><input className="form-input" name="guest_name" value={form.guest_name} onChange={handle} required /></div>
                    <div className="grid-2">
                        <div className="form-group">
                            <label className="form-label">Room</label>
                            <select className="form-select" name="room_id" value={form.room_id} onChange={handle} required>
                                <option value="">Select room</option>
                                {rooms.map(r => <option key={r.id} value={r.id}>Room {r.room_number} — {r.type} ({r.status})</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Source</label>
                            <select className="form-select" name="source" value={form.source} onChange={handle}>
                                {['Direct','Airbnb','Agoda','Corporate'].map(s => <option key={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid-2">
                        <div className="form-group"><label className="form-label">Check-in</label><input type="date" className="form-input" name="checkin_date" value={form.checkin_date} onChange={handle} required /></div>
                        <div className="form-group"><label className="form-label">Check-out</label><input type="date" className="form-input" name="checkout_date" value={form.checkout_date} onChange={handle} required /></div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
                        <input type="checkbox" name="is_vip" checked={form.is_vip} onChange={handle} /> ⭐ VIP Guest (triggers manager alert on check-in)
                    </label>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary">Create Booking</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function BookingsPage() {
    const [bookings, setBookings] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [filter, setFilter] = useState('All');
    const [loading, setLoading] = useState(true);

    const fetch = async () => {
        const [b, r] = await Promise.all([API.get('/bookings'), API.get('/rooms')]);
        setBookings(b.data); setRooms(r.data); setLoading(false);
    };
    useEffect(() => { fetch(); }, []);

    const createBooking = async (form) => { await API.post('/bookings', form); fetch(); };

    const filtered = filter === 'All' ? bookings : bookings.filter(b => b.status === filter);

    return (
        <div className="page-content fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                    <div className="section-title">📅 Bookings & Reservations</div>
                    <div className="section-subtitle">Manage all incoming reservations across all channels</div>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>➕ New Booking</button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {['All','Confirmed','CheckedIn','CheckedOut','Enquiry'].map(s => (
                    <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(s)}>{s}</button>
                ))}
            </div>

            <div className="card">
                {loading ? <div className="empty-state"><div className="spinner" style={{ margin: '0 auto' }} /></div> : (
                    <table className="data-table">
                        <thead><tr><th>Guest</th><th>Room</th><th>Source</th><th>Check-in</th><th>Check-out</th><th>Status</th><th>VIP</th></tr></thead>
                        <tbody>
                            {filtered.map(b => (
                                <tr key={b.id}>
                                    <td>{b.guest_name}</td>
                                    <td>Room {b.room_number} — {b.room_type}</td>
                                    <td><span className={`status-badge ${SOURCE_COLORS[b.source] || 'badge-gray'}`}>{b.source}</span></td>
                                    <td>{b.checkin_date}</td>
                                    <td>{b.checkout_date}</td>
                                    <td><span className={`status-badge ${STATUS_COLORS[b.status] || 'badge-gray'}`}>{b.status}</span></td>
                                    <td>{b.is_vip ? '⭐' : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {!loading && filtered.length === 0 && <div className="empty-state"><p>No bookings found</p></div>}
            </div>
            {showModal && <BookingModal onClose={() => setShowModal(false)} onSave={createBooking} rooms={rooms} />}
        </div>
    );
}
