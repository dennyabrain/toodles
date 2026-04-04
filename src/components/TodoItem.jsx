import { useState } from 'react';
import { db } from '../db';

const UNIT_SHORT = { minutes: 'm', hours: 'h', days: 'd' };

// Deterministic color per tag name
const TAG_PALETTE = [
  { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: 'rgba(59,130,246,0.35)' },
  { bg: 'rgba(16,185,129,0.12)', color: '#10b981', border: 'rgba(16,185,129,0.35)' },
  { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.35)' },
  { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444', border: 'rgba(239,68,68,0.35)'  },
  { bg: 'rgba(139,92,246,0.12)', color: '#8b5cf6', border: 'rgba(139,92,246,0.35)' },
  { bg: 'rgba(236,72,153,0.12)', color: '#ec4899', border: 'rgba(236,72,153,0.35)' },
  { bg: 'rgba(20,184,166,0.12)', color: '#14b8a6', border: 'rgba(20,184,166,0.35)' },
  { bg: 'rgba(249,115,22,0.12)', color: '#f97316', border: 'rgba(249,115,22,0.35)' },
];

function tagStyle(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash << 5) - hash + tag.charCodeAt(i);
    hash |= 0;
  }
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}

function formatDatetime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today ${timeStr}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + timeStr;
}

function TodoItem({ todo, allTodos, allTimeblocks, depth = 0, visibleIds = null, filterFn = null }) {
  const [expanded, setExpanded] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [addingSubtodo, setAddingSubtodo] = useState(false);
  const [subtodoTitle, setSubtodoTitle] = useState('');

  // Local form state — initialized from todo prop
  const [estimateValue, setEstimateValue] = useState(todo.estimate?.value ?? '');
  const [estimateUnit, setEstimateUnit] = useState(todo.estimate?.unit ?? 'hours');
  const [deadline, setDeadline] = useState(todo.deadline ?? '');
  const [tagInput, setTagInput] = useState('');

  // Timeblock add form state
  const [addingTimeblock, setAddingTimeblock] = useState(false);
  const [newTimeblock, setNewTimeblock] = useState('');

  // When filtering: always expand, highlight direct matches
  const effectiveExpanded = filterFn ? true : expanded;
  const directMatch = filterFn ? filterFn(todo) : false;

  const children = allTodos.filter(t => t.parentId === todo.id);
  const visibleChildren = visibleIds
    ? children.filter(c => visibleIds.has(c.id))
    : children;

  const myTimeblocks = (allTimeblocks ?? [])
    .filter(tb => tb.todoId === todo.id)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  const now = Date.now();
  const badgeTimeblock =
    myTimeblocks.find(tb => new Date(tb.scheduledAt).getTime() >= now) ??
    myTimeblocks[myTimeblocks.length - 1];

  const tags = todo.tags ?? [];

  // ── Handlers ──────────────────────────────────────────────

  const toggleComplete = () => db.todos.update(todo.id, { completed: !todo.completed });

  const handleEstimateBlur = () => {
    const estimate = estimateValue === ''
      ? null
      : { value: Number(estimateValue), unit: estimateUnit };
    db.todos.update(todo.id, { estimate });
  };

  const handleUnitChange = (unit) => {
    setEstimateUnit(unit);
    if (estimateValue !== '') {
      db.todos.update(todo.id, { estimate: { value: Number(estimateValue), unit } });
    }
  };

  const handleDeadlineChange = (val) => {
    setDeadline(val);
    db.todos.update(todo.id, { deadline: val || null });
  };

  const addTag = (raw) => {
    const tag = raw.toLowerCase().trim().replace(/[^a-z0-9-_]/g, '');
    if (!tag || tags.includes(tag)) return;
    db.todos.update(todo.id, { tags: [...tags, tag] });
  };

  const removeTag = (tag) => {
    db.todos.update(todo.id, { tags: tags.filter(t => t !== tag) });
  };

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
      setTagInput('');
    } else if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      db.todos.update(todo.id, { tags: tags.slice(0, -1) });
    }
  };

  const addTimeblock = async (e) => {
    e.preventDefault();
    if (!newTimeblock) return;
    await db.timeblocks.add({ todoId: todo.id, scheduledAt: newTimeblock });
    setNewTimeblock('');
    setAddingTimeblock(false);
  };

  const deleteTimeblock = (id) => db.timeblocks.delete(id);

  const addSubtodo = async (e) => {
    e.preventDefault();
    if (!subtodoTitle.trim()) return;
    await db.todos.add({
      title: subtodoTitle.trim(),
      parentId: todo.id,
      completed: false,
      createdAt: Date.now(),
    });
    setSubtodoTitle('');
    setAddingSubtodo(false);
    setExpanded(true);
  };

  return (
    <div className="todo-item" style={{ '--depth': depth }}>
      <div className={`todo-row${directMatch ? ' filter-match' : ''}`}>
        {/* Expand / collapse — hidden while filtering (always expanded) */}
        {!filterFn && visibleChildren.length > 0 ? (
          <button
            className="expand-btn"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="expand-spacer" />
        )}

        <input
          type="checkbox"
          checked={todo.completed}
          onChange={toggleComplete}
          className="todo-checkbox"
        />

        <button
          className={`todo-title-btn${todo.completed ? ' done' : ''}${detailOpen ? ' open' : ''}`}
          onClick={() => setDetailOpen(!detailOpen)}
        >
          {todo.title}
        </button>

        {/* Row badges */}
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
        {todo.estimate && (
          <span className="meta-badge">
            {todo.estimate.value}{UNIT_SHORT[todo.estimate.unit]}
          </span>
        )}
        {badgeTimeblock && (
          <span className="meta-badge timeblock">
            {formatDatetime(badgeTimeblock.scheduledAt)}
          </span>
        )}
        {todo.deadline && (
          <span className="meta-badge deadline">
            ⚑ {formatDatetime(todo.deadline)}
          </span>
        )}

        <button
          className="add-sub-btn"
          onClick={() => { setAddingSubtodo(true); setExpanded(true); }}
          title="Add sub-todo"
        >
          +
        </button>
      </div>

      {/* Detail panel */}
      {detailOpen && (
        <div className="todo-detail">
          {/* Tags */}
          <div className="detail-field align-start">
            <label className="detail-label" style={{ paddingTop: 6 }}>Tags</label>
            <div className="tag-input-area">
              {tags.map(tag => {
                const s = tagStyle(tag);
                return (
                  <span
                    key={tag}
                    className="tag-chip"
                    style={{ background: s.bg, color: s.color, borderColor: s.border }}
                  >
                    {tag}
                    <button
                      className="tag-remove"
                      onClick={() => removeTag(tag)}
                      aria-label={`Remove tag ${tag}`}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
              <input
                type="text"
                className="tag-text-input"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={() => { if (tagInput.trim()) { addTag(tagInput); setTagInput(''); } }}
                placeholder={tags.length === 0 ? 'Add tags…' : ''}
              />
            </div>
          </div>

          <hr className="detail-sep" />

          {/* Estimate & Deadline */}
          <div className="detail-field">
            <label className="detail-label">Estimate</label>
            <div className="detail-input-row">
              <input
                type="number"
                min="1"
                value={estimateValue}
                onChange={e => setEstimateValue(e.target.value)}
                onBlur={handleEstimateBlur}
                placeholder="—"
                className="estimate-input"
              />
              <select
                value={estimateUnit}
                onChange={e => handleUnitChange(e.target.value)}
                className="unit-select"
              >
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </div>
          </div>

          <div className="detail-field">
            <label className="detail-label">Deadline</label>
            <input
              type="datetime-local"
              value={deadline}
              onChange={e => handleDeadlineChange(e.target.value)}
              className="timeblock-input"
            />
          </div>

          <hr className="detail-sep" />

          {/* Timeblocks section */}
          <div className="timeblocks-section">
            <div className="timeblocks-header">
              <span className="timeblocks-title">Timeblocks</span>
              {!addingTimeblock && (
                <button className="add-timeblock-btn" onClick={() => setAddingTimeblock(true)}>
                  + Add
                </button>
              )}
            </div>

            {myTimeblocks.length > 0 && (
              <ul className="timeblock-list">
                {myTimeblocks.map(tb => (
                  <li key={tb.id} className="timeblock-entry">
                    <span className="timeblock-date">{formatDatetime(tb.scheduledAt)}</span>
                    <button
                      className="timeblock-delete"
                      onClick={() => deleteTimeblock(tb.id)}
                      aria-label="Remove timeblock"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {addingTimeblock && (
              <form onSubmit={addTimeblock} className="add-timeblock-form">
                <input
                  type="datetime-local"
                  value={newTimeblock}
                  onChange={e => setNewTimeblock(e.target.value)}
                  className="timeblock-input"
                  autoFocus
                  onKeyDown={e => e.key === 'Escape' && setAddingTimeblock(false)}
                />
                <button type="submit" className="btn-primary btn-sm">Add</button>
                <button type="button" className="btn-cancel btn-sm" onClick={() => setAddingTimeblock(false)}>
                  Cancel
                </button>
              </form>
            )}

            {myTimeblocks.length === 0 && !addingTimeblock && (
              <p className="timeblocks-empty">No timeblocks scheduled.</p>
            )}
          </div>
        </div>
      )}

      {addingSubtodo && (
        <form onSubmit={addSubtodo} className="subtodo-form">
          <input
            autoFocus
            type="text"
            value={subtodoTitle}
            onChange={e => setSubtodoTitle(e.target.value)}
            placeholder="Sub-todo title..."
            className="todo-input"
            onKeyDown={e => e.key === 'Escape' && setAddingSubtodo(false)}
          />
          <button type="submit" className="btn-primary btn-sm">Add</button>
          <button type="button" className="btn-cancel btn-sm" onClick={() => setAddingSubtodo(false)}>
            Cancel
          </button>
        </form>
      )}

      {effectiveExpanded && visibleChildren.length > 0 && (
        <div className="children">
          {visibleChildren.map(child => (
            <TodoItem
              key={child.id}
              todo={child}
              allTodos={allTodos}
              allTimeblocks={allTimeblocks}
              depth={depth + 1}
              visibleIds={visibleIds}
              filterFn={filterFn}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default TodoItem;
