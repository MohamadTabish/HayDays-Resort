// ─── messageTemplates.js ─────────────────────────────────────────────────────
// All 17 WhatsApp notification templates in one file.
// Each function returns a formatted string ready for wa.send().
// When real WA API is approved, these stay identical — only the transport changes.

const templates = {

    // 1. Daily briefing — all staff
    dailyBriefing(staffName, taskList) {
        const items = taskList.map((t, i) => `${i + 1}. ${t.title} (${t.priority})`).join('\n');
        return `☀️ Good Morning, ${staffName}!\n\nYour tasks for today:\n${items}\n\nHave a great day at Haydays Resort!`;
    },

    // 2. Pool morning checklist
    poolMorningChecklist() {
        return `Good morning!\n\nToday's pool tasks:\n1. Strainer check + Pump start (now)\n2. Morning readings: pH CL TEMP (7:30 AM)\n3. Mid-day strainer check (1:00 PM)\n4. Afternoon readings (1:30 PM)\n5. Pump off + Evening readings (6:00 PM)\n\nReply ISSUE at any time if you find a problem.`;
    },

    // 3. Strainer check prompt
    strainerCheckPrompt() {
        return `STEP 1 of 2 — Strainer check\n\nBefore starting the pump, clean and check the strainer basket.\n\nReply with strainer condition:\n1 — Clean and clear\n2 — Partially blocked (cleaned)\n3 — Blocked / damaged — needs attention`;
    },

    // 4. Strainer result confirmation
    strainerResult(condition) {
        return `Strainer condition logged: ${condition}.\n\nYou may now start the pump.\nReply START when pump is switched on.`;
    },

    // 5. Pump start confirmation
    pumpStartConfirm(time) {
        return `Pump ON logged at ${time}.\n\nRuntime is being tracked.\nReply DONE when pump is switched off.`;
    },

    // 6. Pump stop confirmation
    pumpStopConfirm(time, hours, mins, metMinimum) {
        return `Pump OFF logged at ${time}.\n\nRuntime today: ${hours} hrs ${mins} mins.\n${metMinimum ? 'Minimum 3 hours MET.' : 'Below 3-hour minimum — may need to restart later.'}`;
    },

    // 7. Pool reading receipt (OK)
    poolReadingReceipt(ph, cl, temp) {
        return `Readings received:\npH ${ph.toFixed(1)} — OK\nChlorine ${cl.toFixed(1)}ppm — OK\nTemperature ${temp.toFixed(0)}°C — OK\n\nAll within safe range. Thank you.`;
    },

    // 8. Pool reading breach alert
    poolReadingBreach(reason) {
        return `READING BREACH — ${reason}\n\nA corrective task has been created.\nReply START when you begin treatment.\nReply DONE when corrective action complete.`;
    },

    // 9. Housekeeping morning briefing
    housekeepingBriefing(staffName, taskList) {
        const items = taskList.map((t, i) => `${i + 1}. ${t.title} — ${t.location || 'Resort'}`).join('\n');
        return `☀️ Good Morning, ${staffName}!\n\nHousekeeping tasks for today:\n${items}\n\nReply DONE followed by task number when complete (e.g. DONE 2).\nReply HELP if you need assistance.`;
    },

    // 10. Checkout housekeeping task
    checkoutTask(roomNumber, guestName, checkInTime, taskId) {
        return `ROOM VACATED — Immediate task\n\nRoom ${roomNumber} has been checked out.\n\nPlease clean and prepare for next guest.\n${checkInTime ? `Check-in at ${checkInTime} today.` : 'No upcoming check-in.'}\nMinibar must be restocked.\n\nReply START when you begin.\nReply DONE when complete.\nTask ID: ${taskId}`;
    },

    // 11. Kitchen order notification
    kitchenOrderNotify(guestName, roomNumber, items, dietaryNotes, orderId) {
        const itemList = items.map((it, i) => `${i + 1}. ${it}`).join('\n');
        return `🍽️ NEW ORDER — ${orderId}\n\nGuest: ${guestName} (Room ${roomNumber})\n\nItems:\n${itemList}\n${dietaryNotes ? `\nDietary notes: ${dietaryNotes}` : ''}\n\nReply START when you begin preparing.\nReply DONE when order is ready for service.`;
    },

    // 12. Kitchen status update
    kitchenStatusUpdate(orderId, status) {
        return `Order ${orderId} status updated: ${status}.\n\nThank you.`;
    },

    // 13. Inventory alert
    inventoryAlert(itemName, currentStock, unit, minThreshold) {
        return `⚠️ Low Stock Alert\n\n${itemName}: ${currentStock} ${unit}\nMinimum required: ${minThreshold} ${unit}\n\nReply ORDER to submit a purchase request.\nReply OK to acknowledge (no action needed).`;
    },

    // 14. Task assignment notification
    taskAssigned(staffName, title, priority, dueBy, location, notes) {
        return `Haydays Resort — Task Notification\n\nHello ${staffName},\n\nYou have been assigned a new task:\nTask: ${title}\nPriority: ${priority}\nDue by: ${dueBy || 'ASAP'}\nLocation: ${location || 'Resort'}\nNotes: ${notes || 'Please complete promptly.'}\n\nReply 1 to Confirm     Reply 2 if you need help`;
    },

    // 15. Escalation reminder
    escalationReminder(taskTitle, taskId) {
        return `REMINDER — Task ${taskId || ''} not yet acknowledged.\n\nTask: "${taskTitle}"\n\nPlease reply START if you have begun, or HELP if you need assistance.`;
    },

    // 16. Escalation reassignment
    escalationReassign(taskTitle, fromStaff, dueBy, taskId) {
        return `TASK REASSIGNED — ${taskId || ''}\n\n${taskTitle} (transferred from ${fromStaff})\nDue by: ${dueBy || 'ASAP'}\n\nReply START to begin.`;
    },

    // 17. Daily report
    dailyReport(date, summary) {
        return `📊 Daily Summary Report — ${date}\n\n${summary || 'Report has been generated. Check the Reports section for full details.'}`;
    },

    // Utility: Strainer gate block message
    strainerGateBlock() {
        return `Cannot start pump. Strainer check not completed.\n\nPlease check and clean the strainer first, then reply CHECK or 1/2/3 with condition.`;
    },

    // Utility: Help acknowledged
    helpAcknowledged() {
        return `Help request received.\n\nManager has been alerted. Please wait — someone will assist shortly.`;
    },

    // Utility: Issue escalated
    issueEscalated() {
        return `Issue escalated.\n\nA new maintenance ticket has been raised for manager review.\nPlease wait for further instructions.`;
    },

    // Utility: Delay acknowledged
    delayAcknowledged() {
        return `Delay noted. Deadline extended by 30 minutes.\n\nManager has been informed of the updated ETA.`;
    },

    // Utility: Task started
    taskStarted(taskTitle, time) {
        return `${taskTitle} started at ${time}.\n\nTimer running.\nReply DONE when complete.`;
    },

    // Utility: Task completed
    taskCompleted(taskTitle, time) {
        return `${taskTitle} logged as complete.\n\nThank you. Manager has been notified for inspection.`;
    },

    // Utility: Pool readings logged (generic)
    poolReadingsLogged(time) {
        return `Readings logged — thank you.\n\nAll values within safe range.\nNext readings due at 1:30 PM.`;
    },

    // Utility: Mid-day strainer
    midDayStrainerCheck(time) {
        return `Mid-day strainer check logged at ${time}.\n\nAll clear — thank you.`;
    },

    // Utility: Inventory order confirmed
    inventoryOrderConfirmed(itemName) {
        return `Purchase request submitted for ${itemName}.\n\nManager has been notified. Thank you.`;
    },

    // Utility: Inventory OK acknowledged
    inventoryOkAcknowledged(itemName) {
        return `Acknowledged. No purchase action for ${itemName} at this time.`;
    },

    // Utility: Pool breach manager alert
    poolBreachManagerAlert(reason) {
        return `POOL ALERT — ${reason}\nPool staff has been notified.\nTask auto-created. No action needed unless unresolved in 30 minutes.`;
    },

    // Utility: Pump runtime warning
    pumpRuntimeWarning(runtimeHours) {
        return `⚠️ Pool Pump Warning: Runtime only ${runtimeHours} hours today. Minimum 3 hours required. Please start the pump immediately.`;
    },

    // Utility: Vacuum due reminder
    vacuumDueReminder(staffName) {
        return `Pool bottom vacuuming is due today.\n\nLast vacuum was 2 days ago.\nEnsure pump is ON during vacuuming.\n\nReply START when you begin.\nReply DONE when complete.`;
    }
};

module.exports = templates;
