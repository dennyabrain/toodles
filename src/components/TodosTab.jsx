import { useState, useEffect, useMemo } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../db';
import { parseTagFilter } from '../utils/tags';
import TodoItem from './TodoItem';

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
    const sub = liveQuery(() => db.timeblocks.toArray()).subscribe({
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
      completed: false,
      createdAt: Date.now(),
    });
    setNewTitle('');
  };

  const filterFn = useMemo(() => parseTagFilter(filterQuery), [filterQuery]);

  const activeTodos = todos.filter(t => !t.completed);
  const visibleTodos = filterFn ? activeTodos.filter(filterFn) : activeTodos;
  const matchCount = filterFn ? activeTodos.filter(filterFn).length : 0;

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
        {visibleTodos.length === 0 && !filterFn ? (
          <p className="empty-state">No todos yet. Add one above to get started.</p>
        ) : visibleTodos.length === 0 ? (
          <p className="empty-state">No todos match this filter.</p>
        ) : (
          visibleTodos.map(todo => (
            <TodoItem
              key={todo.id}
              todo={todo}
              allTimeblocks={timeblocks}
              filterFn={filterFn}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default TodosTab;
