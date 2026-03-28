import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        try { return JSON.parse(localStorage.getItem('haydays_user')); } catch { return null; }
    });
    const [socket, setSocket] = useState(null);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (user) {
            const backendUrl = import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin;
            const s = io(backendUrl);
            setSocket(s);
            s.on('new_notification', (data) => {
                if (data.recipientId === user.id) setUnreadCount(c => c + 1);
            });
            return () => s.disconnect();
        }
    }, [user?.id]);

    const login = useCallback((token, userData) => {
        localStorage.setItem('haydays_token', token);
        localStorage.setItem('haydays_user', JSON.stringify(userData));
        setUser(userData);
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('haydays_token');
        localStorage.removeItem('haydays_user');
        setUser(null);
        socket?.disconnect();
    }, [socket]);

    return (
        <AuthContext.Provider value={{ user, login, logout, socket, unreadCount, setUnreadCount }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
