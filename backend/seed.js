const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const subDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() - n); return r; };
const fmt = (d) => d.toISOString().slice(0, 10);
const fmtTs = (d) => d.toISOString().replace('T', ' ').slice(0, 19);

const dbPath = path.join(__dirname, 'data', 'haydays.db');
const fs = require('fs');
if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('foreign_keys = OFF');

// Ensure schema exists (for fresh databases)
db.exec(`
    CREATE TABLE IF NOT EXISTS Users (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS Rooms (id TEXT PRIMARY KEY, room_number TEXT UNIQUE NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Ready');
    CREATE TABLE IF NOT EXISTS Bookings (id TEXT PRIMARY KEY, guest_name TEXT NOT NULL, room_id TEXT, source TEXT NOT NULL, checkin_date DATE NOT NULL, checkout_date DATE NOT NULL, status TEXT NOT NULL, is_vip BOOLEAN DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS WA_Messages (id TEXT PRIMARY KEY, staff_id TEXT, direction TEXT NOT NULL, message_type TEXT, message_body TEXT NOT NULL, task_id TEXT, is_read BOOLEAN DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS Tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'Normal', status TEXT NOT NULL DEFAULT 'Open', assigned_to TEXT, created_by TEXT, location TEXT, due_by DATETIME, started_at DATETIME, completed_at DATETIME, duration_minutes INTEGER, photo_url TEXT, notes TEXT, is_recurring_flag BOOLEAN DEFAULT 0, acknowledged_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS Pool_Logs (id TEXT PRIMARY KEY, log_type TEXT NOT NULL, staff_id TEXT, log_date DATE NOT NULL, start_time DATETIME NOT NULL, end_time DATETIME NOT NULL, duration_minutes INTEGER, ph_level REAL, chlorine_ppm REAL, temperature_c REAL, turbidity_ntu REAL, water_level_status TEXT DEFAULT 'Normal', strainer_condition TEXT, pump_on_confirmed BOOLEAN DEFAULT 0, strainer_checked BOOLEAN DEFAULT 0, chemical_type TEXT, chemical_quantity REAL, chemical_unit TEXT, notes TEXT, photo_url TEXT, alert_triggered BOOLEAN DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS Notifications (id TEXT PRIMARY KEY, recipient_id TEXT, task_id TEXT, message_type TEXT NOT NULL, message_body TEXT NOT NULL, sent_at DATETIME DEFAULT CURRENT_TIMESTAMP, delivered_at DATETIME, read_at DATETIME, acknowledged_at DATETIME, status TEXT NOT NULL DEFAULT 'Sent', reply_received TEXT DEFAULT 'None');
    CREATE TABLE IF NOT EXISTS Inventory (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, unit TEXT NOT NULL, min_threshold REAL NOT NULL, current_stock REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS Kitchen_Orders (id TEXT PRIMARY KEY, guest_name TEXT NOT NULL, room_number TEXT NOT NULL, items TEXT NOT NULL, dietary_notes TEXT, status TEXT NOT NULL DEFAULT 'Received', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
`);

const hash = (pw) => bcrypt.hashSync(pw, 10);
const today = new Date();

// Check if --force flag is passed to force re-seed
const forceReseed = process.argv.includes('--force');

function seed() {
    // Check if database already has data — skip seeding to preserve user sessions
    const userCount = db.prepare('SELECT COUNT(*) as count FROM Users').get().count;
    if (userCount > 0 && !forceReseed) {
        console.log('✅ Database already seeded (' + userCount + ' users found). Skipping seed.');
        console.log('   To force re-seed, run: node seed.js --force');
        db.close();
        process.exit(0);
    }

    console.log('🌱 Clearing old data...');
    db.exec(`
        DELETE FROM WA_Messages;
        DELETE FROM Notifications;
        DELETE FROM Kitchen_Orders;
        DELETE FROM Tasks;
        DELETE FROM Pool_Logs;
        DELETE FROM Inventory;
        DELETE FROM Bookings;
        DELETE FROM Rooms;
        DELETE FROM Users;
    `);

    // ── 1. USERS (7 staff, one per role) ────────────────────────────────────
    const users = {
        manager:      { id: uuidv4(), name: 'Sarah Manager',       role: 'Operations Manager',  username: 'manager',      password: hash('demo123') },
        accountant:   { id: uuidv4(), name: 'David Accountant',    role: 'Accountant',           username: 'accountant',   password: hash('demo123') },
        housekeeping: { id: uuidv4(), name: 'Sunitha',             role: 'Housekeeping Staff',   username: 'housekeeping', password: hash('demo123') },
        chef:         { id: uuidv4(), name: 'Meena',               role: 'Chef',                 username: 'chef',         password: hash('demo123') },
        guestservice: { id: uuidv4(), name: 'Arjun',               role: 'Guest Service Staff',  username: 'guestservice', password: hash('demo123') },
        pool:         { id: uuidv4(), name: 'Rajan',               role: 'Pool Staff',           username: 'pool',         password: hash('demo123') },
        maintenance:  { id: uuidv4(), name: 'John Maintenance',    role: 'Maintenance Staff',    username: 'maintenance',  password: hash('demo123') },
    };
    const insertUser = db.prepare('INSERT INTO Users (id, name, role, username, password) VALUES (?, ?, ?, ?, ?)');
    Object.values(users).forEach(u => insertUser.run(u.id, u.name, u.role, u.username, u.password));
    console.log('✅ Users seeded');

    // ── 2. ROOMS (5 rooms) ───────────────────────────────────────────────────
    const rooms = [
        { id: uuidv4(), number: '101', type: 'Standard', status: 'Ready' },
        { id: uuidv4(), number: '102', type: 'Standard', status: 'Occupied' },
        { id: uuidv4(), number: '201', type: 'Deluxe',   status: 'Occupied' },
        { id: uuidv4(), number: '202', type: 'Deluxe',   status: 'Checkout' },
        { id: uuidv4(), number: '301', type: 'Suite',    status: 'Ready' },
    ];
    const insertRoom = db.prepare('INSERT INTO Rooms (id, room_number, type, status) VALUES (?, ?, ?, ?)');
    rooms.forEach(r => insertRoom.run(r.id, r.number, r.type, r.status));
    console.log('✅ Rooms seeded');

    // ── 3. BOOKINGS (5 bookings across all sources) ──────────────────────────
    const bookings = [
        { id: uuidv4(), guest: 'John Doe',     room_id: rooms[1].id, source: 'Direct',    checkin: fmt(subDays(today, 2)), checkout: fmt(addDays(today, 2)), status: 'CheckedIn',  vip: 0 },
        { id: uuidv4(), guest: 'Jane Smith',   room_id: rooms[2].id, source: 'Airbnb',    checkin: fmt(subDays(today, 1)), checkout: fmt(addDays(today, 4)), status: 'CheckedIn',  vip: 1 },
        { id: uuidv4(), guest: 'Corp Client',  room_id: rooms[3].id, source: 'Corporate', checkin: fmt(subDays(today, 4)), checkout: fmt(today),            status: 'CheckedOut', vip: 0 },
        { id: uuidv4(), guest: 'Alice Wake',   room_id: rooms[0].id, source: 'Agoda',     checkin: fmt(addDays(today, 1)), checkout: fmt(addDays(today, 3)), status: 'Confirmed',  vip: 0 },
        { id: uuidv4(), guest: 'Bob Builder',  room_id: rooms[4].id, source: 'Direct',    checkin: fmt(addDays(today, 3)), checkout: fmt(addDays(today, 6)), status: 'Confirmed',  vip: 1 },
    ];
    const insertBooking = db.prepare('INSERT INTO Bookings (id, guest_name, room_id, source, checkin_date, checkout_date, status, is_vip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    bookings.forEach(b => insertBooking.run(b.id, b.guest, b.room_id, b.source, b.checkin, b.checkout, b.status, b.vip));
    console.log('✅ Bookings seeded');

    // ── 4. INVENTORY (5 items, 3 below threshold) ────────────────────────────
    const inventory = [
        { id: uuidv4(), name: 'Chlorine Tabs',  category: 'Pool',         unit: 'kg',    min: 10, stock: 4.5 },
        { id: uuidv4(), name: 'Towels',         category: 'Housekeeping', unit: 'pcs',   min: 50, stock: 38 },
        { id: uuidv4(), name: 'Eggs',           category: 'Kitchen',      unit: 'trays', min: 5,  stock: 2 },
        { id: uuidv4(), name: 'Milk',           category: 'Kitchen',      unit: 'liters',min: 10, stock: 18 },
        { id: uuidv4(), name: 'pH Minus',       category: 'Pool',         unit: 'kg',    min: 5,  stock: 12 },
        { id: uuidv4(), name: 'Shampoo (mini)', category: 'Housekeeping', unit: 'pcs',   min: 30, stock: 55 },
        { id: uuidv4(), name: 'Vacuum Bags',    category: 'Housekeeping', unit: 'pcs',   min: 10, stock: 8  },
    ];
    const insertInv = db.prepare('INSERT INTO Inventory (id, name, category, unit, min_threshold, current_stock) VALUES (?, ?, ?, ?, ?, ?)');
    inventory.forEach(i => insertInv.run(i.id, i.name, i.category, i.unit, i.min, i.stock));
    console.log('✅ Inventory seeded');

    // ── 5. TASKS (10 tasks in various states) ────────────────────────────────
    const taskInsert = db.prepare(`INSERT INTO Tasks (id, title, category, priority, status, assigned_to, created_by, location, due_by, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const tasks = [
        { id: uuidv4(), title: 'Clean Room 202 after checkout',          cat: 'Housekeeping', pri: 'High',     status: 'Assigned',    assigned: users.housekeeping.id, loc: 'Room 202',   due: fmtTs(addDays(today, 0)) },
        { id: uuidv4(), title: 'Pool bottom vacuuming',                  cat: 'Pool',         pri: 'Normal',   status: 'Open',        assigned: users.pool.id,         loc: 'Main Pool',  due: fmtTs(addDays(today, 0)) },
        { id: uuidv4(), title: 'Fix AC unit in Room 101',                cat: 'Maintenance',  pri: 'Critical', status: 'Escalated',   assigned: users.maintenance.id,  loc: 'Room 101',   due: fmtTs(subDays(today, 1)) },
        { id: uuidv4(), title: 'Prepare breakfast service',              cat: 'Kitchen',      pri: 'Normal',   status: 'Complete',    assigned: users.chef.id,         loc: 'Kitchen',    due: null },
        { id: uuidv4(), title: 'Inspect fire extinguishers',             cat: 'Maintenance',  pri: 'High',     status: 'InProgress',  assigned: users.guestservice.id, loc: 'All Areas',  due: fmtTs(addDays(today, 1)) },
        { id: uuidv4(), title: 'Morning pool chemical readings',         cat: 'Pool',         pri: 'Normal',   status: 'Complete',    assigned: users.pool.id,         loc: 'Main Pool',  due: null },
        { id: uuidv4(), title: 'Restock housekeeping trolley',           cat: 'Housekeeping', pri: 'Normal',   status: 'Assigned',    assigned: users.housekeeping.id, loc: 'Store Room', due: fmtTs(addDays(today, 0)) },
        { id: uuidv4(), title: 'Garden watering — east wing',            cat: 'Garden',       pri: 'Normal',   status: 'Open',        assigned: users.guestservice.id, loc: 'East Garden',due: fmtTs(addDays(today, 0)) },
        { id: uuidv4(), title: 'Laundry collection from rooms 102, 201', cat: 'Housekeeping', pri: 'Normal',   status: 'Open',        assigned: users.housekeeping.id, loc: 'All Rooms',  due: fmtTs(addDays(today, 0)) },
        { id: uuidv4(), title: 'Weekly pool equipment inspection',       cat: 'Pool',         pri: 'High',     status: 'Assigned',    assigned: users.pool.id,         loc: 'Pool Room',  due: fmtTs(addDays(today, 0)) },
    ];
    tasks.forEach(t => taskInsert.run(t.id, t.title, t.cat, t.pri, t.status, t.assigned || null, users.manager.id, t.loc || null, t.due || null, null, fmtTs(today)));
    console.log('✅ Tasks seeded');

    // ── 6. POOL LOGS (7 days of readings + pump logs) ────────────────────────
    const poolInsert = db.prepare(`INSERT INTO Pool_Logs (id, log_type, staff_id, log_date, start_time, end_time, duration_minutes, ph_level, chlorine_ppm, temperature_c, turbidity_ntu, water_level_status, strainer_condition, strainer_checked, alert_triggered, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    for (let i = 6; i >= 0; i--) {
        const d = subDays(today, i);
        const dateStr = fmt(d);
        const morning = new Date(d); morning.setHours(7, 0, 0);
        const aftrnMorning = new Date(d); aftrnMorning.setHours(7, 15, 0);
        const noon = new Date(d); noon.setHours(13, 0, 0);
        const evening = new Date(d); evening.setHours(18, 0, 0);
        const pumpOn = new Date(d); pumpOn.setHours(8, 30, 0);
        const pumpOff = new Date(d); pumpOff.setHours(14, 0, 0);

        // Strainer check + pump on/off
        poolInsert.run(uuidv4(), 'StrainerCheck', users.pool.id, dateStr, fmtTs(new Date(d.setHours(8, 25))), fmtTs(new Date(d.setHours(8, 28))), 3, null, null, null, null, 'Normal', 'Clean', 1, 0, 'Morning strainer check clear.');
        const dForPump = subDays(today, i);
        poolInsert.run(uuidv4(), 'PumpOn',  users.pool.id, dateStr, fmtTs(pumpOn), fmtTs(pumpOn), null, null, null, null, null, 'Normal', null, 0, 0, null);
        poolInsert.run(uuidv4(), 'PumpOff', users.pool.id, dateStr, fmtTs(pumpOn), fmtTs(pumpOff), Math.round((pumpOff - pumpOn) / 60000), null, null, null, null, 'Normal', null, 0, 0, null);

        // Morning readings — mostly normal, last 2 days have a slight deviation
        const ph  = i === 0 ? 8.1 : (7.3 + (Math.random() * 0.3)).toFixed(1); // Today: pH critical
        const cl  = (1.8 + (Math.random() * 0.6)).toFixed(1);
        const tmp = (28 + (Math.random() * 2)).toFixed(1);
        const ntu = (Math.random() * 0.6).toFixed(2);
        const alert = parseFloat(ph) > 8.0 ? 1 : 0;
        poolInsert.run(uuidv4(), 'Reading', users.pool.id, dateStr, fmtTs(morning), fmtTs(aftrnMorning), 15, parseFloat(ph), parseFloat(cl), parseFloat(tmp), parseFloat(ntu), 'Normal', null, 0, alert, 'Morning reading');

        // Afternoon readings
        const ph2  = (7.2 + (Math.random() * 0.4)).toFixed(1);
        const cl2  = (1.5 + (Math.random() * 0.7)).toFixed(1);
        const tmp2 = (28 + (Math.random() * 2)).toFixed(1);
        const ntu2 = (Math.random() * 0.5).toFixed(2);
        poolInsert.run(uuidv4(), 'Reading', users.pool.id, dateStr, fmtTs(noon), fmtTs(new Date(noon.getTime() + 10*60000)), 10, parseFloat(ph2), parseFloat(cl2), parseFloat(tmp2), parseFloat(ntu2), 'Normal', null, 0, 0, 'Afternoon reading');

        // Vacuum every 2 days
        if (i % 2 === 0 && i > 0) {
            const vacStart = new Date(d); vacStart.setHours(9, 0, 0);
            const vacEnd = new Date(d); vacEnd.setHours(9, 45, 0);
            poolInsert.run(uuidv4(), 'Vacuum', users.pool.id, fmt(subDays(today, i)), fmtTs(vacStart), fmtTs(vacEnd), 45, null, null, null, null, 'Normal', null, 0, 0, 'Pool vacuumed thoroughly.');
        }
    }
    console.log('✅ Pool logs seeded (7 days)');

    // ── 7. NOTIFICATIONS ─────────────────────────────────────────────────────
    const notifInsert = db.prepare(`INSERT INTO Notifications (id, recipient_id, task_id, message_type, message_body, status, delivered_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`);
    notifInsert.run(uuidv4(), users.housekeeping.id, tasks[0].id, 'TaskAssigned',
        `Haydays Resort — Task Notification\n\nHello Sunitha,\n\nYou have been assigned a new task:\nTask: Clean Room 202 after checkout\nPriority: High\nDue by: ASAP\nLocation: Room 202\nNotes: Corp Client just checked out.\n\nReply 1 to Confirm     Reply 2 if you need help`,
        'Sent');
    notifInsert.run(uuidv4(), users.manager.id, null, 'InventoryAlert',
        `⚠️ Low Stock Alert: Chlorine Tabs is at 4.5 kg (minimum: 10 kg). Please approve purchase request.`,
        'Sent');
    notifInsert.run(uuidv4(), users.manager.id, null, 'InventoryAlert',
        `⚠️ Low Stock Alert: Eggs is at 2 trays (minimum: 5 trays).`,
        'Sent');
    notifInsert.run(uuidv4(), users.pool.id, tasks[1].id, 'TaskAssigned',
        `Haydays Resort — Task Notification\n\nHello Rajan,\n\nYou have been assigned a new task:\nTask: Pool bottom vacuuming\nPriority: Normal\nDue by: 12:00 PM today\nLocation: Main swimming pool\nNotes: Last vacuum was 2 days ago. Ensure pump is ON during vacuuming.\n\nReply 1 to Confirm     Reply 2 if you need help`,
        'Sent');
    console.log('✅ Notifications seeded');

    // ── 8. KITCHEN ORDERS ────────────────────────────────────────────────────
    const kitchenInsert = db.prepare(`INSERT INTO Kitchen_Orders (id, guest_name, room_number, items, dietary_notes, status) VALUES (?, ?, ?, ?, ?, ?)`);
    kitchenInsert.run(uuidv4(), 'John Doe',  '102', JSON.stringify(['Full English Breakfast', 'Orange Juice']), 'No pork', 'Served');
    kitchenInsert.run(uuidv4(), 'Jane Smith', '201', JSON.stringify(['Avocado Toast', 'Herbal Tea']), 'Vegan', 'Preparing');
    console.log('✅ Kitchen orders seeded');

    console.log('\n🎉 Seed complete! Login credentials:');
    console.log('   Operations Manager: manager / demo123');
    console.log('   Accountant:         accountant / demo123');
    console.log('   Housekeeping Staff: housekeeping / demo123');
    console.log('   Chef:               chef / demo123');
    console.log('   Guest Service:      guestservice / demo123');
    console.log('   Pool Staff:         pool / demo123');
    console.log('   Maintenance Staff:  maintenance / demo123');
}

seed();
db.close();
