import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { liveQuery } from 'dexie';
import { db } from '../db';

function formatDatetime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today · ${timeStr}`;
  if (isTomorrow) return `Tomorrow · ${timeStr}`;
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + timeStr;
}

function HabitItem({ todo, allTimeblocks }) {
  const now = Date.now();

  const activeTbs = allTimeblocks
    .filter(tb => tb.todoId === todo.id && !tb.completed && tb.scheduledAt)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  const nextTb =
    activeTbs.find(tb => new Date(tb.scheduledAt).getTime() >= now) ??
    activeTbs[activeTbs.length - 1]; // most recent past unfinished

  let statusText, statusType;
  const futureTbs = activeTbs.filter(tb => new Date(tb.scheduledAt).getTime() >= now);
  if (futureTbs.length > 0) {
    statusText = formatDatetime(futureTbs[0].scheduledAt);
    statusType = 'scheduled';
  } else if (nextTb) {
    statusText = 'Overdue';
    statusType = 'overdue';
  } else {
    statusText = 'Needs scheduling';
    statusType = 'unscheduled';
  }

  const completeSession = async () => {
    if (!nextTb) return;
    await db.timeblocks.update(nextTb.id, { completed: true });
    await db.timeblocks.add({
      todoId: todo.id,
      scheduledAt: null,
      name: nextTb.name,
      duration: nextTb.duration,
      completed: false,
    });
  };

  return (
    <div className="habit-item">
      <Link to={`/${todo.id}`} className="habit-title">{todo.title}</Link>
      <span className={`habit-status ${statusType}`}>{statusText}</span>
      {nextTb && (
        <button className="habit-done-btn" onClick={completeSession}>
          Done
        </button>
      )}
    </div>
  );
}

export default function HabitsTab() {
  const [habits, setHabits] = useState([]);
  const [timeblocks, setTimeblocks] = useState([]);
  const [newTitle, setNewTitle] = useState('');

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

  const addHabit = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await db.todos.add({
      title: newTitle.trim(),
      type: 'habit',
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
        />
        <button type="submit" className="btn-primary">Add</button>
      </form>

      {activeHabits.length === 0 ? (
        <p className="empty-state">No habits yet. Add one above.</p>
      ) : (
        <div className="habit-list">
          {activeHabits.map(habit => (
            <HabitItem key={habit.id} todo={habit} allTimeblocks={timeblocks} />
          ))}
        </div>
      )}
    </div>
  );
}
