import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { liveQuery } from 'dexie';
import { db } from '../db';

// Generate last N days as YYYY-MM-DD strings, oldest first
function lastNDays(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatScheduled(iso) {
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString())       return `Today · ${timeStr}`;
  if (d.toDateString() === tomorrow.toDateString())  return `Tomorrow · ${timeStr}`;
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + timeStr;
}

const STREAK_DAYS = 14;
const DAYS = lastNDays(STREAK_DAYS); // stable reference recomputed per render is fine at this scale

// ── HabitItem ─────────────────────────────────────────────

function HabitItem({ todo, allTimeblocks, allCheckins }) {
  const now    = Date.now();
  const today  = todayStr();

  // Scheduled future sessions for this habit
  const futureTbs = allTimeblocks
    .filter(tb => tb.todoId === todo.id && tb.scheduledAt && new Date(tb.scheduledAt).getTime() >= now)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  const nextTb = futureTbs[0] ?? null;

  // Check-in state
  const myCheckins    = allCheckins.filter(c => c.habitId === todo.id);
  const checkinDates  = new Set(myCheckins.map(c => c.date));
  const doneToday     = checkinDates.has(today);

  // Status label
  let statusText, statusType;
  if (doneToday) {
    statusText = '✓ Done today';
    statusType = 'done-today';
  } else if (nextTb) {
    statusText = formatScheduled(nextTb.scheduledAt);
    statusType = 'scheduled';
  } else {
    statusText = 'Needs scheduling';
    statusType = 'unscheduled';
  }

  // Unified action: log check-in + handle scheduled timeblock
  const checkIn = async () => {
    await db.checkins.add({ habitId: todo.id, date: today });

    if (nextTb) {
      // Delete the completed session and create a fresh unscheduled placeholder
      await db.timeblocks.delete(nextTb.id);
      await db.timeblocks.add({
        todoId:      todo.id,
        scheduledAt: null,
        name:        nextTb.name,
        duration:    nextTb.duration,
        completed:   false,
      });
    }
  };

  return (
    <div className="habit-item">
      <div className="habit-item-main">
        <Link to={`/${todo.id}`} className="habit-title">{todo.title}</Link>
        <span className={`habit-status ${statusType}`}>{statusText}</span>
      </div>

      <div className="habit-item-footer">
        {/* Streak strip */}
        <div className="habit-streak" aria-label="14-day streak">
          {DAYS.map(date => (
            <span
              key={date}
              className={[
                'streak-dot',
                checkinDates.has(date) ? 'filled' : '',
                date === today        ? 'today'  : '',
              ].filter(Boolean).join(' ')}
              title={date}
            />
          ))}
        </div>

        <button
          className={`habit-checkin-btn${doneToday ? ' done' : ''}`}
          onClick={checkIn}
          disabled={doneToday}
        >
          {doneToday ? '✓ Done' : nextTb ? 'Done' : 'Check in'}
        </button>
      </div>
    </div>
  );
}

// ── Tab ───────────────────────────────────────────────────

export default function HabitsTab() {
  const [habits,     setHabits]     = useState([]);
  const [timeblocks, setTimeblocks] = useState([]);
  const [checkins,   setCheckins]   = useState([]);
  const [newTitle,   setNewTitle]   = useState('');

  useEffect(() => {
    const sub = liveQuery(() =>
      db.todos.where('type').equals('habit').toArray()
    ).subscribe({ next: setHabits, error: console.error });
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    const sub = liveQuery(() => db.timeblocks.toArray()).subscribe({
      next: setTimeblocks, error: console.error,
    });
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    const sub = liveQuery(() => db.checkins.toArray()).subscribe({
      next: setCheckins, error: console.error,
    });
    return () => sub.unsubscribe();
  }, []);

  const addHabit = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await db.todos.add({
      title:     newTitle.trim(),
      type:      'habit',
      completed: false,
      createdAt: Date.now(),
    });
    setNewTitle('');
  };

  const activeHabits = habits.filter(h => !h.completed);

  return (
    <div className="habits-tab">
      <form onSubmit={addHabit} className="add-todo-form">
        <input
          type="text"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder="Add a new habit..."
          className="todo-input"
          autoFocus
        />
        <button type="submit" className="btn-primary">Add</button>
      </form>

      {activeHabits.length === 0 ? (
        <p className="empty-state">No habits yet. Add one above.</p>
      ) : (
        <div className="habit-list">
          {activeHabits.map(habit => (
            <HabitItem
              key={habit.id}
              todo={habit}
              allTimeblocks={timeblocks}
              allCheckins={checkins}
            />
          ))}
        </div>
      )}
    </div>
  );
}
