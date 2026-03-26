// ─── replyParser.js ────────────────────────────────────────────────────────
// Central router for all inbound WhatsApp replies.
// Parses keywords: DONE, HELP, START, CHECK, ISSUE, 1, 2, 3, DELAY, ORDER, OK.

const wa = require('./waSimulator');
const templates = require('./messageTemplates');
const { v4: uuidv4 } = require('uuid');

let db = null;
let io = null;

function init(database, socketIo) {
    db = database;
    io = socketIo;
}

function now() {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ─── Main Parser ─────────────────────────────────────────────────────────────
function parseReply(staffId, rawText, staffRole, staffName) {
    wa.recordReply(staffId, rawText);
    const upper = rawText.trim().toUpperCase();
    
    // Extract first alphanumeric word as keyword
    const match = upper.match(/[A-Z0-9]+/);
    const kw = match ? match[0] : '';
    
    const state = wa.getStaffState(staffId);

    // Cancel any active escalation timer for this staff member since they replied
    wa.cancelAllEscalationTimers(staffId);

    // Pool Reading Regex Parser (pH X.X CL X.X TEMP XX)
    if (staffRole === 'Pool Staff' && upper.includes('PH') && upper.includes('CL')) {
        return handlePoolReading(staffId, rawText, staffName);
    }

    switch (kw) {
        case '1':
        case '2':
        case '3':
            if (staffRole === 'Pool Staff') handleStrainerCondition(staffId, kw, state);
            else handleNumericConfirm(staffId, kw, state);
            break;
        case 'CHECK':
            if (staffRole === 'Pool Staff') handleStrainerCheck(staffId, state);
            break;
        case 'START':
            handleStart(staffId, staffRole, state, rawText);
            break;
        case 'DONE':
            handleDone(staffId, staffRole, state, upper);
            break;
        case 'HELP':
            handleHelp(staffId, staffRole, staffName);
            break;
        case 'ISSUE':
            handleIssue(staffId, staffName);
            break;
        case 'DELAY':
            handleDelay(staffId, staffName);
            break;
        case 'ORDER':
            handleOrder(staffId, state, staffName);
            break;
        case 'OK':
            handleOk(staffId, state);
            break;
        default:
            // Unrecognized command
            wa.send(staffId, `Command not recognized.\nValid commands: START, DONE, HELP, ISSUE, or 1/2/3 to confirm tasks.`, 'system');
    }
}

// ─── Specific Handlers ───────────────────────────────────────────────────────

function handleStrainerCondition(staffId, kw, state) {
    const conditions = {
        '1': 'Clean and clear',
        '2': 'Partially blocked (cleaned)',
        '3': 'Blocked / damaged — needs attention'
    };
    const cond = conditions[kw];
    state.strainerDone = true;
    
    // Log to DB
    const id = uuidv4();
    db.prepare(`INSERT INTO Pool_Logs (id, log_type, staff_id, log_date, start_time, end_time, strainer_condition, notes)
        VALUES (?, 'StrainerCheck', ?, DATE('now'), datetime('now'), datetime('now'), ?, 'Logged via WA Simulator')`)
        .run(id, staffId, cond);

    io.emit('pool_updated', {});
    io.emit('dashboard_updated', {});

    wa.send(staffId, templates.strainerResult(cond), 'wa');
}

function handleStrainerCheck(staffId, state) {
    if (!state.strainerDone) {
        // Assume clean if they just sent CHECK instead of a number
        handleStrainerCondition(staffId, '1', state);
    } else {
        wa.send(staffId, templates.midDayStrainerCheck(now()), 'wa');
    }
}

function handleNumericConfirm(staffId, kw, state) {
    if (kw === '1') {
        wa.send(staffId, `Task acknowledged. Reply START when you begin.`, 'wa');
    } else if (kw === '2') {
        handleHelp(staffId, 'Staff', 'Staff Member');
    }
}

function handleStart(staffId, staffRole, state, rawText) {
    if (staffRole === 'Pool Staff') {
        if (state.strainerDone) {
            state.pumpStarted = true;
            state.pumpStartTime = new Date();
            wa.startPump();
            
            // Log to DB
            const id = uuidv4();
            db.prepare(`INSERT INTO Pool_Logs (id, log_type, staff_id, log_date, start_time, end_time, strainer_checked)
                VALUES (?, 'PumpOn', ?, DATE('now'), datetime('now'), datetime('now'), 1)`)
                .run(id, staffId);
                
            io.emit('pool_updated', {});
            io.emit('dashboard_updated', {});

            wa.send(staffId, templates.pumpStartConfirm(now()), 'wa');
        } else {
            wa.send(staffId, templates.strainerGateBlock(), 'alert');
        }
    } else if (staffRole === 'Housekeeping Staff' || staffRole === 'Guest Service Staff' || staffRole === 'Maintenance Staff' || staffRole === 'Chef') {
        // Find most recent assigned task
        const task = db.prepare(`SELECT * FROM Tasks WHERE assigned_to = ? AND status IN ('Assigned', 'Open') ORDER BY created_at DESC LIMIT 1`).get(staffId);
        
        if (task) {
            db.prepare("UPDATE Tasks SET status = 'InProgress', started_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.id);
            state.activeTasks[task.id] = { title: task.title, category: task.category, startedAt: new Date() };
            io.emit('dashboard_updated', {});
            wa.send(staffId, templates.taskStarted(task.title, now()), 'wa');
        } else {
            wa.send(staffId, `No pending tasks found. Task started.`, 'wa');
        }
    }
}

function handleDone(staffId, staffRole, state, upperText) {
    if (staffRole === 'Pool Staff' && state.pumpStarted) {
        // Stop Pump
        wa.stopPump();
        state.pumpStarted = false;
        const status = wa.getPumpStatus();
        
        // Log to DB
        const id = uuidv4();
        db.prepare(`INSERT INTO Pool_Logs (id, log_type, staff_id, log_date, start_time, end_time, duration_minutes)
            VALUES (?, 'PumpOff', ?, DATE('now'), datetime('now','-${status.pumpMins} minutes'), datetime('now'), ?)`)
            .run(id, staffId, status.pumpMins);
            
        io.emit('pool_updated', {});
        io.emit('dashboard_updated', {});

        wa.send(staffId, templates.pumpStopConfirm(now(), status.pumpHours, status.pumpMinsRemainder, status.metMinimum), 'wa');
        wa.resetPump();
    } else {
        // Complete Task
        // If "DONE 2" format, complete specific task, otherwise complete newest InProgress task
        let taskId = null;
        let pTask = null;

        const numMatch = upperText.match(/DONE\s+(\d+)/);
        if (numMatch) {
            const idx = parseInt(numMatch[1], 10) - 1; // 0-indexed
            const tasks = db.prepare(`SELECT * FROM Tasks WHERE assigned_to = ? AND status IN ('Assigned', 'Open', 'InProgress') ORDER BY due_by ASC`).all(staffId);
            if (tasks[idx]) pTask = tasks[idx];
        } else {
            pTask = db.prepare(`SELECT * FROM Tasks WHERE assigned_to = ? AND status = 'InProgress' ORDER BY started_at DESC LIMIT 1`).get(staffId);
            if (!pTask) {
                // Try Assigned if no InProgress
                pTask = db.prepare(`SELECT * FROM Tasks WHERE assigned_to = ? AND status IN ('Assigned', 'Open') ORDER BY created_at DESC LIMIT 1`).get(staffId);
            }
        }

        if (pTask) {
            db.prepare("UPDATE Tasks SET status = 'Complete', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(pTask.id);
            if (state.activeTasks[pTask.id]) delete state.activeTasks[pTask.id];
            io.emit('dashboard_updated', {});
            wa.send(staffId, templates.taskCompleted(pTask.title, now()), 'wa');

            // Phase 2: Vacuum 2-day auto-scheduler trigger
            if (pTask.title.toLowerCase().includes('vacuum')) {
                // Verify vacuum completed in DB
                db.prepare(`INSERT INTO Pool_Logs (id, log_type, staff_id, log_date, start_time, end_time, notes)
                    VALUES (?, 'Vacuum', ?, DATE('now'), datetime('now','-45 minutes'), datetime('now'), 'Logged via WA DONE reply')`)
                    .run(uuidv4(), staffId);
            }
        } else if (staffRole === 'Pool Staff' && !state.pumpStarted) {
             wa.send(staffId, templates.poolReadingsLogged(now()), 'wa');
        } else {
            wa.send(staffId, `Task complete. Thank you.`, 'wa');
        }
    }
}

function handlePoolReading(staffId, rawText, staffName) {
    const m = rawText.match(/ph\s*([\d.]+).*cl\s*([\d.]+).*temp\s*([\d.]+)/i);
    if (m) {
        const ph = parseFloat(m[1]);
        const cl = parseFloat(m[2]);
        const temp = parseFloat(m[3]);
        
        const breach = ph < 7.2 || ph > 7.8 || cl < 1.0 || cl > 3.0 || temp > 32 || temp < 26;
        
        // Log to DB
        const id = uuidv4();
        db.prepare(`INSERT INTO Pool_Logs (id, log_type, staff_id, log_date, start_time, end_time, ph_level, chlorine_ppm, temperature_c, alert_triggered)
            VALUES (?, 'Reading', ?, DATE('now'), datetime('now'), datetime('now'), ?, ?, ?, ?)`)
            .run(id, staffId, ph, cl, temp, breach ? 1 : 0);
            
        io.emit('pool_updated', {});
        io.emit('dashboard_updated', {});

        if (breach) {
            const reason = ph > 7.8 ? `pH HIGH (${ph})` : ph < 7.2 ? `pH LOW (${ph})` : cl < 1 ? `Chlorine LOW (${cl})` : cl > 3 ? `Chlorine HIGH (${cl})` : `Temperature out of range (${temp}°C)`;
            
            // Create corrective task
            const taskId = uuidv4();
            db.prepare(`INSERT INTO Tasks (id, title, category, priority, status, assigned_to, location, notes)
                VALUES (?, ?, 'Pool', 'Critical', 'Assigned', ?, 'Main Pool', ?)`)
                .run(taskId, `Pool parameter alert: ${reason}`, staffId, `Corrective action required immediately.`);
                
            // Alert Manager
            const manager = db.prepare("SELECT id FROM Users WHERE role = 'Operations Manager' LIMIT 1").get();
            if (manager) {
                const notifId = uuidv4();
                db.prepare(`INSERT INTO Notifications (id, recipient_id, task_id, message_type, message_body, status)
                    VALUES (?, ?, ?, 'PoolAlert', ?, 'Sent')`)
                    .run(notifId, manager.id, taskId, templates.poolBreachManagerAlert(reason));
                io.emit('new_notification', { recipientId: manager.id });
            }

            wa.send(staffId, templates.poolReadingBreach(reason), 'alert', taskId);
        } else {
            wa.send(staffId, templates.poolReadingReceipt(ph, cl, temp), 'wa');
        }
    } else {
        wa.send(staffId, "Could not parse readings. Format: pH 7.4 CL 1.8 TEMP 29", 'system');
    }
}

function handleHelp(staffId, staffRole, staffName) {
    wa.send(staffId, templates.helpAcknowledged(), 'system');
    
    // Find active task or last message to link help
    let msgContext = "Help requested.";
    const task = db.prepare(`SELECT id, title FROM Tasks WHERE assigned_to = ? AND status IN ('Assigned', 'InProgress') ORDER BY created_at DESC LIMIT 1`).get(staffId);
    if (task) msgContext = `Help requested on task: ${task.title}`;

    const manager = db.prepare("SELECT id FROM Users WHERE role = 'Operations Manager' LIMIT 1").get();
    if (manager) {
        const id = uuidv4();
        db.prepare(`INSERT INTO Notifications (id, recipient_id, task_id, message_type, message_body) VALUES (?, ?, ?, 'Escalation', ?)`)
            .run(id, manager.id, task ? task.id : null, `🆘 ${staffName} (${staffRole}) needs help.\n\n${msgContext}`);
        io.emit('new_notification', { recipientId: manager.id });
        io.emit('dashboard_updated', {});
    }
}

function handleIssue(staffId, staffName) {
    wa.send(staffId, templates.issueEscalated(), 'system');
    
    // Create new unassigned maintenance ticket
    const taskId = uuidv4();
    db.prepare(`INSERT INTO Tasks (id, title, category, priority, status, created_by, notes)
        VALUES (?, ?, 'Maintenance', 'High', 'Open', ?, ?)`)
        .run(taskId, `Escalated Issue reported by ${staffName}`, staffId, `Needs manager review and assignment.`);

    const manager = db.prepare("SELECT id FROM Users WHERE role = 'Operations Manager' LIMIT 1").get();
    if (manager) {
        db.prepare(`INSERT INTO Notifications (id, recipient_id, task_id, message_type, message_body) VALUES (?, ?, ?, 'Escalation', ?)`)
            .run(uuidv4(), manager.id, taskId, `🔴 Issue Escalated by ${staffName}. New maintenance ticket created.`);
        io.emit('new_notification', { recipientId: manager.id });
        io.emit('dashboard_updated', {});
    }
}

function handleDelay(staffId, staffName) {
    wa.send(staffId, templates.delayAcknowledged(), 'system');
    // Note: in a real system we'd update task due_by date here based on state
}

function handleOrder(staffId, state, staffName) {
    if (state.inventoryAlertItem) {
        wa.send(staffId, templates.inventoryOrderConfirmed(state.inventoryAlertItem), 'wa');
        
        const manager = db.prepare("SELECT id FROM Users WHERE role = 'Operations Manager' LIMIT 1").get();
        if (manager) {
            db.prepare(`INSERT INTO Notifications (id, recipient_id, message_type, message_body) VALUES (?, ?, 'InventoryAlert', ?)`)
                .run(uuidv4(), manager.id, `📦 Purchase request submitted by ${staffName} for ${state.inventoryAlertItem}.`);
            io.emit('new_notification', { recipientId: manager.id });
        }
        state.inventoryAlertItem = null;
    } else {
        wa.send(staffId, `No active inventory alert to order.`, 'system');
    }
}

function handleOk(staffId, state) {
    if (state.inventoryAlertItem) {
        wa.send(staffId, templates.inventoryOkAcknowledged(state.inventoryAlertItem), 'system');
        state.inventoryAlertItem = null;
    } else {
        wa.send(staffId, `Acknowledged.`, 'system');
    }
}


module.exports = {
     init,
     parseReply
};
