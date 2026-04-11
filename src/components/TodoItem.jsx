import { useState } from 'react';
import { db } from '../db';
import { tagStyle } from '../utils/tags';

const UNIT_SHORT = { minutes: 'm', hours: 'h', days: 'd' };

function formatDatetime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today ${timeStr}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + timeStr;
}

function TodoItem({ todo, allTimeblocks, filterFn = null, defaultDetailOpen = false }) {
  const [detailOpen, setDetailOpen] = useState(defaultDetailOpen);

  // Local form state — initialized from todo prop
  const [estimateValue, setEstimateValue] = useState(todo.estimate?.value ?? '');
  const [estimateUnit, setEstimateUnit] = useState(todo.estimate?.unit ?? 'hours');
  const [deadline, setDeadline] = useState(todo.deadline ?? '');
  const [tagInput, setTagInput] = useState('');

  // Timeblock add form state
  const [addingTimeblock, setAddingTimeblock] = useState(false);
  const [newTimeblock, setNewTimeblock] = useState('');
  const [newTimeblockName, setNewTimeblockName] = useState('');
  const [newTimeblockDuration, setNewTimeblockDuration] = useState('');

  // Timeblock edit state
  const [editingTbId, setEditingTbId] = useState(null);
  const [editTbName, setEditTbName] = useState('');
  const [editTbScheduledAt, setEditTbScheduledAt] = useState('');
  const [editTbDuration, setEditTbDuration] = useState('');

  const directMatch = filterFn ? filterFn(todo) : false;

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
    await db.timeblocks.add({
      todoId: todo.id,
      scheduledAt: newTimeblock,
      name: newTimeblockName.trim() || null,
      duration: newTimeblockDuration !== '' ? parseFloat(newTimeblockDuration) : null,
    });
    setNewTimeblock('');
    setNewTimeblockName('');
    setNewTimeblockDuration('');
    setAddingTimeblock(false);
  };

  const deleteTimeblock = (id) => db.timeblocks.delete(id);

  const startEditTb = (tb) => {
    setEditingTbId(tb.id);
    setEditTbName(tb.name ?? '');
    setEditTbScheduledAt(tb.scheduledAt ?? '');
    setEditTbDuration(tb.duration != null ? String(tb.duration) : '');
  };

  const saveEditTb = async (id) => {
    await db.timeblocks.update(id, {
      todoId: todo.id,
      name: editTbName.trim() || null,
      scheduledAt: editTbScheduledAt,
      duration: editTbDuration !== '' ? parseFloat(editTbDuration) : null,
    });
    setEditingTbId(null);
  };

  const cancelEditTb = () => setEditingTbId(null);

  const deleteTodo = async () => {
    await db.timeblocks.where('todoId').equals(todo.id).delete();
    await db.todos.delete(todo.id);
  };

  return (
    <div className="todo-item">
      <div className={`todo-row${directMatch ? ' filter-match' : ''}`}>
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
        {todo.deadline && (
          <span className="meta-badge deadline">
            ⚑ {formatDatetime(todo.deadline)}
          </span>
        )}

        <button
          className="delete-todo-btn"
          onClick={deleteTodo}
          title="Delete todo"
        >
          ×
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
                {myTimeblocks.map(tb => editingTbId === tb.id ? (
                  <form
                    key={tb.id}
                    className="timeblock-edit-form"
                    onSubmit={e => { e.preventDefault(); saveEditTb(tb.id); }}
                  >
                    {/* Row 1 — label */}
                    <input
                      type="text"
                      value={editTbName}
                      onChange={e => setEditTbName(e.target.value)}
                      className="timeblock-name-input"
                      placeholder="Label (optional)"
                      autoFocus
                      onKeyDown={e => e.key === 'Escape' && cancelEditTb()}
                    />
                    {/* Row 2 — datetime + duration + actions */}
                    <div className="timeblock-edit-row">
                      <input
                        type="datetime-local"
                        value={editTbScheduledAt}
                        onChange={e => setEditTbScheduledAt(e.target.value)}
                        className="timeblock-input"
                        onKeyDown={e => e.key === 'Escape' && cancelEditTb()}
                      />
                      <input
                        type="number"
                        min="0.25"
                        step="0.25"
                        value={editTbDuration}
                        onChange={e => setEditTbDuration(e.target.value)}
                        className="timeblock-duration-input"
                        placeholder="Duration (h)"
                        onKeyDown={e => e.key === 'Escape' && cancelEditTb()}
                      />
                      <div className="timeblock-edit-actions">
                        <button type="submit" className="btn-primary btn-sm">Save</button>
                        <button type="button" className="btn-cancel btn-sm" onClick={cancelEditTb}>Cancel</button>
                      </div>
                    </div>
                  </form>
                ) : (
                  <li key={tb.id} className="timeblock-entry">
                    {tb.name && <span className="timeblock-name">{tb.name}</span>}
                    <span className="timeblock-date">{formatDatetime(tb.scheduledAt)}</span>
                    {tb.duration != null && <span className="timeblock-duration">{tb.duration}h</span>}
                    <button
                      className="timeblock-edit"
                      onClick={() => startEditTb(tb)}
                      aria-label="Edit timeblock"
                    >
                      ✎
                    </button>
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
                  type="text"
                  value={newTimeblockName}
                  onChange={e => setNewTimeblockName(e.target.value)}
                  className="timeblock-name-input"
                  placeholder="Label (optional)"
                  autoFocus
                  onKeyDown={e => e.key === 'Escape' && setAddingTimeblock(false)}
                />
                <input
                  type="datetime-local"
                  value={newTimeblock}
                  onChange={e => setNewTimeblock(e.target.value)}
                  className="timeblock-input"
                  onKeyDown={e => e.key === 'Escape' && setAddingTimeblock(false)}
                />
                <input
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={newTimeblockDuration}
                  onChange={e => setNewTimeblockDuration(e.target.value)}
                  className="timeblock-duration-input"
                  placeholder="Duration (h)"
                  onKeyDown={e => e.key === 'Escape' && setAddingTimeblock(false)}
                />
                <button type="submit" className="btn-primary btn-sm">Add</button>
                <button type="button" className="btn-cancel btn-sm" onClick={() => { setAddingTimeblock(false); setNewTimeblockName(''); setNewTimeblockDuration(''); }}>
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
    </div>
  );
}

export default TodoItem;
