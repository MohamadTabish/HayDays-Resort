import React, { useState, useEffect, useCallback } from 'react';
import API from '../api';
import { useAuth } from '../AuthContext';

function WAMessage({ notif, onReply }) {
    const isManager = notif.message_type === 'DailyReport' || notif.message_type === 'DailyBriefing';
    const urgencyColor = { Critical: 'var(--danger)', High: 'var(--warning)', Normal: 'var(--info)' }['Normal'];
    const statusColors = { Sent: 'badge-gray', Delivered: 'badge-blue', Read: 'badge-blue', Acknowledged: 'badge-green', Escalated: 'badge-red', Failed: 'badge-red' };

    return (
        <div className={`wa-message ${isManager ? 'sent' : ''}`} style={{ maxWidth: '100%' }}>
            <div style={{ fontSize: 11, color: 'var(--accent-hover)', fontWeight: 700, marginBottom: 6 }}>{notif.recipient_name || 'System'}</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{notif.message_body}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <div className="wa-meta">{new Date(notif.sent_at).toLocaleString()}</div>
                <span className={`status-badge ${statusColors[notif.status] || 'badge-gray'}`}>{notif.status}</span>
            </div>
            {notif.status !== 'Acknowledged' && notif.reply_received !== 'Confirm' && onReply && (
                <div className="wa-reply-btns">
                    <button className="btn btn-success btn-sm" onClick={() => onReply(notif.id, 1)}>✅ Reply 1: Confirm</button>
                    <button className="btn btn-warning btn-sm" onClick={() => onReply(notif.id, 2)}>🆘 Reply 2: Help Needed</button>
                </div>
            )}
            {notif.reply_received === 'Confirm' && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--success)' }}>✅ Acknowledged</div>}
            {notif.reply_received === 'HelpNeeded' && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--warning)' }}>🆘 Help Requested</div>}
        </div>
    );
}

export default function NotificationsPage() {
    const { user, socket, setUnreadCount } = useAuth();
    const [notifs, setNotifs] = useState([]);
    const [filterType, setFilterType] = useState('All');
    const [viewMode, setViewMode] = useState('inbox'); // inbox = staff view, feed = manager view
    const [sendForm, setShowSendForm] = useState(false);
    const [users, setUsers] = useState([]);
    const [sendData, setSendData] = useState({ recipient_id: '', message_type: 'TaskAssigned', message_body: '' });

    const fetchNotifs = useCallback(async () => {
        const endpoint = user?.role === 'Operations Manager' ? '/notifications' : '/notifications/my';
        const { data } = await API.get(endpoint);
        setNotifs(data);
        setUnreadCount(0);
    }, [user?.role]);

    useEffect(() => { fetchNotifs(); API.get('/users').then(r => setUsers(r.data)); }, [fetchNotifs]);
    useEffect(() => {
        if (!socket) return;
        const h = () => fetchNotifs();
        socket.on('new_notification', h);
        socket.on('notification_updated', h);
        return () => { socket.off('new_notification', h); socket.off('notification_updated', h); };
    }, [socket, fetchNotifs]);

    const reply = async (id, code) => {
        await API.post('/notifications/reply', { notificationId: id, replyCode: code });
        fetchNotifs();
    };

    const sendNotif = async (e) => {
        e.preventDefault();
        await API.post('/notifications/send', sendData);
        setShowSendForm(false); setSendData({ recipient_id: '', message_type: 'TaskAssigned', message_body: '' });
        fetchNotifs();
    };

    const filtered = filterType === 'All' ? notifs : notifs.filter(n => n.message_type === filterType);
    const unack = notifs.filter(n => n.status === 'Sent' || n.status === 'Delivered').length;
    const types = ['All', 'TaskAssigned', 'Escalation', 'PoolAlert', 'InventoryAlert', 'DailyBriefing', 'DailyReport', 'Reminder'];

    return (
        <div className="page-content fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                    <div className="section-title">💬 Notification Centre</div>
                    <div className="section-subtitle">WhatsApp-style notification inbox and management panel</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {user?.role === 'Operations Manager' && (
                        <button className="btn btn-secondary" onClick={() => setShowSendForm(!sendForm)}>📤 Send Notification</button>
                    )}
                    <button className="btn btn-primary" onClick={fetchNotifs}>🔄 Refresh</button>
                </div>
            </div>

            {unack > 0 && (
                <div style={{ background: 'var(--warning-bg)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--warning)', fontWeight: 700 }}>⏰ {unack} unacknowledged notification{unack > 1 ? 's' : ''}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Scroll down to review</span>
                </div>
            )}

            {sendForm && (
                <div className="card mb-6 fade-in">
                    <div className="card-title" style={{ marginBottom: 16 }}>📤 Send Notification</div>
                    <form onSubmit={sendNotif}>
                        <div className="grid-2">
                            <div className="form-group">
                                <label className="form-label">Recipient</label>
                                <select className="form-select" value={sendData.recipient_id} onChange={e => setSendData({...sendData, recipient_id: e.target.value})} required>
                                    <option value="">Select staff</option>
                                    {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Type</label>
                                <select className="form-select" value={sendData.message_type} onChange={e => setSendData({...sendData, message_type: e.target.value})}>
                                    {types.filter(t => t !== 'All').map(t => <option key={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="form-group"><label className="form-label">Message</label><textarea className="form-textarea" value={sendData.message_body} onChange={e => setSendData({...sendData, message_body: e.target.value})} required rows={4} /></div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button type="submit" className="btn btn-primary">Send 📤</button>
                            <button type="button" className="btn btn-secondary" onClick={() => setShowSendForm(false)}>Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {types.map(t => (
                    <button key={t} className={`btn btn-sm ${filterType === t ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterType(t)}>{t}</button>
                ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {filtered.length === 0 && <div className="card"><div className="empty-state"><p>No notifications</p></div></div>}
                {filtered.map(n => (
                    <WAMessage key={n.id} notif={n} onReply={reply} />
                ))}
            </div>
        </div>
    );
}
