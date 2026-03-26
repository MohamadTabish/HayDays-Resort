import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import './index.css';

// Pages
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import BookingsPage from './pages/BookingsPage';
import ReceptionPage from './pages/ReceptionPage';
import HousekeepingPage from './pages/HousekeepingPage';
import KitchenPage from './pages/KitchenPage';
import InventoryPage from './pages/InventoryPage';
import MaintenancePage from './pages/MaintenancePage';
import PoolPage from './pages/PoolPage';
import GardeningPage from './pages/GardeningPage';
import PetCarePage from './pages/PetCarePage';
import NotificationsPage from './pages/NotificationsPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import WhatsAppSimPage from './pages/WhatsAppSimPage';

const NAV_ITEMS = [
    { label: 'Overview', path: '/dashboard', icon: '⊞', roles: null },
    { label: 'WhatsApp Sim', path: '/wa-sim', icon: '📱', roles: null },
    { label: 'Bookings', path: '/bookings', icon: '📅', roles: null },
    { label: 'Reception', path: '/reception', icon: '🏨', roles: null },
    { label: 'Housekeeping', path: '/housekeeping', icon: '🧹', roles: ['Operations Manager', 'Housekeeping Staff'] },
    { label: 'Kitchen', path: '/kitchen', icon: '👨‍🍳', roles: ['Operations Manager', 'Chef'] },
    { label: 'Inventory', path: '/inventory', icon: '📦', roles: ['Operations Manager', 'Chef', 'Housekeeping Staff'] },
    { label: 'Maintenance', path: '/maintenance', icon: '🔧', roles: null },
    { label: 'Swimming Pool', path: '/pool', icon: '🏊', roles: ['Operations Manager', 'Pool Staff', 'Guest Service Staff'] },
    { label: 'Gardening', path: '/gardening', icon: '🌿', roles: null },
    { label: 'Pet Care', path: '/petcare', icon: '🐾', roles: null },
];

function Sidebar() {
    const { user, logout, unreadCount } = useAuth();
    const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'U';

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <h1>🏝️ Haydays</h1>
                <p>Resort Management System</p>
            </div>
            <nav className="sidebar-nav">
                <span className="nav-section-label">Main</span>
                {NAV_ITEMS.map(item => (
                    <NavLink key={item.path} to={item.path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <span>{item.icon}</span>
                        <span>{item.label}</span>
                    </NavLink>
                ))}
                <span className="nav-section-label">Communications</span>
                <NavLink to="/notifications" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <span>💬</span>
                    <span>Notifications</span>
                    {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
                </NavLink>
                {(user?.role === 'Operations Manager' || user?.role === 'Accountant') && (
                    <NavLink to="/reports" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <span>📊</span>
                        <span>Reports</span>
                    </NavLink>
                )}
                {user?.role === 'Operations Manager' && (
                    <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <span>⚙️</span>
                        <span>Settings</span>
                    </NavLink>
                )}
            </nav>
            <div className="sidebar-user">
                <div className="user-avatar">{initials}</div>
                <div className="user-info" style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</p>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{user?.role}</span>
                </div>
                <button onClick={logout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: '4px' }} title="Logout">⏻</button>
            </div>
        </aside>
    );
}

function ProtectedLayout({ children, roles }) {
    const { user } = useAuth();
    if (!user) return <Navigate to="/" replace />;
    if (roles && !roles.includes(user.role)) {
        return <Navigate to="/dashboard" replace />; // Or an unauthorized page
    }
    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                {children}
            </main>
        </div>
    );
}

function AppRoutes() {
    const { user } = useAuth();
    return (
        <Routes>
            <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
            <Route path="/dashboard"     element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
            <Route path="/bookings"      element={<ProtectedLayout><BookingsPage /></ProtectedLayout>} />
            <Route path="/reception"     element={<ProtectedLayout><ReceptionPage /></ProtectedLayout>} />
            <Route path="/housekeeping"  element={<ProtectedLayout><HousekeepingPage /></ProtectedLayout>} />
            <Route path="/kitchen"       element={<ProtectedLayout><KitchenPage /></ProtectedLayout>} />
            <Route path="/inventory"     element={<ProtectedLayout><InventoryPage /></ProtectedLayout>} />
            <Route path="/maintenance"   element={<ProtectedLayout><MaintenancePage /></ProtectedLayout>} />
            <Route path="/pool"          element={<ProtectedLayout><PoolPage /></ProtectedLayout>} />
            <Route path="/gardening"     element={<ProtectedLayout><GardeningPage /></ProtectedLayout>} />
            <Route path="/petcare"       element={<ProtectedLayout><PetCarePage /></ProtectedLayout>} />
            <Route path="/notifications" element={<ProtectedLayout><NotificationsPage /></ProtectedLayout>} />
            <Route path="/reports"       element={<ProtectedLayout roles={['Operations Manager', 'Accountant']}><ReportsPage /></ProtectedLayout>} />
            <Route path="/settings"      element={<ProtectedLayout roles={['Operations Manager']}><SettingsPage /></ProtectedLayout>} />
            <Route path="/wa-sim"        element={<ProtectedLayout><WhatsAppSimPage /></ProtectedLayout>} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <AppRoutes />
            </BrowserRouter>
        </AuthProvider>
    );
}
