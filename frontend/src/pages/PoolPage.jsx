import React, { useState, useEffect, useCallback } from 'react';
import API from '../api';
import { useAuth } from '../AuthContext';

function PoolStatusBadge({ status }) {
    const map = { Green: ['pool-green', '🟢'], Amber: ['pool-amber', '🟡'], Red: ['pool-red', '🔴'] };
    const [cls, icon] = map[status] || ['pool-green', '🟢'];
    return <div className={`pool-status-indicator ${cls}`}>{icon} Pool Status: {status}</div>;
}

function ReadingForm({ onSubmit }) {
    const [form, setForm] = useState({ ph_level: '', chlorine_ppm: '', temperature_c: '', turbidity_ntu: '', water_level_status: 'Normal', notes: '' });
    const [result, setResult] = useState(null);
    const handle = e => setForm({ ...form, [e.target.name]: e.target.value });
    const submit = async (e) => {
        e.preventDefault();
        const res = await onSubmit(form);
        setResult(res);
        setForm({ ph_level: '', chlorine_ppm: '', temperature_c: '', turbidity_ntu: '', water_level_status: 'Normal', notes: '' });
    };
    return (
        <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>📊 Log Pool Reading</div>
            {result && result.alerts?.length > 0 && (
                <div style={{ background: 'var(--danger-bg)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, color: 'var(--danger)', marginBottom: 6 }}>🚨 Threshold Breached! Alerts fired:</div>
                    {result.alerts.map((a, i) => <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>• {a}</div>)}
                </div>
            )}
            <form onSubmit={submit}>
                <div className="grid-3">
                    <div className="form-group"><label className="form-label">pH Level <span style={{ color: 'var(--text-muted)' }}>(7.2–7.8)</span></label><input type="number" step="0.1" name="ph_level" className="form-input" value={form.ph_level} onChange={handle} placeholder="7.4" /></div>
                    <div className="form-group"><label className="form-label">Chlorine (ppm) <span style={{ color: 'var(--text-muted)' }}>(1.0–3.0)</span></label><input type="number" step="0.1" name="chlorine_ppm" className="form-input" value={form.chlorine_ppm} onChange={handle} placeholder="2.0" /></div>
                    <div className="form-group"><label className="form-label">Temperature (°C) <span style={{ color: 'var(--text-muted)' }}>(26–32)</span></label><input type="number" step="0.1" name="temperature_c" className="form-input" value={form.temperature_c} onChange={handle} placeholder="29" /></div>
                </div>
                <div className="grid-2">
                    <div className="form-group"><label className="form-label">Turbidity (NTU) <span style={{ color: 'var(--text-muted)'}}>({"<"}1 = clear)</span></label><input type="number" step="0.01" name="turbidity_ntu" className="form-input" value={form.turbidity_ntu} onChange={handle} placeholder="0.5" /></div>
                    <div className="form-group">
                        <label className="form-label">Water Level</label>
                        <select name="water_level_status" className="form-select" value={form.water_level_status} onChange={handle}>
                            {['Normal','Low','VeryLow','Overflow'].map(v => <option key={v}>{v}</option>)}
                        </select>
                    </div>
                </div>
                <div className="form-group"><label className="form-label">Notes</label><textarea name="notes" className="form-textarea" value={form.notes} onChange={handle} placeholder="Any observations..." /></div>
                <button type="submit" className="btn btn-primary">Submit Reading</button>
            </form>
        </div>
    );
}

function PumpControls({ status, onPumpOn, onPumpOff }) {
    const [form, setForm] = useState({ strainer_checked: false, strainer_condition: 'Clean', notes: '' });
    const [error, setError] = useState('');
    const [showStrainer, setShowStrainer] = useState(false);

    const handlePumpOn = async () => {
        setError('');
        if (!form.strainer_checked) { setError('⛔ STRAINER GATE: You must confirm the strainer is checked before starting the pump.'); return; }
        try { await onPumpOn(form); setShowStrainer(false); setForm({ strainer_checked: false, strainer_condition: 'Clean', notes: '' }); }
        catch (e) { setError(e.response?.data?.error || 'Failed to start pump'); }
    };

    return (
        <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>⚙️ Pump Controls</div>
            {error && <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, border: '1px solid rgba(239,68,68,0.3)', fontWeight: 600 }}>{error}</div>}
            {status?.pumpIsOn ? (
                <div>
                    <div style={{ background: 'var(--success-bg)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: 12, marginBottom: 16, color: 'var(--success)', fontWeight: 700 }}>🟢 Pump is Running</div>
                    <button className="btn btn-danger w-full" onClick={onPumpOff}>⏸ Stop Pump (Log Pump OFF)</button>
                </div>
            ) : (
                <div>
                    {!showStrainer ? (
                        <button className="btn btn-warning w-full" onClick={() => setShowStrainer(true)}>▶ Start Pump (Log Pump ON)</button>
                    ) : (
                        <div className="fade-in">
                            <div style={{ background: 'var(--warning-bg)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
                                <strong style={{ color: 'var(--warning)' }}>⚠️ Strainer Check Required</strong><br />
                                You must submit a strainer check before starting the pump (Rule 2).
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 13 }}>
                                <input type="checkbox" checked={form.strainer_checked} onChange={e => setForm({ ...form, strainer_checked: e.target.checked })} />
                                <strong>✅ I confirm strainer basket has been checked and cleaned</strong>
                            </label>
                            <div className="form-group">
                                <label className="form-label">Strainer Condition</label>
                                <select className="form-select" value={form.strainer_condition} onChange={e => setForm({...form, strainer_condition: e.target.value})}>
                                    {['Clean','PartiallyBlocked','Blocked'].map(v => <option key={v}>{v}</option>)}
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-primary" onClick={handlePumpOn}>Start Pump ▶</button>
                                <button className="btn btn-secondary" onClick={() => setShowStrainer(false)}>Cancel</button>
                            </div>
                        </div>
                    )}
                </div>
            )}
            <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                    <span>Daily Runtime</span>
                    <span>{status ? (status.runtimeMinutes / 60).toFixed(1) : 0}h / 3h minimum</span>
                </div>
                <div className="progress-bar">
                    <div className="progress-fill" style={{
                        width: `${Math.min(100, ((status?.runtimeMinutes || 0) / 180) * 100)}%`,
                        background: (status?.runtimeMinutes || 0) >= 180 ? 'var(--success)' : 'var(--warning)'
                    }} />
                </div>
            </div>
        </div>
    );
}

export default function PoolPage() {
    const { socket } = useAuth();
    const [poolStatus, setPoolStatus] = useState(null);
    const [logs, setLogs] = useState([]);
    const [activeTab, setActiveTab] = useState('overview');

    const fetchAll = useCallback(async () => {
        const [s, l] = await Promise.all([API.get('/pool/status'), API.get('/pool/logs')]);
        setPoolStatus(s.data); setLogs(l.data);
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);
    useEffect(() => {
        if (!socket) return;
        const h = () => fetchAll();
        socket.on('pool_updated', h);
        return () => socket.off('pool_updated', h);
    }, [socket, fetchAll]);

    const pumpOn = async (form) => { await API.post('/pool/pump-on', form); fetchAll(); };
    const pumpOff = async () => { await API.post('/pool/pump-off', {}); fetchAll(); };
    const submitReading = async (form) => {
        const { data } = await API.post('/pool/reading', {
            ph_level: parseFloat(form.ph_level) || undefined,
            chlorine_ppm: parseFloat(form.chlorine_ppm) || undefined,
            temperature_c: parseFloat(form.temperature_c) || undefined,
            turbidity_ntu: parseFloat(form.turbidity_ntu) || undefined,
            water_level_status: form.water_level_status,
            notes: form.notes
        });
        fetchAll();
        return data;
    };

    const TABS = ['overview', 'readings', 'pump-log', 'compliance'];

    return (
        <div className="page-content fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                    <div className="section-title">🏊 Swimming Pool System</div>
                    <div className="section-subtitle">Full pool maintenance — pump, strainer, vacuum, chemicals & compliance</div>
                </div>
                {poolStatus && <PoolStatusBadge status={poolStatus.poolStatus} />}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                {TABS.map(tab => (
                    <button key={tab} className={`btn btn-sm ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab(tab)}>
                        {tab === 'overview' ? '📊 Overview' : tab === 'readings' ? '📋 Log Reading' : tab === 'pump-log' ? '⚙️ Pump' : '📄 Compliance'}
                    </button>
                ))}
            </div>

            {activeTab === 'overview' && poolStatus && (
                <div className="grid-2 fade-in">
                    <div className="card">
                        <div className="card-title" style={{ marginBottom: 16 }}>📊 Latest Reading</div>
                        {poolStatus.lastReading ? (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                {[
                                    { label: 'pH Level', val: poolStatus.lastReading.ph_level, safe: [7.2, 7.8], unit: '' },
                                    { label: 'Chlorine', val: poolStatus.lastReading.chlorine_ppm, safe: [1.0, 3.0], unit: ' ppm' },
                                    { label: 'Temperature', val: poolStatus.lastReading.temperature_c, safe: [26, 32], unit: '°C' },
                                    { label: 'Turbidity', val: poolStatus.lastReading.turbidity_ntu, safe: [0, 1], unit: ' NTU' },
                                ].map(({ label, val, safe, unit }) => {
                                    const inRange = val != null && val >= safe[0] && val <= safe[1];
                                    return (
                                        <div key={label} style={{ background: inRange ? 'var(--success-bg)' : 'var(--danger-bg)', border: `1px solid ${inRange ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 8, padding: 12, textAlign: 'center' }}>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                                            <div style={{ fontSize: 22, fontWeight: 800, color: inRange ? 'var(--success)' : 'var(--danger)' }}>{val != null ? `${val}${unit}` : '—'}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Safe: {safe[0]}–{safe[1]}{unit}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : <div className="empty-state"><p>No readings today yet</p></div>}
                    </div>

                    <div>
                        <PumpControls status={poolStatus} onPumpOn={pumpOn} onPumpOff={pumpOff} />
                        <div className="card" style={{ marginTop: 16 }}>
                            <div className="card-title" style={{ marginBottom: 12 }}>🧹 Vacuuming Schedule</div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                <div>Last Vacuum: <strong>{poolStatus.lastVacuumDate || 'No record'}</strong></div>
                                <div style={{ marginTop: 6 }}>Next Due: <strong style={{ color: poolStatus.vacuumDueToday ? 'var(--warning)' : 'var(--success)' }}>{poolStatus.nextVacuumDate} {poolStatus.vacuumDueToday ? '⚠️ DUE TODAY!' : ''}</strong></div>
                            </div>
                            {poolStatus.vacuumDueToday && (
                                <button className="btn btn-warning btn-sm" style={{ marginTop: 12 }}
                                    onClick={() => API.post('/pool/vacuum', { notes: 'Pool vacuumed' }).then(fetchAll)}>
                                    ✅ Log Vacuum Complete
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'readings' && (
                <div className="fade-in">
                    <ReadingForm onSubmit={submitReading} />
                </div>
            )}

            {activeTab === 'pump-log' && (
                <div className="fade-in">
                    <PumpControls status={poolStatus} onPumpOn={pumpOn} onPumpOff={pumpOff} />
                </div>
            )}

            {activeTab === 'compliance' && (
                <div className="card fade-in">
                    <div className="card-title" style={{ marginBottom: 16 }}>📄 Pool Log — All Entries</div>
                    <table className="data-table">
                        <thead><tr><th>Type</th><th>Date</th><th>Staff</th><th>pH</th><th>Cl</th><th>Temp</th><th>NTU</th><th>Alert</th></tr></thead>
                        <tbody>
                            {logs.slice(0, 50).map(log => (
                                <tr key={log.id}>
                                    <td><span className="status-badge badge-blue">{log.log_type}</span></td>
                                    <td>{log.log_date} {new Date(log.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                    <td>{log.staff_name}</td>
                                    <td>{log.ph_level ?? '—'}</td>
                                    <td>{log.chlorine_ppm ?? '—'}</td>
                                    <td>{log.temperature_c ?? '—'}</td>
                                    <td>{log.turbidity_ntu ?? '—'}</td>
                                    <td>{log.alert_triggered ? <span className="status-badge badge-red">🚨 Yes</span> : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
