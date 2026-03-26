// ─── scheduler.js ─────────────────────────────────────────────────────────────
// Manages 8 daily cron jobs and provides manual demo 'fire' endpoints.
// When testing, cron expressions evaluate to real time unless demo endpoints are used.

const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const { format, addDays, subDays } = require('date-fns');

const wa = require('./waSimulator');
const templates = require('./messageTemplates');

let db = null;
let io = null;

function init(database, socketIo) {
    db = database;
    io = socketIo;
    scheduleJobs();
}

function scheduleJobs() {
    // 1. 7:00 AM — Daily briefing (all staff)
    cron.schedule('0 7 * * *', () => { fireDailyBriefing(); });

    // 2. 7:00 AM — Pool morning checklist
    cron.schedule('0 7 * * *', () => { firePoolMorningChecklist(); });

    // 3. 7:30 AM — Pool readings reminder
    cron.schedule('30 7 * * *', () => {
        const poolStaff = db.prepare("SELECT id FROM Users WHERE role = 'Pool Staff' LIMIT 1").get();
        if (poolStaff) wa.send(poolStaff.id, "Reminder: 7:30 AM readings due. Reply with: pH X.X CL X.X TEMP X.X", 'system');
    });

    // 4. 7:00 AM — Vacuum due check
    cron.schedule('0 7 * * *', () => { fireVacuumScheduler(); });

    // 5. 1:00 PM — Mid-day strainer check
    cron.schedule('0 13 * * *', () => {
        const poolStaff = db.prepare("SELECT id FROM Users WHERE role = 'Pool Staff' LIMIT 1").get();
        if (poolStaff) wa.send(poolStaff.id, "1:00 PM Mid-day strainer check due.\n\nReply CHECK if clean and clear, or 1/2/3 with condition updates.", 'wa');
    });

    // 6. 1:30 PM — Afternoon readings
    cron.schedule('30 13 * * *', () => {
        const poolStaff = db.prepare("SELECT id FROM Users WHERE role = 'Pool Staff' LIMIT 1").get();
        if (poolStaff) wa.send(poolStaff.id, "Reminder: 1:30 PM readings due. Reply with: pH X.X CL X.X TEMP X.X", 'system');
    });

    // 7. 5:00 PM — Pump runtime warning
    cron.schedule('0 17 * * *', () => { firePumpWarning(); });

    // 8. 8:00 PM — Daily report
    cron.schedule('0 20 * * *', () => { fireDailyReport(); });
}

// ─── Demo Trigger Functions ──────────────────────────────────────────────────

function fireDailyBriefing() {
    // Exclude pool staff as they have custom checklist
    const users = db.prepare("SELECT * FROM Users WHERE role != 'Pool Staff' AND role != 'Operations Manager' AND role != 'Accountant'").all();
    
    users.forEach(u => {
        const myTasks = db.prepare("SELECT * FROM Tasks WHERE assigned_to = ? AND status NOT IN ('Complete','Closed') ORDER BY due_by ASC").all(u.id);
        if (myTasks.length > 0) {
            if (u.role === 'Housekeeping Staff') {
                 wa.send(u.id, templates.housekeepingBriefing(u.name, myTasks), 'system');
            } else {
                 wa.send(u.id, templates.dailyBriefing(u.name, myTasks), 'system');
            }
        }
    });
}

function firePoolMorningChecklist() {
    const poolStaff = db.prepare("SELECT id, name FROM Users WHERE role = 'Pool Staff' LIMIT 1").get();
    if (poolStaff) {
        wa.resetStaffState(poolStaff.id);
        wa.send(poolStaff.id, templates.poolMorningChecklist(), 'system');
        setTimeout(() => {
            wa.send(poolStaff.id, templates.strainerCheckPrompt(), 'wa');
        }, 1000);
    }
}

function fireVacuumScheduler() {
    // Auto-schedule vacuum if last vacuum was 2 days ago
    const lastVacuum = db.prepare("SELECT log_date FROM Pool_Logs WHERE log_type = 'Vacuum' ORDER BY log_date DESC LIMIT 1").get();
    
    if (!lastVacuum) return;
    
    const nextDue = format(addDays(new Date(lastVacuum.log_date), 2), 'yyyy-MM-dd');
    const today = format(new Date(), 'yyyy-MM-dd');
    
    if (nextDue === today) {
        const poolStaff = db.prepare("SELECT id, name FROM Users WHERE role = 'Pool Staff' LIMIT 1").get();
        if (poolStaff) {
            const taskId = uuidv4();
            db.prepare(`INSERT INTO Tasks (id, title, category, priority, status, assigned_to, location, due_by)
                VALUES (?, 'Pool bottom vacuuming', 'Pool', 'Normal', 'Assigned', ?, 'Main Pool', datetime('now', '+5 hours'))`)
                .run(taskId, poolStaff.id);
                
            wa.send(poolStaff.id, templates.vacuumDueReminder(poolStaff.name), 'wa', taskId);
            io.emit('dashboard_updated', {});
        }
    }
}

function firePumpWarning() {
    const today = format(new Date(), 'yyyy-MM-dd');
    const pumpLogs = db.prepare("SELECT * FROM Pool_Logs WHERE log_date = ? AND log_type IN ('PumpOn','PumpOff') ORDER BY start_time").all(today);
    let runtimeMinutes = 0;
    
    for (let i = 0; i < pumpLogs.length - 1; i++) {
        if (pumpLogs[i].log_type === 'PumpOn' && pumpLogs[i+1].log_type === 'PumpOff') {
            runtimeMinutes += Math.round((new Date(pumpLogs[i+1].end_time) - new Date(pumpLogs[i].start_time)) / 60000);
        }
    }
    // Also add current running time if pump is still on
    const status = wa.getPumpStatus();
    if (status.pumpRunning) {
        runtimeMinutes += status.pumpMins;
    }
    
    if (runtimeMinutes < 180) {
        const h = Math.round(runtimeMinutes/60*10)/10;
        const msg = templates.pumpRuntimeWarning(h);
        
        const poolStaff = db.prepare("SELECT id FROM Users WHERE role = 'Pool Staff' LIMIT 1").get();
        if (poolStaff) wa.send(poolStaff.id, msg, 'alert');
        
        const manager = db.prepare("SELECT id FROM Users WHERE role = 'Operations Manager' LIMIT 1").get();
        if (manager) {
            db.prepare(`INSERT INTO Notifications (id, recipient_id, message_type, message_body) VALUES (?, ?, 'Reminder', ?)`)
            .run(uuidv4(), manager.id, msg);
            io.emit('new_notification', { recipientId: manager.id });
        }
    }
}

function fireDailyReport() {
    const today = format(new Date(), 'yyyy-MM-dd');
    const manager = db.prepare("SELECT id FROM Users WHERE role = 'Operations Manager' LIMIT 1").get();
    if (manager) {
        db.prepare(`INSERT INTO Notifications (id, recipient_id, message_type, message_body) VALUES (?, ?, 'DailyReport', ?)`)
            .run(uuidv4(), manager.id, templates.dailyReport(today, 'Report has been generated. Check the Reports section for full details.'));
        io.emit('new_notification', { recipientId: manager.id });
    }
}

function fireCheckout(roomId) {
    const hkStaff = db.prepare("SELECT id, name FROM Users WHERE role = 'Housekeeping Staff' LIMIT 1").get();
    if (hkStaff) {
        const roomStr = roomId ? `Room ${roomId}` : 'Room 3 (Container A)';
        const taskId = uuidv4();
        db.prepare(`INSERT INTO Tasks (id, title, category, priority, status, assigned_to, location, due_by, notes)
            VALUES (?, ?, 'Housekeeping', 'High', 'Assigned', ?, ?, datetime('now', '+2 hours'), ?)`)
            .run(taskId, `Clean ${roomStr} after checkout`, hkStaff.id, roomStr, `Auto-generated on demo checkout`);
            
        wa.send(hkStaff.id, templates.checkoutTask(roomStr, 'Guest', '2:00 PM', taskId.substring(0,8).toUpperCase()), 'wa', taskId);
        io.emit('dashboard_updated', {});
        return taskId;
    }
    return null;
}

function fireKitchenOrder() {
     const chef = db.prepare("SELECT id, name FROM Users WHERE role = 'Chef' LIMIT 1").get();
     if (chef) {
         const orderId = 'ORD-' + Math.floor(Math.random() * 1000);
         const id = uuidv4();
         db.prepare(`INSERT INTO Kitchen_Orders (id, guest_name, room_number, items, dietary_notes, status) VALUES (?, ?, ?, ?, ?, 'Received')`)
            .run(id, 'Demo Guest', '105', JSON.stringify(['Club Sandwich', 'Fries', 'Lemonade']), 'No mayo', orderId);
            
         wa.send(chef.id, templates.kitchenOrderNotify('Demo Guest', '105', ['Club Sandwich', 'Fries', 'Lemonade'], 'No mayo', orderId), 'wa', id);
         io.emit('kitchen_order', { id });
     }
}

function fireInventoryAlert(itemName, current, min, unit) {
    const hkStaff = db.prepare("SELECT id, name FROM Users WHERE role = 'Housekeeping Staff' LIMIT 1").get();
    if (hkStaff) {
         const state = wa.getStaffState(hkStaff.id);
         state.inventoryAlertItem = itemName;
         wa.send(hkStaff.id, templates.inventoryAlert(itemName, current, unit, min), 'alert');
    }
}

module.exports = {
    init,
    scheduleJobs,
    fireDailyBriefing,
    firePoolMorningChecklist,
    fireVacuumScheduler,
    firePumpWarning,
    fireDailyReport,
    fireCheckout,
    fireKitchenOrder,
    fireInventoryAlert
};
