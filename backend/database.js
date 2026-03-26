const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'haydays.db');
if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDB() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS Users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS Rooms (
            id TEXT PRIMARY KEY,
            room_number TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Ready'
        );

        CREATE TABLE IF NOT EXISTS Bookings (
            id TEXT PRIMARY KEY,
            guest_name TEXT NOT NULL,
            room_id TEXT REFERENCES Rooms(id),
            source TEXT NOT NULL,
            checkin_date DATE NOT NULL,
            checkout_date DATE NOT NULL,
            status TEXT NOT NULL,
            is_vip BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS WA_Messages (
            id TEXT PRIMARY KEY,
            staff_id TEXT REFERENCES Users(id),
            direction TEXT NOT NULL,
            message_type TEXT,
            message_body TEXT NOT NULL,
            task_id TEXT,
            is_read BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS Tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            priority TEXT NOT NULL DEFAULT 'Normal',
            status TEXT NOT NULL DEFAULT 'Open',
            assigned_to TEXT REFERENCES Users(id),
            created_by TEXT REFERENCES Users(id),
            location TEXT,
            due_by DATETIME,
            started_at DATETIME,
            completed_at DATETIME,
            duration_minutes INTEGER,
            photo_url TEXT,
            notes TEXT,
            is_recurring_flag BOOLEAN DEFAULT 0,
            acknowledged_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS Pool_Logs (
            id TEXT PRIMARY KEY,
            log_type TEXT NOT NULL,
            staff_id TEXT REFERENCES Users(id),
            log_date DATE NOT NULL,
            start_time DATETIME NOT NULL,
            end_time DATETIME NOT NULL,
            duration_minutes INTEGER,
            ph_level REAL,
            chlorine_ppm REAL,
            temperature_c REAL,
            turbidity_ntu REAL,
            water_level_status TEXT DEFAULT 'Normal',
            strainer_condition TEXT,
            pump_on_confirmed BOOLEAN DEFAULT 0,
            strainer_checked BOOLEAN DEFAULT 0,
            chemical_type TEXT,
            chemical_quantity REAL,
            chemical_unit TEXT,
            notes TEXT,
            photo_url TEXT,
            alert_triggered BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS Notifications (
            id TEXT PRIMARY KEY,
            recipient_id TEXT REFERENCES Users(id),
            task_id TEXT REFERENCES Tasks(id),
            message_type TEXT NOT NULL,
            message_body TEXT NOT NULL,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            delivered_at DATETIME,
            read_at DATETIME,
            acknowledged_at DATETIME,
            status TEXT NOT NULL DEFAULT 'Sent',
            reply_received TEXT DEFAULT 'None'
        );

        CREATE TABLE IF NOT EXISTS Inventory (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            unit TEXT NOT NULL,
            min_threshold REAL NOT NULL,
            current_stock REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS Kitchen_Orders (
            id TEXT PRIMARY KEY,
            guest_name TEXT NOT NULL,
            room_number TEXT NOT NULL,
            items TEXT NOT NULL,
            dietary_notes TEXT,
            status TEXT NOT NULL DEFAULT 'Received',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log('✅ Database schema initialized.');
}

module.exports = { db, initDB };
