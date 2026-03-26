import React, { useState, useEffect } from 'react';
import API from '../api';

export default function InventoryPage() {
    const [items, setItems] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: '', category: 'Kitchen', unit: '', min_threshold: '', current_stock: '' });
    const [editing, setEditing] = useState(null);

    const fetch = async () => { const { data } = await API.get('/inventory'); setItems(data); };
    useEffect(() => { fetch(); }, []);

    const createItem = async (e) => {
        e.preventDefault();
        await API.post('/inventory', form);
        setShowForm(false); setForm({ name: '', category: 'Kitchen', unit: '', min_threshold: '', current_stock: '' }); fetch();
    };

    const updateStock = async (id, newStock) => {
        await API.patch(`/inventory/${id}`, { current_stock: parseFloat(newStock) }); fetch();
    };

    const low = items.filter(i => i.current_stock <= i.min_threshold);
    const ok = items.filter(i => i.current_stock > i.min_threshold);

    return (
        <div className="page-content fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                    <div className="section-title">📦 Inventory Management</div>
                    <div className="section-subtitle">Stock tracking across all departments with low-stock alerts</div>
                </div>
                <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>➕ Add Item</button>
            </div>

            {low.length > 0 && (
                <div style={{ background: 'var(--danger-bg)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)', padding: '14px 16px', marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center' }}>
                    <span style={{ fontSize: 22 }}>⚠️</span>
                    <div>
                        <div style={{ fontWeight: 700, color: 'var(--danger)' }}>{low.length} items below threshold</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{low.map(i => i.name).join(' · ')}</div>
                    </div>
                </div>
            )}

            {showForm && (
                <div className="card mb-6 fade-in">
                    <div className="card-title" style={{ marginBottom: 16 }}>Add Inventory Item</div>
                    <form onSubmit={createItem}>
                        <div className="grid-3">
                            <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
                            <div className="form-group">
                                <label className="form-label">Category</label>
                                <select className="form-select" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                                    {['Kitchen','Housekeeping','Pool','Maintenance','General'].map(c => <option key={c}>{c}</option>)}
                                </select>
                            </div>
                            <div className="form-group"><label className="form-label">Unit</label><input className="form-input" placeholder="kg, pcs, liters..." value={form.unit} onChange={e => setForm({...form, unit: e.target.value})} required /></div>
                        </div>
                        <div className="grid-2">
                            <div className="form-group"><label className="form-label">Current Stock</label><input type="number" step="0.1" className="form-input" value={form.current_stock} onChange={e => setForm({...form, current_stock: e.target.value})} required /></div>
                            <div className="form-group"><label className="form-label">Min Threshold (Alert Below)</label><input type="number" step="0.1" className="form-input" value={form.min_threshold} onChange={e => setForm({...form, min_threshold: e.target.value})} required /></div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button type="submit" className="btn btn-primary">Add Item</button>
                            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="card">
                <table className="data-table">
                    <thead><tr><th>Item</th><th>Category</th><th>Unit</th><th>Stock</th><th>Minimum</th><th>Status</th><th>Action</th></tr></thead>
                    <tbody>
                        {items.map(i => {
                            const isLow = i.current_stock <= i.min_threshold;
                            return (
                                <tr key={i.id}>
                                    <td style={{ fontWeight: 600 }}>{i.name}</td>
                                    <td><span className="status-badge badge-gray">{i.category}</span></td>
                                    <td>{i.unit}</td>
                                    <td style={{ color: isLow ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>
                                        {editing === i.id ? (
                                            <input type="number" step="0.1" defaultValue={i.current_stock} style={{ width: 80, background: 'var(--bg-tertiary)', border: '1px solid var(--accent)', borderRadius: 4, padding: '2px 6px', color: 'var(--text-primary)', fontSize: 13 }}
                                                onBlur={e => { updateStock(i.id, e.target.value); setEditing(null); }}
                                                onKeyDown={e => { if (e.key === 'Enter') { updateStock(i.id, e.target.value); setEditing(null); } }}
                                                autoFocus
                                            />
                                        ) : (
                                            <span style={{ cursor: 'pointer' }} onClick={() => setEditing(i.id)} title="Click to edit">{i.current_stock}</span>
                                        )}
                                    </td>
                                    <td>{i.min_threshold}</td>
                                    <td><span className={`status-badge ${isLow ? 'badge-red' : 'badge-green'}`}>{isLow ? '⚠️ Low Stock' : '✅ OK'}</span></td>
                                    <td><button className="btn btn-secondary btn-sm" onClick={() => setEditing(i.id)}>✏️ Edit</button></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
