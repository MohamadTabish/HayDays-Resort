import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import API from '../api';

const statusColor = (s) => {
    const m = { Green: 'badge-green', Amber: 'badge-amber', Red: 'badge-red' };
    return m[s] || 'badge-gray';
};

function StatCard({ label, value, sub, color = 'var(--accent)', icon }) {
    return (
        <div className="stat-card" style={{ borderLeft: `3px solid ${color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div className="stat-label">{icon} {label}</div>
                    <div className="stat-value" style={{ color }}>{value}</div>
                </div>
            </div>
            {sub && <div className="stat-sub">{sub}</div>}
        </div>
    );
}

function ProgressBar({ value, max, color }) {
    const pct = Math.min(100, Math.round((value / max) * 100));
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, color: 'var(--text-secondary)' }}>
                <span>Pump Runtime</span>
                <span>{Math.round(value / 60 * 10) / 10}h / 3h</span>
            </div>
            <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
            </div>
        </div>
    );
}

export default function Dashboard() {
    const { user, socket } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchDashboard = useCallback(async () => {
        try {
            const { data: d } = await API.get('/dashboard');
            setData(d);
        } catch (e) {
            console.error('Dashboard fetch error', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

    useEffect(() => {
        if (!socket) return;
        const handler = () => fetchDashboard();
        socket.on('dashboard_updated', handler);
        socket.on('pool_updated', handler);
        return () => { socket.off('dashboard_updated', handler); socket.off('pool_updated', handler); };
    }, [socket, fetchDashboard]);

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>;
    if (!data) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--danger)' }}>Failed to load dashboard. Is the backend running?</div>;

    const { occupancy, taskStats, openTickets, unackNotifications, lowStockItems, pool, staffStatus } = data;
    const pumpPct = Math.min(100, (pool.runtimeMinutes / 180) * 100);
    const pumpColor = pool.runtimeMinutes >= 180 ? 'var(--success)' : pool.runtimeMinutes >= 90 ? 'var(--warning)' : 'var(--danger)';

    return (
        <div className="page-content fade-in">
            <div className="topbar" style={{ margin: '-24px -24px 24px', width: 'calc(100% + 48px)' }}>
                <div className="topbar-title">📊 Manager Dashboard</div>
                <div className="topbar-actions">
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Welcome, {user?.name}</span>
                </div>
            </div>

            {/* Row 1 — Key Stats */}
            <div className="grid-4 mb-6">
                <StatCard label="Occupancy" value={`${occupancy.occupied}/${occupancy.total}`}
                    sub={`${occupancy.arrivalsToday} arriving · ${occupancy.departuresToday} departing today`}
                    color="var(--accent)" icon="🏨" />
                <StatCard label="Tasks Today" value={taskStats.total}
                    sub={`✅ ${taskStats.done} done · ⏳ ${taskStats.inProgress} in progress · 🔴 ${taskStats.overdue} overdue`}
                    color="var(--success)" icon="✅" />
                <StatCard label="Open Tickets" value={openTickets.total}
                    sub={`${openTickets.critical} critical tickets`}
                    color={openTickets.critical > 0 ? 'var(--danger)' : 'var(--warning)'} icon="🔧" />
                <StatCard label="Notifications" value={unackNotifications}
                    sub="Unacknowledged alerts"
                    color={unackNotifications > 0 ? 'var(--danger)' : 'var(--success)'} icon="💬" />
            </div>

            {/* Row 2 — Pool + Inventory */}
            <div className="grid-2 mb-6">
                <div className="card">
                    <div className="card-header">
                        <div>
                            <div className="card-title">🏊 Pool Status</div>
                            <div className="card-subtitle">Real-time water parameters</div>
                        </div>
                        <div className={`pool-status-indicator pool-${pool.status.toLowerCase()}`}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                            {pool.status}
                        </div>
                    </div>
                    <ProgressBar value={pool.runtimeMinutes} max={180} color={pumpColor} />
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {pool.pumpIsOn && <span className="status-badge badge-green">🟢 Pump Running</span>}
                        {!pool.pumpIsOn && <span className="status-badge badge-gray">⚪ Pump Off</span>}
                        {pool.lastReading && <>
                            <span className="status-badge badge-blue">pH {pool.lastReading.ph_level}</span>
                            <span className="status-badge badge-blue">Cl {pool.lastReading.chlorine_ppm} ppm</span>
                            <span className="status-badge badge-blue">{pool.lastReading.temperature_c}°C</span>
                        </>}
                    </div>
                </div>

                <div className="card">
                    <div className="card-header">
                        <div className="card-title">📦 Inventory Alerts</div>
                        <span className="status-badge badge-amber">{lowStockItems.length} low stock</span>
                    </div>
                    {lowStockItems.length === 0 ? (
                        <div className="empty-state"><p>All stock levels are healthy ✅</p></div>
                    ) : (
                        <table className="data-table">
                            <thead><tr><th>Item</th><th>Category</th><th>Stock</th><th>Min</th></tr></thead>
                            <tbody>
                                {lowStockItems.map(i => (
                                    <tr key={i.id}>
                                        <td>{i.name}</td>
                                        <td><span className="status-badge badge-gray">{i.category}</span></td>
                                        <td style={{ color: 'var(--danger)', fontWeight: 700 }}>{i.current_stock} {i.unit}</td>
                                        <td style={{ color: 'var(--text-muted)' }}>{i.min_threshold} {i.unit}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Row 3 — Staff Status */}
            <div className="card">
                <div className="card-header">
                    <div className="card-title">👥 Staff Availability</div>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {staffStatus.map(s => (
                        <div key={s.id} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', minWidth: 180 }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{s.role}</div>
                            <span className={`status-badge ${s.status === 'On Task' ? 'badge-amber' : 'badge-green'}`}>
                                {s.status === 'On Task' ? '⚙️' : '✅'} {s.status}
                            </span>
                            {s.currentTask && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>📋 {s.currentTask}</div>}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
