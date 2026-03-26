import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';

// Dynamic URLs: use localhost in dev, same origin in production
const BACKEND_URL = import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin;
const API_BASE = import.meta.env.DEV ? 'http://localhost:5000/api' : '/api';

// Initialize socket
const socket = io(BACKEND_URL);
const api = axios.create({ baseURL: API_BASE });

// Add token to requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('haydays_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

export default function WhatsAppSimPage() {
    // ── Staff Accounts for Simulation ──
    const staffList = [
        { id: 'pool', label: 'Rajan (Pool)', role: 'Pool Staff' },
        { id: 'housekeeping', label: 'Sunitha (HK)', role: 'Housekeeping Staff' },
        { id: 'guestservice', label: 'Arjun (GS)', role: 'Guest Service Staff' },
        { id: 'chef', label: 'Meena (Chef)', role: 'Chef' }
    ];

    const [activeStaff, setActiveStaff] = useState('pool');
    const [messages, setMessages] = useState([]);
    const [replyText, setReplyText] = useState('');
    const [unreadCounts, setUnreadCounts] = useState({});
    
    // Dashboard State
    const [dashboardStats, setDashboardStats] = useState({
        taskStats: { done: 0, total: 0 },
        pool: { runtimeMinutes: 0, pumpIsOn: false, status: 'Green' }
    });
    
    // Map usernames to actual DB IDs after fetch
    const [dbStaffIds, setDbStaffIds] = useState({});

    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // ── Load Users & Set Real IDs ──
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const res = await api.get('/users');
                const idMap = {};
                res.data.forEach(u => { idMap[u.username] = u.id; });
                setDbStaffIds(idMap);
            } catch (err) { console.error('Error fetching users:', err); }
        };
        fetchUsers();
    }, []);

    const currentStaffId = dbStaffIds[activeStaff];

    // ── Load Messages ──
    useEffect(() => {
        if (!currentStaffId) return;
        
        const fetchInbox = async () => {
            try {
                const res = await api.get(`/wa/inbox/${currentStaffId}`);
                setMessages(res.data);
                scrollToBottom();
            } catch (err) { console.error('Error fetching inbox', err); }
        };
        
        fetchInbox();
    }, [currentStaffId]);

    // ── Load Unread Counts & Dashboard ──
    useEffect(() => {
        const fetchMeta = async () => {
            try {
                const [unreadRes, dashRes] = await Promise.all([
                    api.get('/wa/unread'),
                    api.get('/dashboard')
                ]);
                setUnreadCounts(unreadRes.data);
                setDashboardStats(dashRes.data);
            } catch (err) { console.error('Error fetching meta', err); }
        };
        fetchMeta();
    }, []);

    // ── Socket Events ──
    useEffect(() => {
        socket.on('wa_message', (msg) => {
            // Update messages if for current tab
            if (msg.staff_id === currentStaffId) {
                setMessages(prev => [...prev, msg]);
                setTimeout(scrollToBottom, 100);
            } else {
                // Update unread count for background tabs
                setUnreadCounts(prev => ({
                    ...prev,
                    [msg.staff_id]: (prev[msg.staff_id] || 0) + 1
                }));
            }
        });

        socket.on('pump_update', (status) => {
            setDashboardStats(prev => ({
                ...prev,
                pool: { ...prev.pool, runtimeMinutes: status.pumpMins, pumpIsOn: status.pumpRunning }
            }));
        });

        socket.on('dashboard_updated', async () => {
            try {
                const res = await api.get('/dashboard');
                setDashboardStats(res.data);
            } catch (e) {}
        });

        return () => {
            socket.off('wa_message');
            socket.off('pump_update');
            socket.off('dashboard_updated');
        };
    }, [currentStaffId]);

    // ── Actions ──
    const handleTabSwitch = (username) => {
        setActiveStaff(username);
        const sid = dbStaffIds[username];
        if (sid) {
            setUnreadCounts(prev => ({ ...prev, [sid]: 0 }));
        }
    };

    const sendReply = async (text) => {
        if (!text.trim() || !currentStaffId) return;
        const currentStaffInfo = staffList.find(s => s.id === activeStaff);
        
        try {
            await api.post('/wa/reply', {
                staffId: currentStaffId,
                messageBody: text,
                staffRole: currentStaffInfo.role,
                staffName: currentStaffInfo.label.split(' ')[0]
            });
            setReplyText('');
        } catch (err) { console.error('Error sending reply', err); }
    };

    const handleDemoFire = async (endpoint) => {
        try {
            await api.post(`/demo/${endpoint}`);
        } catch (err) { console.error(`Error firing ${endpoint}`, err); }
    };

    // Helper formats
    const poolPct = Math.min(100, Math.round(dashboardStats.pool.runtimeMinutes / 180 * 100));
    const poolColor = poolPct >= 100 ? 'var(--success)' : poolPct >= 50 ? 'var(--warning)' : 'var(--danger)';

    return (
        <div className="wa-sim-layout fade-in">
            {/* Left Pane: Demo Dashboard */}
            <div className="wa-pane wa-manager-pane">
                <div className="wa-pane-header">
                    <h2>Manager Screen View</h2>
                    <span className="badge-blue">Haydays Backend Synced</span>
                </div>

                <div className="wa-scroll-area">
                    {/* Live Stats Row */}
                    <div className="wa-stat-row">
                        <div className="wa-stat">
                            <span>Tasks Done Today</span>
                            <h3>{dashboardStats.taskStats.done} / {dashboardStats.taskStats.total}</h3>
                        </div>
                        <div className="wa-stat">
                            <span>Open Tickets</span>
                            <h3>{dashboardStats.openTickets?.total || 0}</h3>
                        </div>
                    </div>

                    <div className="wa-divider" />

                    {/* Pump Progress */}
                    <div className="wa-section-label">Live Pool Pump Tracker</div>
                    <div className="card mb-4" style={{ padding: '16px' }}>
                        <div className="flex justify-between items-center mb-2">
                            <span style={{ fontSize: '13px', fontWeight: 600 }}>Pump Runtime Progress</span>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: dashboardStats.pool.pumpIsOn ? 'var(--success)' : 'var(--text-muted)' }}>
                                {dashboardStats.pool.pumpIsOn ? '● RUNNING' : '○ STOPPED'}
                            </span>
                        </div>
                        <div className="progress-bar mb-2" style={{ height: '12px' }}>
                            <div className="progress-fill" style={{ width: `${poolPct}%`, background: poolColor }} />
                        </div>
                        <div className="flex justify-between" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            <span>{Math.floor(dashboardStats.pool.runtimeMinutes / 60)}h {dashboardStats.pool.runtimeMinutes % 60}m</span>
                            <span>Target: 3h minimum</span>
                        </div>
                    </div>

                    <div className="wa-divider" />

                    {/* Demo Control Panel */}
                    <div className="wa-section-label">Trigger Simulated Events</div>
                    <div className="wa-demo-controls">
                        <button className="wa-demo-btn pool" onClick={() => handleDemoFire('fire-pool-morning')}>
                            <span>💧</span> Fire 7 AM Pool Briefing
                        </button>
                        <button className="wa-demo-btn hk" onClick={() => handleDemoFire('fire-checkout-hk')}>
                            <span>🛏️</span> Fire Guest Checkout → HK Task
                        </button>
                        <button className="wa-demo-btn alert" onClick={() => handleDemoFire('fire-pool-breach')}>
                            <span>🚨</span> Fire pH Breach Alert
                        </button>
                        <button className="wa-demo-btn kitchen" onClick={() => handleDemoFire('fire-kitchen-order')}>
                            <span>🍔</span> Fire New Kitchen Order
                        </button>
                        <button className="wa-demo-btn manager" onClick={() => handleDemoFire('fire-inventory-alert')}>
                            <span>📦</span> Fire Low Stock Alert
                        </button>
                        <button className="wa-demo-btn escalation" onClick={() => handleDemoFire('fire-escalation')}>
                            <span>⏱️</span> Fire 20s Escalation Test
                        </button>
                    </div>
                </div>
            </div>

            {/* Right Pane: Staff Inbox */}
            <div className="wa-pane wa-staff-pane">
                <div className="wa-pane-header flex justify-between items-center">
                    <h2>Staff WhatsApp Inbox</h2>
                    <span className="badge-green">Simulation Mode</span>
                </div>

                {/* Staff Tabs */}
                <div className="wa-staff-selector">
                    {staffList.map(staff => {
                        const sid = dbStaffIds[staff.id];
                        const unread = sid && unreadCounts[sid] ? unreadCounts[sid] : 0;
                        return (
                            <button 
                                key={staff.id}
                                className={`wa-staff-btn ${activeStaff === staff.id ? 'active' : ''}`}
                                onClick={() => handleTabSwitch(staff.id)}
                            >
                                {staff.label}
                                {unread > 0 && <span className="wa-unread-dot">{unread}</span>}
                            </button>
                        );
                    })}
                </div>

                {/* Message List */}
                <div className="wa-message-list">
                    {messages.map((msg, idx) => (
                        <div key={msg.id || idx} className={`wa-bubble ${msg.direction === 'outbound' ? 'staff' : (msg.message_type === 'alert' ? 'alert-msg' : 'system')}`}>
                            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{msg.message_body}</div>
                            <div className="wa-meta">
                                {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} 
                                {msg.direction === 'outbound' && ' ✓✓'}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* Reply Area */}
                <div className="wa-reply-area">
                    <div className="wa-quick-btns">
                        <button onClick={() => sendReply('1')}>1</button>
                        <button onClick={() => sendReply('2')}>2</button>
                        <button onClick={() => sendReply('3')}>3</button>
                        <button onClick={() => sendReply('CHECK')}>CHECK</button>
                        <button className="primary" onClick={() => sendReply('START')}>START</button>
                        <button className="success" onClick={() => sendReply('DONE')}>DONE</button>
                        <button className="danger" onClick={() => sendReply('HELP')}>HELP</button>
                        <button className="warning" onClick={() => sendReply('ISSUE')}>ISSUE</button>
                        <button className="info" onClick={() => sendReply('ORDER')}>ORDER</button>
                        <button onClick={() => sendReply('OK')}>OK</button>
                    </div>
                    
                    <div className="wa-reply-row mt-4">
                        <input 
                            type="text" 
                            className="form-input" 
                            placeholder="Type generic reply (e.g. DONE 2, or pH 7.4...)"
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && sendReply(replyText)}
                        />
                        <button className="btn btn-primary" onClick={() => sendReply(replyText)}>Send</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
