import React from 'react';

const GARDEN_TASKS = [
    { day: 'Monday', tasks: ['Lawn mowing — front green', 'Trim hedges along the driveway'] },
    { day: 'Tuesday', tasks: ['Watering — all flower beds', 'Fertilise potted plants'] },
    { day: 'Wednesday', tasks: ['Sweeping pathways & clearing leaves'] },
    { day: 'Thursday', tasks: ['Weeding — rose garden', 'Mulching — east wing'] },
    { day: 'Friday', tasks: ['Pool surrounds cleaning', 'Inspect outdoor furniture'] },
    { day: 'Saturday', tasks: ['Full garden inspection', 'Seasonal planting review'] },
    { day: 'Sunday', tasks: ['Light maintenance only'] },
];

export default function GardeningPage() {
    return (
        <div className="page-content fade-in">
            <div className="section-title">🌿 Gardening & Outdoor Maintenance</div>
            <div className="section-subtitle">Weekly gardening schedule and outdoor task tracking</div>

            <div style={{ background: 'var(--warning-bg)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 20 }}>
                <strong style={{ color: 'var(--warning)' }}>📋 Module Status:</strong> Live scheduling view. Backend integration is Phase 2 — currently showing predefined weekly schedule.
            </div>

            <div className="grid-2">
                {GARDEN_TASKS.map(({ day, tasks }) => (
                    <div key={day} className="card">
                        <div className="card-title" style={{ marginBottom: 10 }}>📅 {day}</div>
                        {tasks.map((t, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                                <span style={{ color: 'var(--success)', fontSize: 16 }}>🌱</span>
                                <span style={{ color: 'var(--text-secondary)' }}>{t}</span>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
