import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { liveQuery } from 'dexie';
import { db } from '../db';
import TodoItem from './TodoItem';

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

  const archivedTodos = useMemo(() => todos.filter(t => t.completed), [todos]);

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
