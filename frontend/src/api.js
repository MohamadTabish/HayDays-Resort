import axios from 'axios';

const API = axios.create({
    baseURL: import.meta.env.DEV ? 'http://localhost:5000/api' : '/api'
});

API.interceptors.request.use(config => {
    const token = localStorage.getItem('haydays_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

API.interceptors.response.use(
    res => res,
    err => {
        if (err.response?.status === 401) {
            localStorage.removeItem('haydays_token');
            localStorage.removeItem('haydays_user');
            window.location.href = '/';
        }
        return Promise.reject(err);
    }
);

export default API;
