import React, { useState } from 'react';

export default function PetCarePage() {
    const [form, setForm] = useState({ guest_name: '', room: '', pet_name: '', pet_type: '', services: [], notes: '' });
    const [submitted, setSubmitted] = useState(false);

    const SERVICES = ['Walking', 'Feeding', 'Grooming', 'Veterinary escort', 'Pet sitting', 'Exercise session'];

    const toggleService = (svc) => {
        setForm(f => ({ ...f, services: f.services.includes(svc) ? f.services.filter(s => s !== svc) : [...f.services, svc] }));
    };

    const submit = (e) => { e.preventDefault(); setSubmitted(true); };

    return (
        <div className="page-content fade-in">
            <div className="section-title">🐾 Pet Care Services</div>
            <div className="section-subtitle">Guest pet service requests and care tracking</div>

            <div style={{ background: 'var(--info-bg)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 20 }}>
                <strong style={{ color: 'var(--info)' }}>📋 Module Status:</strong> Service request and care log active. Task assignment visible in Maintenance module.
            </div>

            {submitted ? (
                <div className="card fade-in" style={{ textAlign: 'center', padding: 40 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🐾</div>
                    <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Request Submitted!</div>
                    <div style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Pet care request for {form.pet_name} has been logged and will be assigned to Guest Service Staff.</div>
                    <button className="btn btn-primary" onClick={() => { setSubmitted(false); setForm({ guest_name: '', room: '', pet_name: '', pet_type: '', services: [], notes: '' }); }}>Submit Another Request</button>
                </div>
            ) : (
                <div className="card">
                    <div className="card-title" style={{ marginBottom: 20 }}>🐾 New Pet Service Request</div>
                    <form onSubmit={submit}>
                        <div className="grid-2">
                            <div className="form-group"><label className="form-label">Guest Name</label><input className="form-input" value={form.guest_name} onChange={e => setForm({...form, guest_name: e.target.value})} required /></div>
                            <div className="form-group"><label className="form-label">Room Number</label><input className="form-input" value={form.room} onChange={e => setForm({...form, room: e.target.value})} required /></div>
                        </div>
                        <div className="grid-2">
                            <div className="form-group"><label className="form-label">Pet Name</label><input className="form-input" value={form.pet_name} onChange={e => setForm({...form, pet_name: e.target.value})} required /></div>
                            <div className="form-group">
                                <label className="form-label">Pet Type</label>
                                <select className="form-select" value={form.pet_type} onChange={e => setForm({...form, pet_type: e.target.value})} required>
                                    <option value="">Select type</option>
                                    {['Dog','Cat','Bird','Rabbit','Other'].map(p => <option key={p}>{p}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Services Requested</label>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                                {SERVICES.map(svc => (
                                    <button type="button" key={svc} onClick={() => toggleService(svc)}
                                        className={`btn btn-sm ${form.services.includes(svc) ? 'btn-primary' : 'btn-secondary'}`}>
                                        {svc}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="form-group"><label className="form-label">Special Instructions</label><textarea className="form-textarea" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Any allergies, behavioral notes, feeding schedule..." /></div>
                        <button type="submit" className="btn btn-primary">Submit Request 🐾</button>
                    </form>
                </div>
            )}
        </div>
    );
}
