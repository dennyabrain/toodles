import { useState, useEffect, useMemo } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../db';
import TodoItem from './TodoItem';

// ── Tag filter parser ───────────────────────────────────────
// Syntax:
//   work             → has tag "work"
//   work design      → has "work" AND "design"  (space = AND)
//   work OR personal → has "work" OR "personal"
//   -work            → does NOT have "work"
//   NOT work         → does NOT have "work"
//   work OR personal -archived → (work OR personal) AND NOT archived
function parseTagFilter(query) {
  const raw = query.trim();
  if (!raw) return null;

  const tokens = raw.split(/\s+/);
  const clauses = [];
  let i = 0;

  while (i < tokens.length) {
    const tok = tokens[i];

    if (tok.toUpperCase() === 'NOT') {
      const next = tokens[i + 1];
      if (next) { clauses.push({ type: 'not', tag: next.toLowerCase() }); i += 2; }
      else i++;
      continue;
    }

    if (tok.startsWith('-') && tok.length > 1) {
      clauses.push({ type: 'not', tag: tok.slice(1).toLowerCase() });
      i++;
      continue;
    }

    // Look ahead for OR chain
    const orGroup = [tok.toLowerCase()];
    let j = i + 1;
    while (j < tokens.length && tokens[j].toUpperCase() === 'OR' && tokens[j + 1]) {
      orGroup.push(tokens[j + 1].toLowerCase());
      j += 2;
    }

    if (orGroup.length > 1) {
      clauses.push({ type: 'or', tags: orGroup });
    } else {
      clauses.push({ type: 'and', tag: orGroup[0] });
    }
    i = j;
  }

  return (todo) => {
    const tags = (todo.tags ?? []).map(t => t.toLowerCase());
    return clauses.every(c => {
      if (c.type === 'and') return tags.includes(c.tag);
      if (c.type === 'not') return !tags.includes(c.tag);
      if (c.type === 'or')  return c.tags.some(t => tags.includes(t));
      return true;
    });
  };
}

// Walk up the tree and collect all ancestor IDs for matching todos
function computeVisibleIds(filterFn, allTodos) {
  const byId = new Map(allTodos.map(t => [t.id, t]));
  const visible = new Set();

  for (const todo of allTodos) {
    if (!filterFn(todo)) continue;
    visible.add(todo.id);
    let cur = todo;
    while (cur.parentId) {
      visible.add(cur.parentId);
      cur = byId.get(cur.parentId);
      if (!cur) break;
    }
  }

  return visible;
}

// ── Component ───────────────────────────────────────────────

function TodosTab() {
  const [todos, setTodos] = useState([]);
  const [timeblocks, setTimeblocks] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [filterQuery, setFilterQuery] = useState('');

  useEffect(() => {
    const sub = liveQuery(() => db.todos.orderBy('createdAt').toArray()).subscribe({
      next: setTodos,
      error: console.error,
    });
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    const sub = liveQuery(() => db.timeblocks.orderBy('scheduledAt').toArray()).subscribe({
      next: setTimeblocks,
      error: console.error,
    });
    return () => sub.unsubscribe();
  }, []);

  const addTodo = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    await db.todos.add({
      title: newTitle.trim(),
      parentId: null,
      completed: false,
      createdAt: Date.now(),
    });
    setNewTitle('');
  };

  const filterFn = useMemo(() => parseTagFilter(filterQuery), [filterQuery]);

  const visibleIds = useMemo(
    () => (filterFn ? computeVisibleIds(filterFn, todos) : null),
    [filterFn, todos]
  );

  const topLevelTodos = todos.filter(t => !t.parentId);
  const visibleTopLevel = visibleIds
    ? topLevelTodos.filter(t => visibleIds.has(t.id))
    : topLevelTodos;

  const matchCount = filterFn ? todos.filter(filterFn).length : 0;

  return (
    <div className="todos-tab">
      <form onSubmit={addTodo} className="add-todo-form">
        <input
          type="text"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder="Add a new todo..."
          className="todo-input"
          autoFocus
        />
        <button type="submit" className="btn-primary">Add</button>
      </form>

      {/* Tag filter bar */}
      <div className="filter-bar">
        <div className="filter-input-wrap">
          <span className="filter-icon">⌕</span>
          <input
            type="text"
            value={filterQuery}
            onChange={e => setFilterQuery(e.target.value)}
            placeholder="Filter by tags…  e.g. work OR personal -archived"
            className="filter-input"
          />
          {filterQuery && (
            <button className="filter-clear" onClick={() => setFilterQuery('')} aria-label="Clear filter">
              ×
            </button>
          )}
        </div>
        {filterFn && (
          <p className="filter-hint">
            {matchCount === 0
              ? 'No matching todos'
              : `${matchCount} todo${matchCount === 1 ? '' : 's'} matched`}
            <span className="filter-syntax-hint">
              · space&nbsp;=&nbsp;AND &nbsp;|&nbsp; OR &nbsp;|&nbsp; -tag&nbsp;or&nbsp;NOT&nbsp;tag
            </span>
          </p>
        )}
      </div>

      <div className="todo-list">
        {visibleTopLevel.length === 0 && !filterFn ? (
          <p className="empty-state">No todos yet. Add one above to get started.</p>
        ) : visibleTopLevel.length === 0 ? (
          <p className="empty-state">No todos match this filter.</p>
        ) : (
          visibleTopLevel.map(todo => (
            <TodoItem
              key={todo.id}
              todo={todo}
              allTodos={todos}
              allTimeblocks={timeblocks}
              visibleIds={visibleIds}
              filterFn={filterFn}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default TodosTab;
