import { useState, useEffect, useMemo } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../db';
import { tagStyle, parseTagFilter } from '../utils/tags';

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_PER_DAY = 3;

// Build 42-cell grid (6 weeks) starting from the Monday on/before the 1st.
function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay(); // 0=Sun … 6=Sat
  const startOffset = startDow === 0 ? 6 : startDow - 1; // steps back to Monday
  const todayStr = new Date().toDateString();

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(year, month, 1 - startOffset + i);
    return {
      date: d,
      dateStr: d.toDateString(),
      day: d.getDate(),
      isCurrentMonth: d.getMonth() === month,
      isToday: d.toDateString() === todayStr,
    };
  });
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ── Component ────────────────────────────────────────────────

export default function WorkloadTab() {
  const [todos, setTodos]         = useState([]);
  const [timeblocks, setTimeblocks] = useState([]);
  const [tagQuery, setTagQuery]   = useState('');
  const [nameQuery, setNameQuery] = useState('');
  const [{ year, month }, setYM]  = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });

  useEffect(() => {
    const s = liveQuery(() => db.todos.toArray()).subscribe({ next: setTodos, error: console.error });
    return () => s.unsubscribe();
  }, []);

  useEffect(() => {
    const s = liveQuery(() => db.timeblocks.orderBy('scheduledAt').toArray()).subscribe({
      next: setTimeblocks, error: console.error,
    });
    return () => s.unsubscribe();
  }, []);

  // Navigation
  const prevMonth = () => setYM(({ year, month }) =>
    month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });
  const nextMonth = () => setYM(({ year, month }) =>
    month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 });
  const goToday   = () => { const n = new Date(); setYM({ year: n.getFullYear(), month: n.getMonth() }); };

  // Filters
  const tagFilterFn = useMemo(() => parseTagFilter(tagQuery), [tagQuery]);

  const todosById = useMemo(() => new Map(todos.map(t => [t.id, t])), [todos]);

  const filteredTodoIds = useMemo(() => {
    const ids = new Set();
    for (const todo of todos) {
      if (tagFilterFn && !tagFilterFn(todo)) continue;
      if (nameQuery.trim() && !todo.title.toLowerCase().includes(nameQuery.toLowerCase().trim())) continue;
      ids.add(todo.id);
    }
    return ids;
  }, [todos, tagFilterFn, nameQuery]);

  // Map dateStr → sorted array of {timeblock + todo}
  const timeblocksMap = useMemo(() => {
    const map = new Map();
    for (const tb of timeblocks) {
      if (!filteredTodoIds.has(tb.todoId)) continue;
      const todo = todosById.get(tb.todoId);
      if (!todo) continue;
      const key = new Date(tb.scheduledAt).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ ...tb, todo });
    }
    for (const arr of map.values())
      arr.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    return map;
  }, [timeblocks, filteredTodoIds, todosById]);

  const calDays    = useMemo(() => getCalendarDays(year, month), [year, month]);
  const monthLabel = new Date(year, month, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
  const hasFilters = tagQuery.trim() || nameQuery.trim();

  return (
    <div className="workload-tab">

      {/* ── Month navigation ── */}
      <div className="cal-nav">
        <button className="cal-nav-btn" onClick={prevMonth} aria-label="Previous month">‹</button>
        <h2 className="cal-month-title">{monthLabel}</h2>
        <button className="cal-nav-btn" onClick={nextMonth} aria-label="Next month">›</button>
        <button className="cal-today-btn" onClick={goToday}>Today</button>
      </div>

      {/* ── Filters ── */}
      <div className="cal-filters">
        <div className="filter-input-wrap">
          <span className="filter-icon">⌕</span>
          <input
            type="text"
            value={nameQuery}
            onChange={e => setNameQuery(e.target.value)}
            placeholder="Search by name…"
            className="filter-input"
          />
          {nameQuery && (
            <button className="filter-clear" onClick={() => setNameQuery('')} aria-label="Clear">×</button>
          )}
        </div>
        <div className="filter-input-wrap">
          <span className="filter-icon">#</span>
          <input
            type="text"
            value={tagQuery}
            onChange={e => setTagQuery(e.target.value)}
            placeholder="Filter tags…  e.g. work OR personal -archived"
            className="filter-input"
          />
          {tagQuery && (
            <button className="filter-clear" onClick={() => setTagQuery('')} aria-label="Clear">×</button>
          )}
        </div>
      </div>
      {hasFilters && (
        <p className="filter-hint" style={{ marginBottom: 12 }}>
          Showing {filteredTodoIds.size} todo{filteredTodoIds.size !== 1 ? 's' : ''}
          {tagQuery && (
            <span className="filter-syntax-hint">
              &nbsp;· space&nbsp;=&nbsp;AND &nbsp;|&nbsp; OR &nbsp;|&nbsp; -tag&nbsp;/&nbsp;NOT&nbsp;tag
            </span>
          )}
        </p>
      )}

      {/* ── Calendar grid ── */}
      <div className="cal-grid">
        {DAY_HEADERS.map(d => (
          <div key={d} className="cal-day-header">{d}</div>
        ))}

        {calDays.map(({ dateStr, day, isCurrentMonth, isToday }) => {
          const events  = timeblocksMap.get(dateStr) ?? [];
          const shown   = events.slice(0, MAX_PER_DAY);
          const overflow = events.length - MAX_PER_DAY;

          return (
            <div
              key={dateStr}
              className={[
                'cal-day',
                !isCurrentMonth && 'other-month',
                isToday         && 'today',
              ].filter(Boolean).join(' ')}
            >
              <span className={`day-num${isToday ? ' today-num' : ''}`}>{day}</span>

              {shown.map(tb => {
                const firstTag = (tb.todo.tags ?? [])[0];
                const s = firstTag ? tagStyle(firstTag) : null;
                return (
                  <div
                    key={tb.id}
                    className="cal-event"
                    style={s ? { background: s.bg, color: s.color, borderColor: s.border } : undefined}
                    title={`${fmtTime(tb.scheduledAt)} — ${tb.todo.title}`}
                  >
                    <span className="cal-event-time">{fmtTime(tb.scheduledAt)}</span>
                    <span className="cal-event-title">{tb.todo.title}</span>
                  </div>
                );
              })}

              {overflow > 0 && (
                <span className="cal-more">+{overflow} more</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
