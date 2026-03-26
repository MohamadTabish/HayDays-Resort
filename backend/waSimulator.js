// ─── waSimulator.js ──────────────────────────────────────────────────────────
// Central WhatsApp simulation engine.
// Sends messages to staff inboxes (WA_Messages table) and emits Socket.IO events.
//
// ── API handover note ────────────────────────────────────────────────────────
// When real WA API is approved, exactly 3 things change:
//   1. send() → calls real WhatsApp Business API instead of DB insert
//   2. The webhook receiver replaces POST /api/wa/reply
//   3. Delivery status comes from API callback instead of immediate 'Delivered'
// Everything else (replyParser, scheduler, templates) stays identical.

const { v4: uuidv4 } = require('uuid');

let db = null;
let io = null;

// Per-staff simulation state (in-memory, resets on server restart)
const staffState = {};

function getStaffState(staffId) {
    if (!staffState[staffId]) {
        staffState[staffId] = {
            strainerDone: false,
            pumpStarted: false,
            pumpStartTime: null,
            activeTasks: {},         // taskId → { title, category, startedAt }
            escalationTimers: {},    // taskId → { reminder: timeoutId, reassign: timeoutId }
            lastContext: null,       // tracks what the last message was about for context-aware replies
            inventoryAlertItem: null // tracks last inventory alert item for ORDER/OK replies
        };
    }
    return staffState[staffId];
}

function resetStaffState(staffId) {
    staffState[staffId] = null;
}

// ─── Core send function ──────────────────────────────────────────────────────
// When real API is approved, this function body changes to call the WA Business API.
function send(staffId, messageBody, messageType = 'wa', taskId = null) {
    const id = uuidv4();
    db.prepare(`INSERT INTO WA_Messages (id, staff_id, direction, message_type, message_body, task_id, is_read)
        VALUES (?, ?, 'inbound', ?, ?, ?, 0)`)
        .run(id, staffId, messageType, messageBody, taskId);

    const msg = { id, staff_id: staffId, direction: 'inbound', message_type: messageType, message_body: messageBody, task_id: taskId, is_read: 0, created_at: new Date().toISOString() };
    io.emit('wa_message', msg);
    return id;
}

// ─── Record staff reply ──────────────────────────────────────────────────────
function recordReply(staffId, messageBody, taskId = null) {
    const id = uuidv4();
    db.prepare(`INSERT INTO WA_Messages (id, staff_id, direction, message_type, message_body, task_id, is_read)
        VALUES (?, ?, 'outbound', 'reply', ?, ?, 1)`)
        .run(id, staffId, messageBody, taskId);

    const msg = { id, staff_id: staffId, direction: 'outbound', message_type: 'reply', message_body: messageBody, task_id: taskId, is_read: 1, created_at: new Date().toISOString() };
    io.emit('wa_message', msg);
    return id;
}

// ─── Get inbox ───────────────────────────────────────────────────────────────
function getInbox(staffId) {
    return db.prepare(`SELECT * FROM WA_Messages WHERE staff_id = ? ORDER BY created_at ASC`).all(staffId);
}

// ─── Mark all messages as read ───────────────────────────────────────────────
function markRead(staffId) {
    db.prepare(`UPDATE WA_Messages SET is_read = 1 WHERE staff_id = ? AND is_read = 0`).run(staffId);
}

// ─── Get unread counts per staff ─────────────────────────────────────────────
function getUnreadCounts() {
    const rows = db.prepare(`SELECT staff_id, COUNT(*) as count FROM WA_Messages WHERE direction = 'inbound' AND is_read = 0 GROUP BY staff_id`).all();
    const counts = {};
    rows.forEach(r => { counts[r.staff_id] = r.count; });
    return counts;
}

// ─── Clear inbox ─────────────────────────────────────────────────────────────
function clearInbox(staffId) {
    if (staffId) {
        db.prepare(`DELETE FROM WA_Messages WHERE staff_id = ?`).run(staffId);
        resetStaffState(staffId);
    } else {
        db.prepare(`DELETE FROM WA_Messages`).run();
        Object.keys(staffState).forEach(k => delete staffState[k]);
    }
}

// ─── Pump state management ──────────────────────────────────────────────────
let pumpMins = 0;
let pumpRunning = false;
let pumpInterval = null;

function startPump() {
    if (pumpRunning) return;
    pumpRunning = true;
    pumpInterval = setInterval(() => {
        pumpMins++;
        io.emit('pump_update', getPumpStatus());
    }, 600); // 1 real second ≈ 1 simulated minute (accelerated for demo)
}

function stopPump() {
    if (pumpInterval) { clearInterval(pumpInterval); pumpInterval = null; }
    pumpRunning = false;
}

function getPumpStatus() {
    return {
        pumpMins,
        pumpRunning,
        pumpHours: Math.floor(pumpMins / 60),
        pumpMinsRemainder: pumpMins % 60,
        pct: Math.min(100, Math.round(pumpMins / 180 * 100)),
        metMinimum: pumpMins >= 180
    };
}

function resetPump() {
    stopPump();
    pumpMins = 0;
}

// ─── Escalation timer management ─────────────────────────────────────────────
function setEscalationTimer(staffId, taskId, taskTitle, reminderMs, reassignMs, reassignToId, reassignToName) {
    const state = getStaffState(staffId);

    // Clear any existing timer for this task
    cancelEscalationTimer(staffId, taskId);

    const templates = require('./messageTemplates');

    const reminderTimeout = setTimeout(() => {
        send(staffId, templates.escalationReminder(taskTitle, taskId), 'alert', taskId);
        io.emit('escalation_update', { type: 'reminder', staffId, taskId, taskTitle });

        const reassignTimeout = setTimeout(() => {
            // Send reassignment to new staff
            if (reassignToId) {
                send(reassignToId, templates.escalationReassign(taskTitle, 'previous staff', 'ASAP', taskId), 'wa', taskId);
                io.emit('escalation_update', { type: 'reassign', staffId, taskId, taskTitle, reassignToId, reassignToName });
            }
            // Clean up
            delete state.escalationTimers[taskId];
        }, reassignMs);

        state.escalationTimers[taskId] = { ...state.escalationTimers[taskId], reassign: reassignTimeout };
    }, reminderMs);

    state.escalationTimers[taskId] = { reminder: reminderTimeout, reassign: null };
}

function cancelEscalationTimer(staffId, taskId) {
    const state = getStaffState(staffId);
    if (state.escalationTimers[taskId]) {
        if (state.escalationTimers[taskId].reminder) clearTimeout(state.escalationTimers[taskId].reminder);
        if (state.escalationTimers[taskId].reassign) clearTimeout(state.escalationTimers[taskId].reassign);
        delete state.escalationTimers[taskId];
    }
}

function cancelAllEscalationTimers(staffId) {
    const state = getStaffState(staffId);
    Object.keys(state.escalationTimers).forEach(taskId => {
        cancelEscalationTimer(staffId, taskId);
    });
}

// ─── Initialize ──────────────────────────────────────────────────────────────
function init(database, socketIo) {
    db = database;
    io = socketIo;
}

module.exports = {
    init,
    send,
    recordReply,
    getInbox,
    markRead,
    getUnreadCounts,
    clearInbox,
    getStaffState,
    resetStaffState,
    startPump,
    stopPump,
    getPumpStatus,
    resetPump,
    setEscalationTimer,
    cancelEscalationTimer,
    cancelAllEscalationTimers
};
