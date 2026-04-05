import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { liveQuery } from 'dexie';
import { db } from '../db';
import { tagStyle, parseTagFilter } from '../utils/tags';

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_PER_DAY = 3;

// ── Calendar helpers ─────────────────────────────────────────

function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay();
  const startOffset = startDow === 0 ? 6 : startDow - 1;
  const todayStr = new Date().toDateString();

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(year, month, 1 - startOffset + i);
    return {
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

// ── ICS helpers ───────────────────────────────────────────────

// "2026-04-04T14:30" or any ISO string → "20260404T103000Z" (UTC)
function icsDate(iso) {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')    // remove dashes and colons
    .replace(/\.\d{3}/, ''); // remove milliseconds (keep trailing Z)
}

function escapeIcs(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// Returns duration in ms from a todo's estimate, defaulting to 1 hour.
function estimateMs(estimate) {
  if (!estimate) return 3_600_000;
  const { value, unit } = estimate;
  if (unit === 'minutes') return value * 60_000;
  if (unit === 'hours')   return value * 3_600_000;
  if (unit === 'days')    return value * 86_400_000;
  return 3_600_000;
}

function buildIcs(monthTimeblocks, todosById, calName) {
  const stamp = icsDate(new Date());

  const events = monthTimeblocks.flatMap(tb => {
    const todo = todosById.get(tb.todoId);
    if (!todo) return [];

    const startMs = new Date(tb.scheduledAt).getTime();
    const endMs   = startMs + (tb.duration != null ? tb.duration * 3_600_000 : estimateMs(todo.estimate));

    const descParts = [
      todo.tags?.length  ? `Tags: ${todo.tags.join(', ')}` : '',
      todo.deadline      ? `Deadline: ${new Date(todo.deadline).toLocaleString()}` : '',
    ].filter(Boolean);

    return [
      'BEGIN:VEVENT',
      `UID:toodles-${tb.id}@toodles`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(startMs)}`,
      `DTEND:${icsDate(endMs)}`,
      `SUMMARY:${escapeIcs(todo.title)}`,
      ...(descParts.length ? [`DESCRIPTION:${escapeIcs(descParts.join('\n'))}`] : []),
      'END:VEVENT',
    ].join('\r\n');
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Toodles//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcs(calName)}`,
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

function downloadFile(content, filename) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────

export default function WorkloadTab() {
  const [todos,      setTodos]      = useState([]);
  const [timeblocks, setTimeblocks] = useState([]);
  const [tagQuery,   setTagQuery]   = useState('');
  const [nameQuery,  setNameQuery]  = useState('');
  const [{ year, month }, setYM]    = useState(() => {
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

  // Timeblocks for the current month that pass the filter (used for calendar + export)
  const monthTimeblocks = useMemo(() => {
    const first = new Date(year, month, 1).getTime();
    const last  = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
    return timeblocks.filter(tb => {
      if (!filteredTodoIds.has(tb.todoId)) return false;
      const t = new Date(tb.scheduledAt).getTime();
      return t >= first && t <= last;
    });
  }, [timeblocks, filteredTodoIds, year, month]);

  // Map dateStr → sorted array of {timeblock + todo} for calendar rendering
  const timeblocksMap = useMemo(() => {
    const map = new Map();
    for (const tb of monthTimeblocks) {
      const todo = todosById.get(tb.todoId);
      if (!todo) continue;
      const key = new Date(tb.scheduledAt).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ ...tb, todo });
    }
    for (const arr of map.values())
      arr.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    return map;
  }, [monthTimeblocks, todosById]);

  const calDays    = useMemo(() => getCalendarDays(year, month), [year, month]);
  const monthLabel = new Date(year, month, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
  const hasFilters = tagQuery.trim() || nameQuery.trim();

  // Export
  const handleExport = () => {
    const ics      = buildIcs(monthTimeblocks, todosById, `Toodles — ${monthLabel}`);
    const filename = `toodles-${year}-${String(month + 1).padStart(2, '0')}.ics`;
    downloadFile(ics, filename);
  };

  return (
    <div className="workload-tab">

      {/* ── Month navigation ── */}
      <div className="cal-nav">
        <button className="cal-nav-btn" onClick={prevMonth} aria-label="Previous month">‹</button>
        <h2 className="cal-month-title">{monthLabel}</h2>
        <button className="cal-nav-btn" onClick={nextMonth} aria-label="Next month">›</button>
        <button className="cal-today-btn" onClick={goToday}>Today</button>
        <span className="cal-nav-spacer" />
        <button
          className="cal-export-btn"
          onClick={handleExport}
          disabled={monthTimeblocks.length === 0}
          title={monthTimeblocks.length === 0
            ? 'No timeblocks in this month to export'
            : `Export ${monthTimeblocks.length} timeblock${monthTimeblocks.length !== 1 ? 's' : ''} as .ics`}
        >
          Export .ics{monthTimeblocks.length > 0 && ` (${monthTimeblocks.length})`}
        </button>
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
          const events   = timeblocksMap.get(dateStr) ?? [];
          const shown    = events.slice(0, MAX_PER_DAY);
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
                  <Link
                    key={tb.id}
                    to={`/${tb.todoId}`}
                    className="cal-event"
                    style={s ? { background: s.bg, color: s.color, borderColor: s.border } : undefined}
                    title={`${fmtTime(tb.scheduledAt)} — ${tb.todo.title}`}
                  >
                    <span className="cal-event-time">{fmtTime(tb.scheduledAt)}</span>
                    <span className="cal-event-title">{tb.todo.title}</span>
                  </Link>
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
