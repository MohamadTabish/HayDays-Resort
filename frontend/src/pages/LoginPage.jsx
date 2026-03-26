import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import API from '../api';

const QUICK_LOGINS = [
    { label: 'Manager', username: 'manager', password: 'demo123' },
    { label: 'Housekeeping', username: 'housekeeping', password: 'demo123' },
    { label: 'Pool Staff', username: 'pool', password: 'demo123' },
    { label: 'Chef', username: 'chef', password: 'demo123' },
    { label: 'Guest Service', username: 'guestservice', password: 'demo123' },
    { label: 'Maintenance', username: 'maintenance', password: 'demo123' },
    { label: 'Accountant', username: 'accountant', password: 'demo123' },
];

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ username: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError(''); setLoading(true);
        try {
            const { data } = await API.post('/login', form);
            login(data.token, data.user);
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    const quickLogin = async (creds) => {
        setForm(creds);
        setError(''); setLoading(true);
        try {
            const { data } = await API.post('/login', creds);
            login(data.token, data.user);
            navigate('/dashboard');
        } catch (err) {
            setError('Quick login failed. Is the backend running?');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card fade-in">
                <div className="login-logo">
                    <h1>🏝️ Haydays Resort</h1>
                    <p>Digital Management System — Demo v1.0</p>
                </div>

                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Quick Demo Login</p>
                <div className="quick-roles">
                    {QUICK_LOGINS.map(q => (
                        <button key={q.username} className="quick-role-btn" onClick={() => quickLogin(q)}>
                            {q.label}
                        </button>
                    ))}
                </div>

                <div className="divider" />

                {error && <div className="login-error">{error}</div>}

                <form onSubmit={handleLogin}>
                    <div className="form-group">
                        <label className="form-label">Username</label>
                        <input
                            className="form-input"
                            placeholder="e.g. manager"
                            value={form.username}
                            onChange={e => setForm({ ...form, username: e.target.value })}
                            autoComplete="username"
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input
                            type="password"
                            className="form-input"
                            placeholder="••••••••"
                            value={form.password}
                            onChange={e => setForm({ ...form, password: e.target.value })}
                            autoComplete="current-password"
                            required
                        />
                    </div>
                    <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
                        {loading ? <span className="spinner" /> : 'Sign In'}
                    </button>
                </form>

                <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                    All passwords: <strong style={{ color: 'var(--accent-hover)' }}>demo123</strong>
                </p>
            </div>
        </div>
    );
}
