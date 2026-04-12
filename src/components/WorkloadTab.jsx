import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { liveQuery } from 'dexie';
import { db } from '../db';
import { tagStyle, parseTagFilter } from '../utils/tags';

const START_HOUR = 7;
const END_HOUR = 23;
const TOTAL_HOURS = END_HOUR - START_HOUR; // 16
const HOUR_HEIGHT = 64; // px per hour
const SNAP_MIN = 15;    // snap to 15-minute slots
const GRID_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;

const HOUR_LABELS = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i);

// ── Helpers ──────────────────────────────────────────────────

function getWeekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=Sun
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}

function getWeekDays(ws) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws);
    d.setDate(d.getDate() + i);
    return d;
  });
}

// Convert pixel y-offset within the grid to a Date on a given day, snapped to SNAP_MIN
function yToDate(y, dayDate) {
  const totalMin = Math.round((y / HOUR_HEIGHT * 60) / SNAP_MIN) * SNAP_MIN;
  const clamped = Math.max(0, Math.min(totalMin, TOTAL_HOURS * 60));
  const d = new Date(dayDate);
  d.setHours(START_HOUR + Math.floor(clamped / 60), clamped % 60, 0, 0);
  return d;
}

// Convert a Date to pixel y-offset within the grid
function dateToY(date) {
  return ((date.getHours() - START_HOUR) + date.getMinutes() / 60) * HOUR_HEIGHT;
}

function fmtHour(h) {
  if (h === 0 || h === 24) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

function fmtTime(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtDuration(ms) {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ── ICS helpers ───────────────────────────────────────────────

function icsDate(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeIcs(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function estimateMs(estimate) {
  if (!estimate) return 3_600_000;
  const { value, unit } = estimate;
  if (unit === 'minutes') return value * 60_000;
  if (unit === 'hours')   return value * 3_600_000;
  if (unit === 'days')    return value * 86_400_000;
  return 3_600_000;
}

function buildIcs(tbs, todosById, calName) {
  const stamp = icsDate(new Date());
  const events = tbs.flatMap(tb => {
    const todo = todosById.get(tb.todoId);
    if (!todo) return [];
    const startMs = new Date(tb.scheduledAt).getTime();
    const endMs   = startMs + (tb.duration != null ? tb.duration * 3_600_000 : estimateMs(todo.estimate));
    const descParts = [
      todo.tags?.length ? `Tags: ${todo.tags.join(', ')}` : '',
      todo.deadline     ? `Deadline: ${new Date(todo.deadline).toLocaleString()}` : '',
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
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Toodles//EN', 'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcs(calName)}`, ...events, 'END:VCALENDAR',
  ].join('\r\n');
}

function downloadFile(content, filename) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────

export default function WorkloadTab() {
  const [todos,      setTodos]      = useState([]);
  const [timeblocks, setTimeblocks] = useState([]);
  const [tagQuery,   setTagQuery]   = useState('');
  const [nameQuery,  setNameQuery]  = useState('');
  const [weekStart,  setWeekStart]  = useState(() => getWeekStart(new Date()));

  // Drag-to-create (managed via refs to avoid stale closures)
  const dragRef    = useRef(null);
  const colRefs    = useRef([]);
  const weekDaysRef = useRef([]);
  const [drag, setDrag] = useState(null); // { colIndex, startY, currentY }

  // New timeblock form
  const [newTb,       setNewTb]       = useState(null); // { startMs, endMs, colIndex }
  const [newTbTodoId, setNewTbTodoId] = useState('');
  const [newTbLabel,  setNewTbLabel]  = useState('');

  // Tooltip
  const [tooltip, setTooltip] = useState(null);

  const scrollBodyRef = useRef(null);

  // ── Data ──────────────────────────────────────────────────

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

  // Scroll to ~8am on mount
  useEffect(() => {
    if (scrollBodyRef.current) {
      scrollBodyRef.current.scrollTop = (8 - START_HOUR) * HOUR_HEIGHT - 4;
    }
  }, []);

  // ── Derived state ─────────────────────────────────────────

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  useEffect(() => { weekDaysRef.current = weekDays; }, [weekDays]);

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart); d.setDate(d.getDate() + 7); return d;
  }, [weekStart]);

  const tagFilterFn = useMemo(() => parseTagFilter(tagQuery), [tagQuery]);
  const todosById   = useMemo(() => new Map(todos.map(t => [t.id, t])), [todos]);

  const filteredTodoIds = useMemo(() => {
    const ids = new Set();
    for (const t of todos) {
      if (tagFilterFn && !tagFilterFn(t)) continue;
      if (nameQuery.trim() && !t.title.toLowerCase().includes(nameQuery.toLowerCase().trim())) continue;
      ids.add(t.id);
    }
    return ids;
  }, [todos, tagFilterFn, nameQuery]);

  const weekTimeblocks = useMemo(() =>
    timeblocks.filter(tb => {
      if (tb.completed) return false;
      if (!filteredTodoIds.has(tb.todoId)) return false;
      const t = new Date(tb.scheduledAt).getTime();
      return t >= weekStart.getTime() && t < weekEnd.getTime();
    }),
  [timeblocks, filteredTodoIds, weekStart, weekEnd]);

  // Group timeblocks by day column index (0 = Mon)
  const tbsByDay = useMemo(() => {
    const map = new Map();
    for (const tb of weekTimeblocks) {
      const tbDate = new Date(tb.scheduledAt);
      const dayIdx = weekDays.findIndex(d => d.toDateString() === tbDate.toDateString());
      if (dayIdx < 0) continue;
      const todo = todosById.get(tb.todoId);
      if (!todo) continue;
      if (!map.has(dayIdx)) map.set(dayIdx, []);
      map.get(dayIdx).push({ tb, todo });
    }
    return map;
  }, [weekTimeblocks, weekDays, todosById]);

  const pendingTodos = useMemo(() =>
    todos.filter(t => !t.completed).sort((a, b) => a.createdAt - b.createdAt),
  [todos]);

  const hasFilters = tagQuery.trim() || nameQuery.trim();

  // ── Navigation ────────────────────────────────────────────

  const prevWeek = () => setWeekStart(ws => { const d = new Date(ws); d.setDate(d.getDate() - 7); return d; });
  const nextWeek = () => setWeekStart(ws => { const d = new Date(ws); d.setDate(d.getDate() + 7); return d; });
  const goToday  = () => setWeekStart(getWeekStart(new Date()));

  // ── Drag to create ────────────────────────────────────────

  const handleColMouseDown = useCallback((e, colIndex) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const colEl = colRefs.current[colIndex];
    if (!colEl) return;
    const rect = colEl.getBoundingClientRect();
    const y = Math.max(0, Math.min(e.clientY - rect.top, GRID_HEIGHT));
    const state = { colIndex, startY: y, currentY: y };
    dragRef.current = state;
    setDrag(state);
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (!dragRef.current) return;
      const { colIndex } = dragRef.current;
      const colEl = colRefs.current[colIndex];
      if (!colEl) return;
      const rect = colEl.getBoundingClientRect();
      const y = Math.max(0, Math.min(e.clientY - rect.top, GRID_HEIGHT));
      const next = { ...dragRef.current, currentY: y };
      dragRef.current = next;
      setDrag({ ...next });
    };

    const onUp = () => {
      if (!dragRef.current) return;
      const { colIndex, startY, currentY } = dragRef.current;
      dragRef.current = null;
      setDrag(null);

      const minY = Math.min(startY, currentY);
      const maxY = Math.max(startY, currentY);
      if (maxY - minY < HOUR_HEIGHT / 4) return; // less than 15 min — ignore

      const day = weekDaysRef.current[colIndex];
      if (!day) return;
      setNewTb({ startMs: yToDate(minY, day).getTime(), endMs: yToDate(maxY, day).getTime(), colIndex });
      setNewTbTodoId('');
      setNewTbLabel('');
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []); // intentionally empty — all mutable state accessed via refs

  // Close form on Escape
  useEffect(() => {
    if (!newTb) return;
    const onKey = (e) => { if (e.key === 'Escape') setNewTb(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newTb]);

  // ── Save new timeblock ────────────────────────────────────

  const saveTb = async () => {
    if (!newTbTodoId || !newTb) return;
    const durationH = (newTb.endMs - newTb.startMs) / 3_600_000;
    await db.timeblocks.add({
      todoId:      Number(newTbTodoId),
      scheduledAt: new Date(newTb.startMs).toISOString(),
      name:        newTbLabel.trim() || null,
      duration:    Math.round(durationH * 4) / 4, // nearest 0.25h
    });
    setNewTb(null);
  };

  // ── Current time indicator ────────────────────────────────

  const now         = new Date();
  const todayColIdx = weekDays.findIndex(d => d.toDateString() === now.toDateString());
  const nowY        = now.getHours() >= START_HOUR && now.getHours() < END_HOUR ? dateToY(now) : null;

  // ── Export ────────────────────────────────────────────────

  const weekLabel = weekDays.length
    ? `${weekStart.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`
    : '';

  const handleExport = () => {
    const ics = buildIcs(weekTimeblocks, todosById, `Toodles — ${weekLabel}`);
    downloadFile(ics, `toodles-week-${weekStart.toISOString().slice(0, 10)}.ics`);
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <>
    <div className="workload-tab">

      {/* Week navigation */}
      <div className="cal-nav">
        <button className="cal-nav-btn" onClick={prevWeek} aria-label="Previous week">‹</button>
        <h2 className="cal-week-title">{weekLabel}</h2>
        <button className="cal-nav-btn" onClick={nextWeek} aria-label="Next week">›</button>
        <button className="cal-today-btn" onClick={goToday}>Today</button>
        <span className="cal-nav-spacer" />
        <button
          className="cal-export-btn"
          onClick={handleExport}
          disabled={weekTimeblocks.length === 0}
          title={weekTimeblocks.length === 0
            ? 'No timeblocks this week to export'
            : `Export ${weekTimeblocks.length} timeblock${weekTimeblocks.length !== 1 ? 's' : ''} as .ics`}
        >
          Export .ics{weekTimeblocks.length > 0 && ` (${weekTimeblocks.length})`}
        </button>
      </div>

      {/* Filters */}
      <div className="cal-filters">
        <div className="filter-input-wrap">
          <span className="filter-icon">⌕</span>
          <input
            type="text" value={nameQuery} onChange={e => setNameQuery(e.target.value)}
            placeholder="Search by name…" className="filter-input"
          />
          {nameQuery && <button className="filter-clear" onClick={() => setNameQuery('')}>×</button>}
        </div>
        <div className="filter-input-wrap">
          <span className="filter-icon">#</span>
          <input
            type="text" value={tagQuery} onChange={e => setTagQuery(e.target.value)}
            placeholder="Filter tags…  e.g. work OR personal -archived" className="filter-input"
          />
          {tagQuery && <button className="filter-clear" onClick={() => setTagQuery('')}>×</button>}
        </div>
      </div>
      {hasFilters && (
        <p className="filter-hint" style={{ marginBottom: 12 }}>
          Showing {filteredTodoIds.size} todo{filteredTodoIds.size !== 1 ? 's' : ''}
        </p>
      )}

      {/* Week grid */}
      <div className="week-view">

        {/* Day header row */}
        <div className="week-header-row">
          <div className="week-gutter" />
          {weekDays.map((d, i) => {
            const isToday = d.toDateString() === now.toDateString();
            return (
              <div key={i} className={`week-day-header${isToday ? ' today' : ''}`}>
                <span className="week-dow">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}
                </span>
                <span className={`week-date-num${isToday ? ' today' : ''}`}>
                  {d.getDate()}
                </span>
              </div>
            );
          })}
        </div>

        {/* Scrollable time body */}
        <div className="week-body" ref={scrollBodyRef}>

          {/* Hour labels */}
          <div className="week-time-col" style={{ height: GRID_HEIGHT }}>
            {HOUR_LABELS.map(h => (
              <div key={h} className="week-hour-label" style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}>
                {fmtHour(h)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div className="week-cols-grid" style={{ height: GRID_HEIGHT }}>
            {weekDays.map((day, colIndex) => {
              const events  = tbsByDay.get(colIndex) ?? [];
              const isToday = day.toDateString() === now.toDateString();

              return (
                <div
                  key={colIndex}
                  className={`week-day-col${isToday ? ' today' : ''}`}
                  style={{ height: GRID_HEIGHT }}
                  ref={el => colRefs.current[colIndex] = el}
                  onMouseDown={e => handleColMouseDown(e, colIndex)}
                >
                  {/* Hour lines */}
                  {HOUR_LABELS.map((h, j) => (
                    <div key={h} className="week-hour-line" style={{ top: j * HOUR_HEIGHT }} />
                  ))}
                  {/* Half-hour dashed lines */}
                  {Array.from({ length: TOTAL_HOURS }, (_, j) => (
                    <div key={j} className="week-half-line" style={{ top: j * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
                  ))}

                  {/* Timeblocks */}
                  {events.map(({ tb, todo }) => {
                    const top = dateToY(new Date(tb.scheduledAt));
                    const durationH = tb.duration ?? (
                      todo.estimate?.unit === 'minutes' ? todo.estimate.value / 60 :
                      todo.estimate?.unit === 'hours'   ? todo.estimate.value :
                      todo.estimate?.unit === 'days'    ? todo.estimate.value * 8 : 1
                    );
                    const height = Math.max(durationH * HOUR_HEIGHT, HOUR_HEIGHT / 4);
                    const firstTag = (todo.tags ?? [])[0];
                    const s = firstTag ? tagStyle(firstTag) : null;
                    return (
                      <Link
                        key={tb.id}
                        to={`/${tb.todoId}`}
                        className="week-event"
                        style={{ top, height, ...(s ? { background: s.bg, color: s.color, borderColor: s.border } : {}) }}
                        onMouseDown={e => e.stopPropagation()}
                        onMouseEnter={e => setTooltip({ tb, todo, rect: e.currentTarget.getBoundingClientRect() })}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        <span className="week-event-title">{tb.name ?? todo.title}</span>
                        {tb.duration != null && (
                          <span className="week-event-duration">{tb.duration}h</span>
                        )}
                      </Link>
                    );
                  })}

                  {/* Drag ghost */}
                  {drag?.colIndex === colIndex && (
                    <div
                      className="week-drag-ghost"
                      style={{
                        top:    Math.min(drag.startY, drag.currentY),
                        height: Math.abs(drag.currentY - drag.startY),
                      }}
                    />
                  )}

                  {/* Current time line */}
                  {todayColIdx === colIndex && nowY !== null && (
                    <div className="week-now-line" style={{ top: nowY }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>

    {/* Create timeblock modal */}
    {newTb && createPortal(
      <div className="tb-create-overlay" onClick={() => setNewTb(null)}>
        <div className="tb-create-modal" onClick={e => e.stopPropagation()}>
          <h3 className="tb-create-heading">New Timeblock</h3>
          <div className="tb-create-time-display">
            {weekDays[newTb.colIndex]?.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
            {' · '}
            {fmtTime(new Date(newTb.startMs))} – {fmtTime(new Date(newTb.endMs))}
            <span className="tb-create-duration-hint"> · {fmtDuration(newTb.endMs - newTb.startMs)}</span>
          </div>
          <div className="tb-create-fields">
            <select
              className="tb-create-select"
              value={newTbTodoId}
              onChange={e => setNewTbTodoId(e.target.value)}
              autoFocus
            >
              <option value="">Select a todo…</option>
              {pendingTodos.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
            <input
              type="text"
              className="tb-create-label-input"
              placeholder="Label (optional)"
              value={newTbLabel}
              onChange={e => setNewTbLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveTb(); }}
            />
          </div>
          <div className="tb-create-actions">
            <button className="btn-primary" onClick={saveTb} disabled={!newTbTodoId}>Add</button>
            <button className="btn-cancel" onClick={() => setNewTb(null)}>Cancel</button>
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* Hover tooltip */}
    {tooltip && createPortal(
      <div
        className="cal-tooltip"
        style={{
          position: 'fixed',
          left: tooltip.rect.left,
          top: tooltip.rect.top < 140
            ? tooltip.rect.bottom + 6
            : tooltip.rect.top - 8,
          transform: tooltip.rect.top < 140 ? 'none' : 'translateY(-100%)',
          zIndex: 1000,
          pointerEvents: 'none',
        }}
      >
        <div className="cal-tooltip-time">
          {fmtTime(new Date(tooltip.tb.scheduledAt))}
          {tooltip.tb.duration != null && (
            <span className="cal-tooltip-duration"> · {tooltip.tb.duration}h</span>
          )}
        </div>
        {tooltip.tb.name && <div className="cal-tooltip-label">{tooltip.tb.name}</div>}
        <div className="cal-tooltip-todo">{tooltip.todo.title}</div>
      </div>,
      document.body
    )}
    </>
  );
}
