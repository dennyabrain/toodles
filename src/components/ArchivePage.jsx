import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { liveQuery } from 'dexie';
import { db } from '../db';
import TodoItem from './TodoItem';

function isTreeFullyDone(id, todosById, childrenByParent) {
  const t = todosById.get(id);
  if (!t?.completed) return false;
  for (const child of (childrenByParent.get(id) ?? [])) {
    if (!isTreeFullyDone(child.id, todosById, childrenByParent)) return false;
  }
  return true;
}

export default function ArchivePage() {
  const [todos, setTodos] = useState([]);
  const [timeblocks, setTimeblocks] = useState([]);

  useEffect(() => {
    const sub = liveQuery(() => db.todos.orderBy('createdAt').toArray()).subscribe({
      next: setTodos, error: console.error,
    });
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    const sub = liveQuery(() => db.timeblocks.orderBy('scheduledAt').toArray()).subscribe({
      next: setTimeblocks, error: console.error,
    });
    return () => sub.unsubscribe();
  }, []);

  const todosById = useMemo(() => new Map(todos.map(t => [t.id, t])), [todos]);

  const childrenByParent = useMemo(() => {
    const map = new Map();
    for (const t of todos) {
      if (t.parentId != null) {
        if (!map.has(t.parentId)) map.set(t.parentId, []);
        map.get(t.parentId).push(t);
      }
    }
    return map;
  }, [todos]);

  const archivedTodos = useMemo(
    () => todos.filter(t => !t.parentId && isTreeFullyDone(t.id, todosById, childrenByParent)),
    [todos, todosById, childrenByParent]
  );

  const unarchive = (id) => db.todos.update(id, { completed: false });

  return (
    <div className="app">
      <header className="app-header">
        <div className="detail-page-nav">
          <Link to="/" className="back-link">← Toodles</Link>
          <h2 className="archive-page-title">Archive</h2>
        </div>
      </header>
      <main className="app-content">
        {archivedTodos.length === 0 ? (
          <p className="empty-state">No archived todos yet.</p>
        ) : (
          <div className="todo-list">
            {archivedTodos.map(todo => (
              <div key={todo.id} className="archive-entry">
                <TodoItem
                  todo={todo}
                  allTodos={todos}
                  allTimeblocks={timeblocks}
                />
                <button
                  className="unarchive-btn"
                  onClick={() => unarchive(todo.id)}
                >
                  Unarchive
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
