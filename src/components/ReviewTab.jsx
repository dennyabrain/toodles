import { useState, useEffect, useMemo } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../db';
import { tagStyle } from '../utils/tags';

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function relativeDeadline(iso) {
  const diffMs  = new Date(iso).getTime() - Date.now();
  const diffHrs = Math.round(diffMs / 3_600_000);
  const diffDys = Math.round(diffMs / 86_400_000);
  if (Math.abs(diffHrs) < 24) return rtf.format(diffHrs, 'hour');
  return rtf.format(diffDys, 'day');
}

function fmtDeadline(iso) {
  const d = new Date(iso);
  const isToday = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today ${time}`;
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' ' + time;
}

// Urgency class for upcoming section based on how soon the deadline is
function urgencyClass(iso) {
  const daysAway = (new Date(iso).getTime() - Date.now()) / 86_400_000;
  if (daysAway <= 1) return 'urgent';
  if (daysAway <= 3) return 'soon';
  return '';
}

// ── Review item ──────────────────────────────────────────────

function ReviewItem({ todo, section }) {
  const toggleComplete = () => db.todos.update(todo.id, { completed: !todo.completed });
  const tags = todo.tags ?? [];

  return (
    <div className={`review-item${todo.completed ? ' done' : ''}`}>
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={toggleComplete}
        className="todo-checkbox"
      />
      <span className={`review-title${todo.completed ? ' done' : ''}`}>
        {todo.title}
      </span>

      {tags.length > 0 && (
        <div className="review-tags">
          {tags.map(tag => {
            const s = tagStyle(tag);
            return (
              <span
                key={tag}
                className="tag-chip row-chip"
                style={{ background: s.bg, color: s.color, borderColor: s.border }}
              >
                {tag}
              </span>
            );
          })}
        </div>
      )}

      <span className={`review-deadline ${section === 'overdue' ? 'overdue' : urgencyClass(todo.deadline)}`}>
        ⚑ {fmtDeadline(todo.deadline)}
        <span className="review-relative"> · {relativeDeadline(todo.deadline)}</span>
      </span>
    </div>
  );
}

// ── Section ──────────────────────────────────────────────────

function Section({ title, todos, section, emptyMsg }) {
  return (
    <section className="review-section">
      <h3 className={`review-section-title ${section}`}>
        {title}
        {todos.length > 0 && (
          <span className={`review-count ${section}`}>{todos.length}</span>
        )}
      </h3>
      {todos.length === 0 ? (
        <p className="review-empty">{emptyMsg}</p>
      ) : (
        <div className="review-list">
          {todos.map(todo => (
            <ReviewItem key={todo.id} todo={todo} section={section} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Tab ──────────────────────────────────────────────────────

export default function ReviewTab() {
  const [todos, setTodos] = useState([]);

  useEffect(() => {
    const sub = liveQuery(() => db.todos.toArray()).subscribe({
      next: setTodos,
      error: console.error,
    });
    return () => sub.unsubscribe();
  }, []);

  const { overdue, upcoming } = useMemo(() => {
    const nowMs   = Date.now();
    const cutoff  = nowMs + 7 * 86_400_000;
    const active  = todos.filter(t => t.deadline && !t.completed);

    return {
      overdue: active
        .filter(t => new Date(t.deadline).getTime() < nowMs)
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline)),  // most overdue first
      upcoming: active
        .filter(t => { const dl = new Date(t.deadline).getTime(); return dl >= nowMs && dl <= cutoff; })
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline)),   // soonest first
    };
  }, [todos]);

  return (
    <div className="review-tab">
      <Section
        title="Overdue"
        todos={overdue}
        section="overdue"
        emptyMsg="No overdue todos — great work!"
      />
      <Section
        title="Due in the next 7 days"
        todos={upcoming}
        section="upcoming"
        emptyMsg="Nothing due in the next 7 days."
      />
    </div>
  );
}
