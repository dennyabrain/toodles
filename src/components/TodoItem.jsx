import { useState } from 'react';
import { db } from '../db';

const UNIT_SHORT = { minutes: 'm', hours: 'h', days: 'd' };

function formatTimeblock(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today ${timeStr}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + timeStr;
}

function TodoItem({ todo, allTodos, depth = 0 }) {
  const [expanded, setExpanded] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [addingSubtodo, setAddingSubtodo] = useState(false);
  const [subtodoTitle, setSubtodoTitle] = useState('');

  // Local form state — initialized from todo prop
  const [estimateValue, setEstimateValue] = useState(todo.estimate?.value ?? '');
  const [estimateUnit, setEstimateUnit] = useState(todo.estimate?.unit ?? 'hours');
  const [timeblock, setTimeblock] = useState(todo.timeblock ?? '');
  const [deadline, setDeadline] = useState(todo.deadline ?? '');

  const children = allTodos.filter(t => t.parentId === todo.id);

  const toggleComplete = () => {
    db.todos.update(todo.id, { completed: !todo.completed });
  };

  // Estimate: save on blur of the value input
  const handleEstimateBlur = () => {
    const estimate =
      estimateValue === '' ? null : { value: Number(estimateValue), unit: estimateUnit };
    db.todos.update(todo.id, { estimate });
  };

  // Estimate: save immediately when unit changes (value may already be set)
  const handleUnitChange = (unit) => {
    setEstimateUnit(unit);
    if (estimateValue !== '') {
      db.todos.update(todo.id, { estimate: { value: Number(estimateValue), unit } });
    }
  };

  // Timeblock: save immediately on change
  const handleTimeblockChange = (val) => {
    setTimeblock(val);
    db.todos.update(todo.id, { timeblock: val || null });
  };

  // Deadline: save immediately on change
  const handleDeadlineChange = (val) => {
    setDeadline(val);
    db.todos.update(todo.id, { deadline: val || null });
  };

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
      <div className="todo-row">
        {children.length > 0 ? (
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

        {/* Summary badges shown in the row */}
        {todo.estimate && (
          <span className="meta-badge">
            {todo.estimate.value}{UNIT_SHORT[todo.estimate.unit]}
          </span>
        )}
        {todo.timeblock && (
          <span className="meta-badge timeblock">
            {formatTimeblock(todo.timeblock)}
          </span>
        )}
        {todo.deadline && (
          <span className="meta-badge deadline">
            ⚑ {formatTimeblock(todo.deadline)}
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
            <label className="detail-label">Timeblock</label>
            <input
              type="datetime-local"
              value={timeblock}
              onChange={e => handleTimeblockChange(e.target.value)}
              className="timeblock-input"
            />
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
          <button
            type="button"
            className="btn-cancel btn-sm"
            onClick={() => setAddingSubtodo(false)}
          >
            Cancel
          </button>
        </form>
      )}

      {expanded && children.length > 0 && (
        <div className="children">
          {children.map(child => (
            <TodoItem key={child.id} todo={child} allTodos={allTodos} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default TodoItem;
