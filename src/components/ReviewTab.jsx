import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
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

// ── Upcoming timeblock item ───────────────────────────────────

function UpcomingTbItem({ tb, todo }) {
  const tags = todo?.tags ?? [];
  const time = new Date(tb.scheduledAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="review-item">
      <span className="upcoming-tb-time">{time}</span>
      {tb.name && <span className="upcoming-tb-label">{tb.name}</span>}
      <span className="review-title">{todo?.title ?? '(deleted)'}</span>
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
    </div>
  );
}

function dayLabel(d) {
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── Unscheduled timeblock item ────────────────────────────────

function UnscheduledTbItem({ tb, todo }) {
  const tags = todo?.tags ?? [];

  return (
    <div className="review-item">
      {tb.name && <span className="upcoming-tb-label">{tb.name}</span>}
      <span className="review-title">{todo?.title ?? '(deleted)'}</span>
      {tb.duration != null && <span className="timeblock-duration">{tb.duration}h</span>}
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
      <Link to={`/${todo?.id}`} className="assign-link">Schedule →</Link>
    </div>
  );
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
  const [timeblocks, setTimeblocks] = useState([]);

  useEffect(() => {
    const sub = liveQuery(() => db.todos.toArray()).subscribe({
      next: setTodos,
      error: console.error,
    });
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    const sub = liveQuery(() => db.timeblocks.toArray()).subscribe({
      next: setTimeblocks,
      error: console.error,
    });
    return () => sub.unsubscribe();
  }, []);

  const { overdue, upcoming, upcomingTbs, todosById, unscheduledTbs } = useMemo(() => {
    const nowMs  = Date.now();
    const cutoff = nowMs + 7 * 86_400_000;
    const active = todos.filter(t => t.deadline && !t.completed);
    const byId   = Object.fromEntries(todos.map(t => [t.id, t]));

    return {
      overdue: active
        .filter(t => new Date(t.deadline).getTime() < nowMs)
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline)),
      upcoming: active
        .filter(t => { const dl = new Date(t.deadline).getTime(); return dl >= nowMs && dl <= cutoff; })
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline)),
      upcomingTbs: timeblocks
        .filter(tb => tb.scheduledAt && new Date(tb.scheduledAt).getTime() >= nowMs)
        .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)),
      todosById: byId,
      unscheduledTbs: timeblocks
        .filter(tb => !tb.scheduledAt)
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
    };
  }, [todos, timeblocks]);

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
      <section className="review-section">
        <h3 className="review-section-title timeblocks">
          Upcoming Timeblocks
          {upcomingTbs.length > 0 && (
            <span className="review-count timeblocks">{upcomingTbs.length}</span>
          )}
        </h3>
        {upcomingTbs.length === 0 ? (
          <p className="review-empty">No upcoming timeblocks scheduled.</p>
        ) : (
          <div className="upcoming-tb-groups">
            {Object.entries(
              upcomingTbs.reduce((acc, tb) => {
                const key = new Date(tb.scheduledAt).toDateString();
                (acc[key] ??= []).push(tb);
                return acc;
              }, {})
            ).map(([key, tbs]) => (
              <div key={key} className="upcoming-tb-day">
                <div className="upcoming-tb-day-label">{dayLabel(new Date(tbs[0].scheduledAt))}</div>
                <div className="review-list">
                  {tbs.map(tb => (
                    <UpcomingTbItem key={tb.id} tb={tb} todo={todosById[tb.todoId]} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="review-section">
        <h3 className="review-section-title assign">
          Schedule Timeblocks
          {unscheduledTbs.length > 0 && (
            <span className="review-count assign">{unscheduledTbs.length}</span>
          )}
        </h3>
        {unscheduledTbs.length === 0 ? (
          <p className="review-empty">All timeblocks are scheduled!</p>
        ) : (
          <div className="review-list">
            {unscheduledTbs.map(tb => (
              <UnscheduledTbItem key={tb.id} tb={tb} todo={todosById[tb.todoId]} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
