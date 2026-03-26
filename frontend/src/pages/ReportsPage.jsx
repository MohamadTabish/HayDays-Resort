import React, { useState } from 'react';
import API from '../api';

export default function ReportsPage() {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);

    const generate = async () => {
        setLoading(true);
        try {
            const { data } = await API.get('/reports/daily');
            setReport(data);
            await API.post('/demo/generate-report');
        } finally { setLoading(false); }
    };

    return (
        <div className="page-content fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                    <div className="section-title">📊 Daily Management Report</div>
                    <div className="section-subtitle">Auto-generated at 8 PM daily — or generate on demand</div>
                </div>
                <button className="btn btn-primary" onClick={generate} disabled={loading}>
                    {loading ? <><span className="spinner" /> Generating...</> : '📊 Generate Report'}
                </button>
            </div>

            {!report && (
                <div className="card"><div className="empty-state"><p>Click "Generate Report" to create today's daily summary</p></div></div>
            )}

            {report && (
                <div className="fade-in">
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24, marginBottom: 20 }}>
                        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>📊 Daily Summary Report</div>
                        <div style={{ color: 'var(--text-muted)', marginBottom: 20 }}>Generated: {new Date().toLocaleString()} · Date: {report.date}</div>

                        <div className="grid-3" style={{ marginBottom: 24 }}>
                            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: 16 }}>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>🏨 OCCUPANCY</div>
                                <div style={{ fontWeight: 700 }}>Today's Activity</div>
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
                                    {report.bookings.filter(b => b.status === 'CheckedIn').length} guests staying<br />
                                    {report.bookings.filter(b => b.checkin_date === report.date).length} check-ins today<br />
                                    {report.bookings.filter(b => b.checkout_date === report.date).length} check-outs today
                                </div>
                            </div>
                            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: 16 }}>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>✅ TASKS</div>
                                <div style={{ fontWeight: 700 }}>Task Completion</div>
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
                                    {report.tasks.filter(t => t.status === 'Complete').length} completed<br />
                                    {report.tasks.filter(t => t.status === 'InProgress').length} in progress<br />
                                    {report.tasks.filter(t => t.status === 'Escalated').length} escalated
                                </div>
                            </div>
                            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: 16 }}>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>🏊 POOL</div>
                                <div style={{ fontWeight: 700 }}>Pool Compliance</div>
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
                                    {report.poolLogs.filter(l => l.log_type === 'Reading').length} readings logged<br />
                                    {report.poolLogs.filter(l => l.log_type === 'PumpOn').length} pump cycles<br />
                                    {report.poolLogs.filter(l => l.alert_triggered).length} alerts fired<br />
                                    {report.poolLogs.filter(l => l.log_type === 'Vacuum').length} vacuum sessions
                                </div>
                            </div>
                        </div>

                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>📢 Notifications Today ({report.alerts.length})</div>
                            {report.alerts.slice(0, 5).map(a => (
                                <div key={a.id} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', marginBottom: 6, fontSize: 13 }}>
                                    <span style={{ color: 'var(--text-muted)', marginRight: 8 }}>{new Date(a.sent_at).toLocaleTimeString()}</span>
                                    <span style={{ fontWeight: 600 }}>{a.message_type}:</span> {a.message_body.slice(0, 80)}...
                                </div>
                            ))}
                        </div>

                        {report.lowStock.length > 0 && (
                            <div>
                                <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14, color: 'var(--warning)' }}>⚠️ Low Stock Alerts ({report.lowStock.length} items)</div>
                                {report.lowStock.map(i => (
                                    <div key={i.id} style={{ display: 'flex', gap: 16, fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                                        <span style={{ fontWeight: 600 }}>{i.name}</span>
                                        <span style={{ color: 'var(--danger)' }}>{i.current_stock} {i.unit}</span>
                                        <span style={{ color: 'var(--text-muted)' }}>Min: {i.min_threshold} {i.unit}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
