const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const { format, addDays, differenceInMinutes, parseISO } = require('date-fns');
const { db, initDB } = require('./database');
const waSimulator = require('./waSimulator');
const replyParser = require('./replyParser');
const scheduler = require('./scheduler');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'haydays_demo_secret_2026';

// Demo time compression (1 real second = N accelerated seconds)
let demoTimeCompressionFactor = 1;

// Init DB
initDB();

// Initialize modules
waSimulator.init(db, io);
replyParser.init(db, io);
scheduler.init(db, io);

// ─── Socket.IO ─────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

function broadcastUpdate(event, data) {
    io.emit(event, data);
}

// ─── Auth Middleware ────────────────────────────────────────────────────────
const auth = (req, res, next) => {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// ─── Helper: Create Notification ──────────────────────────────────────────
function createNotification(recipientId, taskId, messageType, messageBody) {
    const id = uuidv4();
    db.prepare(`INSERT INTO Notifications (id, recipient_id, task_id, message_type, message_body, status, delivered_at)
        VALUES (?, ?, ?, ?, ?, 'Sent', CURRENT_TIMESTAMP)`)
        .run(id, recipientId, taskId || null, messageType, messageBody);
    broadcastUpdate('new_notification', { recipientId, id, messageType, messageBody });
    return id;
}

// ─── Helper: Format WA-style message ──────────────────────────────────────
function formatTaskNotification(staffName, taskTitle, priority, dueBy, location, notes) {
    return `Haydays Resort — Task Notification\n\nHello ${staffName},\n\nYou have been assigned a new task:\n` +
        `Task: ${taskTitle}\nPriority: ${priority}\nDue by: ${dueBy || 'ASAP'}\n` +
        `Location: ${location || 'Resort'}\nNotes: ${notes || 'Please complete promptly.'}\n\n` +
        `Reply 1 to Confirm     Reply 2 if you need help`;
}

// ─── AUTH ───────────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM Users WHERE username = ?').get(username);
    if (user && bcrypt.compareSync(password, user.password)) {
        const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, role: user.role, name: user.name } });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// ─── USERS ──────────────────────────────────────────────────────────────────
app.get('/api/users', auth, (req, res) => {
    const users = db.prepare('SELECT id, name, role, username FROM Users').all();
    res.json(users);
});

// ─── ROOMS ──────────────────────────────────────────────────────────────────
app.get('/api/rooms', auth, (req, res) => {
    res.json(db.prepare('SELECT * FROM Rooms').all());
});

app.patch('/api/rooms/:id', auth, (req, res) => {
    const { status } = req.body;
    db.prepare('UPDATE Rooms SET status = ? WHERE id = ?').run(status, req.params.id);
    broadcastUpdate('room_updated', { id: req.params.id, status });
    res.json({ success: true });
});

// ─── BOOKINGS ───────────────────────────────────────────────────────────────
app.get('/api/bookings', auth, (req, res) => {
    const bookings = db.prepare(`
        SELECT b.*, r.room_number, r.type as room_type 
        FROM Bookings b LEFT JOIN Rooms r ON b.room_id = r.id
        ORDER BY b.checkin_date DESC
    `).all();
    res.json(bookings);
});

app.post('/api/bookings', auth, (req, res) => {
    const { guest_name, room_id, source, checkin_date, checkout_date, is_vip } = req.body;
    // Check room availability
    const conflict = db.prepare(`
        SELECT id FROM Bookings 
        WHERE room_id = ? AND status NOT IN ('CheckedOut','Cancelled')
        AND checkin_date < ? AND checkout_date > ?
    `).get(room_id, checkout_date, checkin_date);
    if (conflict) return res.status(400).json({ error: 'Room not available for selected dates' });

    const id = uuidv4();
    db.prepare(`INSERT INTO Bookings (id, guest_name, room_id, source, checkin_date, checkout_date, status, is_vip) 
        VALUES (?, ?, ?, ?, ?, ?, 'Confirmed', ?)`).run(id, guest_name, room_id, source, checkin_date, checkout_date, is_vip ? 1 : 0);
    broadcastUpdate('booking_updated', {});
    res.json({ id, success: true });
});

app.patch('/api/bookings/:id/checkin', auth, (req, res) => {
    const booking = db.prepare('SELECT * FROM Bookings WHERE id = ?').get(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Not found' });
    db.prepare("UPDATE Bookings SET status = 'CheckedIn' WHERE id = ?").run(req.params.id);
    db.prepare("UPDATE Rooms SET status = 'Occupied' WHERE id = ?").run(booking.room_id);

    // VIP alert
    if (booking.is_vip) {
        const manager = db.prepare("SELECT id FROM Users WHERE role = 'Operations Manager' LIMIT 1").get();
        if (manager) createNotification(manager.id, null, 'TaskAssigned', `⭐ VIP Alert: ${booking.guest_name} has checked in to room. Please ensure premium welcome.`);
    }
    broadcastUpdate('dashboard_updated', {});
    res.json({ success: true });
});

app.patch('/api/bookings/:id/checkout', auth, (req, res) => {
    const booking = db.prepare(`
        SELECT b.*, r.room_number FROM Bookings b JOIN Rooms r ON b.room_id = r.id WHERE b.id = ?
    `).get(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Not found' });

    db.prepare("UPDATE Bookings SET status = 'CheckedOut' WHERE id = ?").run(req.params.id);
    db.prepare("UPDATE Rooms SET status = 'Checkout' WHERE id = ?").run(booking.room_id);

    // Auto-create housekeeping task
    const hkStaff = db.prepare("SELECT id, name FROM Users WHERE role = 'Housekeeping Staff' LIMIT 1").get();
    const taskId = uuidv4();
    db.prepare(`INSERT INTO Tasks (id, title, category, priority, status, assigned_to, location, due_by, notes)
        VALUES (?, ?, 'Housekeeping', 'High', 'Assigned', ?, ?, datetime('now', '+2 hours'), ?)`)
        .run(taskId, `Clean Room ${booking.room_number} after checkout`, hkStaff?.id || null, `Room ${booking.room_number}`, `Auto-generated on checkout of ${booking.guest_name}`);

    if (hkStaff) {
        waSimulator.send(hkStaff.id, require('./messageTemplates').checkoutTask(`Room ${booking.room_number}`, booking.guest_name, null, taskId.substring(0,8).toUpperCase()), 'wa', taskId);
        const msg = formatTaskNotification(hkStaff.name, `Clean Room ${booking.room_number}`, 'High', 'ASAP', `Room ${booking.room_number}`, `Guest ${booking.guest_name} just checked out.`);
        createNotification(hkStaff.id, taskId, 'TaskAssigned', msg);
    }
    broadcastUpdate('dashboard_updated', {});
    res.json({ success: true, taskId });
});

app.patch('/api/bookings/:id', auth, (req, res) => {
    const { status } = req.body;
    db.prepare('UPDATE Bookings SET status = ? WHERE id = ?').run(status, req.params.id);
    broadcastUpdate('booking_updated', {});
    res.json({ success: true });
});

// ─── TASKS ───────────────────────────────────────────────────────────────────
app.get('/api/tasks', auth, (req, res) => {
    const { category, status, assigned_to } = req.query;
    let q = `SELECT t.*, u.name as assigned_name FROM Tasks t LEFT JOIN Users u ON t.assigned_to = u.id WHERE 1=1`;
    const params = [];
    if (category) { q += ' AND t.category = ?'; params.push(category); }
    if (status) { q += ' AND t.status = ?'; params.push(status); }
    if (assigned_to) { q += ' AND t.assigned_to = ?'; params.push(assigned_to); }
    q += ' ORDER BY t.due_by ASC';
    res.json(db.prepare(q).all(...params));
});

app.post('/api/tasks', auth, (req, res) => {
    const { title, category, priority, assigned_to, location, due_by, notes } = req.body;
    const id = uuidv4();
    db.prepare(`INSERT INTO Tasks (id, title, category, priority, status, assigned_to, created_by, location, due_by, notes)
        VALUES (?, ?, ?, ?, 'Assigned', ?, ?, ?, ?, ?)`)
        .run(id, title, category, priority || 'Normal', assigned_to || null, req.user.id, location || null, due_by || null, notes || null);

    if (assigned_to) {
        const staff = db.prepare('SELECT name FROM Users WHERE id = ?').get(assigned_to);
        if (staff) {
            waSimulator.send(assigned_to, require('./messageTemplates').taskAssigned(staff.name, title, priority, due_by, location, notes), 'wa', id);
            const msg = formatTaskNotification(staff.name, title, priority || 'Normal', due_by, location, notes);
            createNotification(assigned_to, id, 'TaskAssigned', msg);
        }
    }
    broadcastUpdate('dashboard_updated', {});
    res.json({ id, success: true });
});

app.patch('/api/tasks/:id/start', auth, (req, res) => {
    db.prepare("UPDATE Tasks SET status = 'InProgress', started_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    broadcastUpdate('dashboard_updated', {});
    res.json({ success: true });
});

app.patch('/api/tasks/:id/complete', auth, (req, res) => {
    const task = db.prepare('SELECT * FROM Tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Not found' });
    const mins = task.started_at ? Math.round(differenceInMinutes(new Date(), new Date(task.started_at))) : null;
    db.prepare("UPDATE Tasks SET status = 'Complete', completed_at = CURRENT_TIMESTAMP, duration_minutes = ? WHERE id = ?").run(mins, req.params.id);
    broadcastUpdate('dashboard_updated', {});
    res.json({ success: true });
});

app.patch('/api/tasks/:id', auth, (req, res) => {
    const { status, assigned_to, notes, priority } = req.body;
    const updates = [];
    const vals = [];
    if (status !== undefined) { updates.push('status = ?'); vals.push(status); }
    if (assigned_to !== undefined) { updates.push('assigned_to = ?'); vals.push(assigned_to); }
    if (notes !== undefined) { updates.push('notes = ?'); vals.push(notes); }
    if (priority !== undefined) { updates.push('priority = ?'); vals.push(priority); }
    if (updates.length === 0) return res.json({ success: true });
    vals.push(req.params.id);
    db.prepare(`UPDATE Tasks SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
    broadcastUpdate('dashboard_updated', {});
    res.json({ success: true });
});

// ─── POOL LOGS ───────────────────────────────────────────────────────────────
app.get('/api/pool/logs', auth, (req, res) => {
    const { date, log_type } = req.query;
    let q = `SELECT p.*, u.name as staff_name FROM Pool_Logs p LEFT JOIN Users u ON p.staff_id = u.id WHERE 1=1`;
    const params = [];
    if (date) { q += ' AND p.log_date = ?'; params.push(date); }
    if (log_type) { q += ' AND p.log_type = ?'; params.push(log_type); }
    q += ' ORDER BY p.start_time DESC';
    res.json(db.prepare(q).all(...params));
});

// Get today's pool status summary
app.get('/api/pool/status', auth, (req, res) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const pumpLogs = db.prepare("SELECT * FROM Pool_Logs WHERE log_date = ? AND log_type IN ('PumpOn','PumpOff') ORDER BY start_time").all(today);
    
    // Calculate pump runtime
    let runtimeMinutes = 0;
    let pumpIsOn = false;
    let lastPumpOn = null;
    for (const log of pumpLogs) {
        if (log.log_type === 'PumpOn') { lastPumpOn = log.start_time; pumpIsOn = true; }
        else if (log.log_type === 'PumpOff' && lastPumpOn) {
            runtimeMinutes += differenceInMinutes(new Date(log.end_time), new Date(lastPumpOn));
            lastPumpOn = null; pumpIsOn = false;
        }
    }
    if (pumpIsOn && lastPumpOn) runtimeMinutes += differenceInMinutes(new Date(), new Date(lastPumpOn));

    const lastReading = db.prepare("SELECT * FROM Pool_Logs WHERE log_date = ? AND log_type = 'Reading' ORDER BY start_time DESC LIMIT 1").get(today);
    const lastVacuum = db.prepare("SELECT log_date FROM Pool_Logs WHERE log_type = 'Vacuum' ORDER BY log_date DESC LIMIT 1").get();
    
    // Determine pool status
    let poolStatus = 'Green';
    if (lastReading) {
        const ph = lastReading.ph_level;
        const cl = lastReading.chlorine_ppm;
        const tmp = lastReading.temperature_c;
        const ntu = lastReading.turbidity_ntu;
        if ((ph < 7.0 || ph > 8.0) || (cl < 0.8 || cl > 4.0) || (tmp > 35 || tmp < 23) || ntu > 3) poolStatus = 'Red';
        else if ((ph < 7.1 || ph > 7.9) || (cl < 0.9 || cl > 3.5) || (tmp > 33 || tmp < 25) || (ntu > 1 && ntu <= 3)) poolStatus = 'Amber';
    }

    const nextVacuumDate = lastVacuum ? format(addDays(new Date(lastVacuum.log_date), 2), 'yyyy-MM-dd') : today;

    res.json({
        runtimeMinutes,
        runtimeHours: (runtimeMinutes / 60).toFixed(2),
        pumpIsOn,
        poolStatus,
        lastReading,
        lastVacuumDate: lastVacuum?.log_date || null,
        nextVacuumDate,
        vacuumDueToday: nextVacuumDate === today
    });
});

// Strainer-gated Pump ON
app.post('/api/pool/pump-on', auth, (req, res) => {
    const { strainer_checked, strainer_condition, notes } = req.body;
    if (!strainer_checked) return res.status(400).json({ error: 'STRAINER_GATE: You must submit a strainer check before starting the pump.' });

    const today = format(new Date(), 'yyyy-MM-dd');
    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO Pool_Logs (id, log_type, staff_id, log_date, start_time, end_time, strainer_checked, strainer_condition, notes)
        VALUES (?, 'PumpOn', ?, ?, ?, ?, 1, ?, ?)`)
        .run(id, req.user.id, today, now, now, strainer_condition || 'Clean', notes || '');
    broadcastUpdate('pool_updated', {});
    res.json({ id, success: true });
});

app.post('/api/pool/pump-off', auth, (req, res) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const lastOn = db.prepare("SELECT id, start_time FROM Pool_Logs WHERE log_date = ? AND log_type = 'PumpOn' ORDER BY start_time DESC LIMIT 1").get(today);
    if (!lastOn) return res.status(400).json({ error: 'No active pump session found.' });

    const now = new Date();
    const mins = Math.round(differenceInMinutes(now, new Date(lastOn.start_time)));
    const id = uuidv4();
    db.prepare(`INSERT INTO Pool_Logs (id, log_type, staff_id, log_date, start_time, end_time, duration_minutes, notes)
        VALUES (?, 'PumpOff', ?, ?, ?, ?, ?, ?)`)
        .run(id, req.user.id, today, lastOn.start_time, now.toISOString(), mins, req.body.notes || '');
    broadcastUpdate('pool_updated', {});
    res.json({ id, success: true, durationMinutes: mins });
});

// Pool reading with threshold checking
function processPoolReading(req, res, bodyData) {
    const { ph_level, chlorine_ppm, temperature_c, turbidity_ntu, water_level_status, notes } = bodyData;
    const today = format(new Date(), 'yyyy-MM-dd');
    const now = new Date().toISOString();
    const id = uuidv4();

    // Check thresholds
    let alertTriggered = false;
    let criticalAlert = false;
    const alerts = [];

    if (ph_level !== undefined) {
        if (ph_level < 7.0 || ph_level > 8.0) { criticalAlert = true; alerts.push(`pH CRITICAL: ${ph_level}`); }
        else if (ph_level < 7.1 || ph_level > 7.9) { alertTriggered = true; alerts.push(`pH WARNING: ${ph_level}`); }
    }
    if (chlorine_ppm !== undefined) {
        if (chlorine_ppm < 0.8 || chlorine_ppm > 4.0) { criticalAlert = true; alerts.push(`Chlorine CRITICAL: ${chlorine_ppm} ppm`); }
        else if (chlorine_ppm < 0.9 || chlorine_ppm > 3.5) { alertTriggered = true; alerts.push(`Chlorine WARNING: ${chlorine_ppm} ppm`); }
    }
    if (temperature_c !== undefined) {
        if (temperature_c > 35 || temperature_c < 23) { criticalAlert = true; alerts.push(`Temp CRITICAL: ${temperature_c}°C`); }
        else if (temperature_c > 33 || temperature_c < 25) { alertTriggered = true; alerts.push(`Temp WARNING: ${temperature_c}°C`); }
    }
    if (turbidity_ntu !== undefined) {
        if (turbidity_ntu > 3) { criticalAlert = true; alerts.push(`Turbidity CRITICAL: ${turbidity_ntu} NTU — Pool closure recommended`); }
        else if (turbidity_ntu >= 1) { alertTriggered = true; alerts.push(`Turbidity WARNING: ${turbidity_ntu} NTU`); }
    }

    db.prepare(`INSERT INTO Pool_Logs (id, log_type, staff_id, log_date, start_time, end_time, ph_level, chlorine_ppm, temperature_c, turbidity_ntu, water_level_status, alert_triggered, notes)
        VALUES (?, 'Reading', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, req.user.id, today, now, now, ph_level, chlorine_ppm, temperature_c, turbidity_ntu, water_level_status || 'Normal', (alertTriggered || criticalAlert) ? 1 : 0, notes || '');

    // Fire alerts
    if (alerts.length > 0) {
        const poolStaff = db.prepare("SELECT id, name FROM Users WHERE role = 'Pool Staff' LIMIT 1").get();
        const manager = db.prepare("SELECT id FROM Users WHERE role = 'Operations Manager' LIMIT 1").get();
        const alertType = criticalAlert ? 'PoolAlert' : 'PoolAlert';
        const msgBody = `🚨 Pool Alert — ${criticalAlert ? 'CRITICAL' : 'WARNING'}\n\n${alerts.join('\n')}\n\nImmediate action required.`;

        if (poolStaff) createNotification(poolStaff.id, null, alertType, msgBody);
        if (criticalAlert && manager) createNotification(manager.id, null, alertType, msgBody);

        // Auto-create task
        const taskId = uuidv4();
        db.prepare(`INSERT INTO Tasks (id, title, category, priority, status, assigned_to, location, due_by, notes)
            VALUES (?, ?, 'Pool', ?, 'Assigned', ?, 'Main Pool', datetime('now', '+2 hours'), ?)`)
            .run(taskId, `Pool parameter alert: ${alerts[0]}`, criticalAlert ? 'Critical' : 'High', poolStaff?.id || null, alerts.join('; '));

        if (poolStaff) {
            const taskMsg = formatTaskNotification(poolStaff.name, `Address pool parameter issue`, criticalAlert ? 'Critical' : 'High', 'ASAP', 'Main Pool', alerts.join('; '));
            createNotification(poolStaff.id, taskId, 'TaskAssigned', taskMsg);
        }
    }

    broadcastUpdate('pool_updated', {});
    broadcastUpdate('dashboard_updated', {});
    res.json({ id, success: true, alertTriggered: alertTriggered || criticalAlert, alerts });
}

app.post('/api/pool/reading', auth, (req, res) => {
    processPoolReading(req, res, req.body);
});

app.post('/api/pool/strainer-check', auth, (req, res) => {
    const { strainer_condition, notes } = req.body;
    const today = format(new Date(), 'yyyy-MM-dd');
    const now = new Date().toISOString();
    const id = uuidv4();
    db.prepare(`INSERT INTO Pool_Logs (id, log_type, staff_id, log_date, start_time, end_time, strainer_condition, notes)
        VALUES (?, 'StrainerCheck', ?, ?, ?, ?, ?, ?)`)
        .run(id, req.user.id, today, now, now, strainer_condition, notes || '');
    
    if (strainer_condition === 'Blocked') {
        const taskId = uuidv4();
        db.prepare(`INSERT INTO Tasks (id, title, category, priority, status, location, notes)
            VALUES (?, 'Strainer blocked — maintenance required', 'Maintenance', 'Critical', 'Open', 'Pool Filter Room', 'Strainer found blocked during check')`)
            .run(taskId);
    }
    broadcastUpdate('pool_updated', {});
    res.json({ id, success: true });
});

app.post('/api/pool/vacuum', auth, (req, res) => {
    const { notes, photo_url } = req.body;
    const today = format(new Date(), 'yyyy-MM-dd');
    const now = new Date().toISOString();
    const id = uuidv4();
    db.prepare(`INSERT INTO Pool_Logs (id, log_type, staff_id, log_date, start_time, end_time, notes, photo_url)
        VALUES (?, 'Vacuum', ?, ?, ?, ?, ?, ?)`)
        .run(id, req.user.id, today, now, now, notes || '', photo_url || '');
    broadcastUpdate('pool_updated', {});
    res.json({ id, success: true });
});

app.post('/api/pool/chemical', auth, (req, res) => {
    const { chemical_type, chemical_quantity, chemical_unit, notes } = req.body;
    const today = format(new Date(), 'yyyy-MM-dd');
    const now = new Date().toISOString();
    const id = uuidv4();
    db.prepare(`INSERT INTO Pool_Logs (id, log_type, staff_id, log_date, start_time, end_time, chemical_type, chemical_quantity, chemical_unit, notes)
        VALUES (?, 'Chemical', ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, req.user.id, today, now, now, chemical_type, chemical_quantity, chemical_unit, notes || '');
    broadcastUpdate('pool_updated', {});
    res.json({ id, success: true });
});

app.get('/api/pool/compliance-report', auth, (req, res) => {
    const { date } = req.query;
    const targetDate = date || format(new Date(), 'yyyy-MM-dd');
    const logs = db.prepare(`SELECT p.*, u.name as staff_name FROM Pool_Logs p LEFT JOIN Users u ON p.staff_id = u.id WHERE p.log_date = ? ORDER BY p.start_time`).all(targetDate);
    const readings = logs.filter(l => l.log_type === 'Reading');
    const pumpLogs = logs.filter(l => l.log_type === 'PumpOn' || l.log_type === 'PumpOff');
    const strainerLogs = logs.filter(l => l.log_type === 'StrainerCheck');
    const vacuumLogs = logs.filter(l => l.log_type === 'Vacuum');
    res.json({ date: targetDate, logs, readings, pumpLogs, strainerLogs, vacuumLogs });
});

// ─── INVENTORY ───────────────────────────────────────────────────────────────
app.get('/api/inventory', auth, (req, res) => {
    res.json(db.prepare('SELECT * FROM Inventory ORDER BY category, name').all());
});

app.post('/api/inventory', auth, (req, res) => {
    const { name, category, unit, min_threshold, current_stock } = req.body;
    const id = uuidv4();
    db.prepare('INSERT INTO Inventory (id, name, category, unit, min_threshold, current_stock) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, name, category, unit, min_threshold, current_stock);
    res.json({ id, success: true });
});

app.patch('/api/inventory/:id', auth, (req, res) => {
    const { current_stock, min_threshold } = req.body;
    const item = db.prepare('SELECT * FROM Inventory WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });

    if (current_stock !== undefined) db.prepare('UPDATE Inventory SET current_stock = ? WHERE id = ?').run(current_stock, req.params.id);
    if (min_threshold !== undefined) db.prepare('UPDATE Inventory SET min_threshold = ? WHERE id = ?').run(min_threshold, req.params.id);

    const updated = db.prepare('SELECT * FROM Inventory WHERE id = ?').get(req.params.id);
    if (updated.current_stock <= updated.min_threshold) {
        const manager = db.prepare("SELECT id FROM Users WHERE role = 'Operations Manager' LIMIT 1").get();
        if (manager) createNotification(manager.id, null, 'InventoryAlert', `⚠️ Low Stock Alert: ${item.name} is at ${updated.current_stock} ${item.unit} (minimum: ${item.min_threshold} ${item.unit})`);
        broadcastUpdate('inventory_alert', { item: updated });
    }
    broadcastUpdate('dashboard_updated', {});
    res.json({ success: true });
});

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
app.get('/api/notifications', auth, (req, res) => {
    const { recipient_id, status } = req.query;
    let q = `SELECT n.*, u.name as recipient_name FROM Notifications n LEFT JOIN Users u ON n.recipient_id = u.id WHERE 1=1`;
    const params = [];
    if (recipient_id) { q += ' AND n.recipient_id = ?'; params.push(recipient_id); }
    if (status) { q += ' AND n.status = ?'; params.push(status); }
    q += ' ORDER BY n.sent_at DESC LIMIT 100';
    res.json(db.prepare(q).all(...params));
});

app.get('/api/notifications/my', auth, (req, res) => {
    const notifs = db.prepare(`SELECT n.*, u.name as recipient_name FROM Notifications n LEFT JOIN Users u ON n.recipient_id = u.id WHERE n.recipient_id = ? ORDER BY n.sent_at DESC LIMIT 50`).all(req.user.id);
    // Mark as read
    db.prepare("UPDATE Notifications SET read_at = CURRENT_TIMESTAMP, status = 'Read' WHERE recipient_id = ? AND read_at IS NULL").run(req.user.id);
    res.json(notifs);
});

app.post('/api/notifications/reply', auth, (req, res) => {
    const { notificationId, replyCode } = req.body;
    const notif = db.prepare('SELECT * FROM Notifications WHERE id = ?').get(notificationId);
    if (!notif) return res.status(404).json({ error: 'Not found' });

    if (replyCode === 1) {
        db.prepare("UPDATE Notifications SET acknowledged_at = CURRENT_TIMESTAMP, status = 'Acknowledged', reply_received = 'Confirm' WHERE id = ?").run(notificationId);
        if (notif.task_id) db.prepare("UPDATE Tasks SET acknowledged_at = CURRENT_TIMESTAMP, status = 'InProgress' WHERE id = ? AND status = 'Assigned'").run(notif.task_id);
    } else if (replyCode === 2) {
        db.prepare("UPDATE Notifications SET status = 'Read', reply_received = 'HelpNeeded' WHERE id = ?").run(notificationId);
        const manager = db.prepare("SELECT id FROM Users WHERE role = 'Operations Manager' LIMIT 1").get();
        if (manager) createNotification(manager.id, notif.task_id, 'Escalation', `🆘 Help requested for task. Staff needs assistance. Task ID: ${notif.task_id}`);
    }
    broadcastUpdate('notification_updated', { id: notificationId });
    broadcastUpdate('dashboard_updated', {});
    res.json({ success: true });
});

app.post('/api/notifications/send', auth, (req, res) => {
    const { recipient_id, message_type, message_body, task_id } = req.body;
    const id = createNotification(recipient_id, task_id || null, message_type, message_body);
    res.json({ id, success: true });
});

// ─── KITCHEN ORDERS ──────────────────────────────────────────────────────────
app.get('/api/kitchen/orders', auth, (req, res) => {
    res.json(db.prepare('SELECT * FROM Kitchen_Orders ORDER BY created_at DESC').all());
});

app.post('/api/kitchen/orders', auth, (req, res) => {
    const { guest_name, room_number, items, dietary_notes } = req.body;
    const id = uuidv4();
    db.prepare(`INSERT INTO Kitchen_Orders (id, guest_name, room_number, items, dietary_notes, status) VALUES (?, ?, ?, ?, ?, 'Received')`)
        .run(id, guest_name, room_number, JSON.stringify(items), dietary_notes || '');
    broadcastUpdate('kitchen_order', { id });
    res.json({ id, success: true });
});

app.patch('/api/kitchen/orders/:id', auth, (req, res) => {
    const { status } = req.body;
    db.prepare('UPDATE Kitchen_Orders SET status = ? WHERE id = ?').run(status, req.params.id);
    broadcastUpdate('kitchen_order_updated', { id: req.params.id, status });
    res.json({ success: true });
});

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
app.get('/api/dashboard', auth, (req, res) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const rooms = db.prepare('SELECT * FROM Rooms').all();
    const occupied = rooms.filter(r => r.status === 'Occupied').length;
    const arrivalsToday = db.prepare("SELECT COUNT(*) as c FROM Bookings WHERE checkin_date = ? AND status = 'Confirmed'").get(today).c;
    const departuresToday = db.prepare("SELECT COUNT(*) as c FROM Bookings WHERE checkout_date = ? AND status = 'CheckedIn'").get(today).c;
    const tasks = db.prepare('SELECT * FROM Tasks').all();
    const taskStats = {
        total: tasks.length,
        done: tasks.filter(t => t.status === 'Complete' || t.status === 'Closed').length,
        inProgress: tasks.filter(t => t.status === 'InProgress').length,
        notStarted: tasks.filter(t => t.status === 'Open' || t.status === 'Assigned').length,
        overdue: tasks.filter(t => t.status === 'Escalated').length
    };
    const openTickets = db.prepare("SELECT COUNT(*) as c FROM Tasks WHERE category = 'Maintenance' AND status NOT IN ('Complete','Closed')").get().c;
    const criticalTickets = db.prepare("SELECT COUNT(*) as c FROM Tasks WHERE category = 'Maintenance' AND priority = 'Critical' AND status NOT IN ('Complete','Closed')").get().c;
    const unackNotifications = db.prepare("SELECT COUNT(*) as c FROM Notifications WHERE status NOT IN ('Acknowledged') AND acknowledged_at IS NULL").get().c;
    const lowStockItems = db.prepare('SELECT * FROM Inventory WHERE current_stock <= min_threshold').all();
    
    // Pool status
    const lastReading = db.prepare("SELECT * FROM Pool_Logs WHERE log_date = ? AND log_type = 'Reading' ORDER BY start_time DESC LIMIT 1").get(today);
    const pumpLogs = db.prepare("SELECT * FROM Pool_Logs WHERE log_date = ? AND log_type IN ('PumpOn','PumpOff') ORDER BY start_time").all(today);
    let runtimeMinutes = 0, pumpIsOn = false, lastPumpOn = null;
    for (const log of pumpLogs) {
        if (log.log_type === 'PumpOn') { lastPumpOn = log.start_time; pumpIsOn = true; }
        else if (log.log_type === 'PumpOff' && lastPumpOn) { runtimeMinutes += differenceInMinutes(new Date(log.end_time), new Date(lastPumpOn)); lastPumpOn = null; pumpIsOn = false; }
    }
    if (pumpIsOn && lastPumpOn) runtimeMinutes += differenceInMinutes(new Date(), new Date(lastPumpOn));

    let poolStatus = 'Green';
    if (lastReading) {
        const { ph_level: ph, chlorine_ppm: cl, temperature_c: tmp, turbidity_ntu: ntu } = lastReading;
        if ((ph != null && (ph < 7.0 || ph > 8.0)) || (cl != null && (cl < 0.8 || cl > 4.0)) || (tmp != null && (tmp > 35 || tmp < 23)) || (ntu != null && ntu > 3)) poolStatus = 'Red';
        else if ((ph != null && (ph < 7.1 || ph > 7.9)) || (cl != null && (cl < 0.9 || cl > 3.5)) || (tmp != null && (tmp > 33 || tmp < 25)) || (ntu != null && ntu >= 1)) poolStatus = 'Amber';
    }

    const users = db.prepare('SELECT id, name, role FROM Users').all();
    const staffStatus = users.map(u => {
        const activeTask = db.prepare("SELECT title FROM Tasks WHERE assigned_to = ? AND status = 'InProgress' LIMIT 1").get(u.id);
        return { ...u, status: activeTask ? 'On Task' : 'Available', currentTask: activeTask?.title || null };
    });

    res.json({
        occupancy: { occupied, total: rooms.length, arrivalsToday, departuresToday },
        taskStats,
        openTickets: { total: openTickets, critical: criticalTickets },
        unackNotifications,
        lowStockItems,
        pool: { status: poolStatus, runtimeMinutes, pumpIsOn, lastReading },
        staffStatus
    });
});

// ─── REPORTS ─────────────────────────────────────────────────────────────────
app.get('/api/reports/daily', auth, (req, res) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const bookings = db.prepare(`SELECT b.*, r.room_number FROM Bookings b LEFT JOIN Rooms r ON b.room_id = r.id WHERE DATE(b.checkin_date) = ? OR DATE(b.checkout_date) = ?`).all(today, today);
    const tasks = db.prepare(`SELECT t.*, u.name as assigned_name FROM Tasks t LEFT JOIN Users u ON t.assigned_to = u.id`).all();
    const poolLogs = db.prepare(`SELECT p.*, u.name as staff_name FROM Pool_Logs p LEFT JOIN Users u ON p.staff_id = u.id WHERE p.log_date = ?`).all(today);
    const alerts = db.prepare(`SELECT * FROM Notifications WHERE DATE(sent_at) = ? ORDER BY sent_at DESC`).all(today);
    const inventory = db.prepare(`SELECT * FROM Inventory WHERE current_stock <= min_threshold`).all();
    res.json({ date: today, bookings, tasks, poolLogs, alerts, lowStock: inventory });
});

// ─── WHATSAPP SIMULATOR ENDPOINTS ───────────────────────────────────────────
app.get('/api/wa/inbox/:staffId', auth, (req, res) => {
    res.json(waSimulator.getInbox(req.params.staffId));
});

app.post('/api/wa/reply', auth, (req, res) => {
    const { staffId, messageBody, staffRole, staffName } = req.body;
    replyParser.parseReply(staffId, messageBody, staffRole, staffName);
    res.json({ success: true });
});

app.post('/api/wa/send', auth, (req, res) => {
    const { staffId, message } = req.body;
    waSimulator.send(staffId, message, 'wa');
    res.json({ success: true });
});

app.get('/api/wa/unread', auth, (req, res) => {
    res.json(waSimulator.getUnreadCounts());
});

app.get('/api/wa/pump-status', auth, (req, res) => {
    res.json(waSimulator.getPumpStatus());
});

app.post('/api/demo/fire-pool-morning', auth, (req, res) => {
    scheduler.firePoolMorningChecklist();
    res.json({ success: true });
});

app.post('/api/demo/fire-checkout-hk', auth, (req, res) => {
    scheduler.fireCheckout('25');
    res.json({ success: true });
});

app.post('/api/demo/fire-pool-breach', auth, (req, res) => {
    processPoolReading(req, res, { ph_level: 8.1, chlorine_ppm: 1.8, temperature_c: 29 });
});

app.post('/api/demo/fire-escalation', auth, (req, res) => {
    try {
        // Demo 20-second escalation test
        const staffId = req.body?.staffId || req.user.id;
        const taskId = uuidv4();
        const taskTitle = 'Demonstrate Escalation Flow';
        
        // Assign fake task
        db.prepare(`INSERT INTO Tasks (id, title, category, priority, status, assigned_to, location)
            VALUES (?, ?, 'Maintenance', 'High', 'Assigned', ?, 'Lobby')`)
            .run(taskId, taskTitle, staffId);
            
        waSimulator.send(staffId, require('./messageTemplates').taskAssigned('Demo User', taskTitle, 'High', 'ASAP', 'Lobby', 'Auto-escalating in 20s...'), 'wa', taskId);
        
        const manager = db.prepare("SELECT id, name FROM Users WHERE role = 'Operations Manager' LIMIT 1").get();
        
        // Set 20 second timer!
        waSimulator.setEscalationTimer(staffId, taskId, taskTitle, 20000, 40000, manager?.id, manager?.name);
        
        res.json({ success: true, taskId, timersSet: true });
    } catch (err) {
        console.error("Error in fire-escalation:", err);
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});

app.post('/api/demo/fire-hk-briefing', auth, (req, res) => {
    scheduler.fireDailyBriefing();
    res.json({ success: true });
});

app.post('/api/demo/fire-kitchen-order', auth, (req, res) => {
    scheduler.fireKitchenOrder();
    res.json({ success: true });
});

app.post('/api/demo/fire-inventory-alert', auth, (req, res) => {
    scheduler.fireInventoryAlert('Chlorine Tabs', 4.5, 10, 'kg');
    res.json({ success: true });
});

// ─── SERVE REACT FRONTEND (Production) ────────────────────────────────────────
const path = require('path');
if (process.env.NODE_ENV === 'production') {
    // Serve the built React app from frontend/dist
    app.use(express.static(path.join(__dirname, '../frontend/dist')));
    // Catch-all: return React app for any unmatched route (client-side routing)
    app.use((req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/dist', 'index.html'));
    });
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`✅ Haydays Backend running on port ${PORT}`));
