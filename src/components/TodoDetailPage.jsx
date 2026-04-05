import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { liveQuery } from 'dexie';
import { db } from '../db';
import TodoItem from './TodoItem';

export default function TodoDetailPage() {
  const { todoId } = useParams();
  const id = Number(todoId);

  const [todos, setTodos] = useState([]);
  const [timeblocks, setTimeblocks] = useState([]);

  useEffect(() => {
    const sub = liveQuery(() => db.todos.toArray()).subscribe({
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

  const todo = todos.find(t => t.id === id);

  // Build ancestor chain for breadcrumb
  const ancestors = [];
  if (todo) {
    const byId = new Map(todos.map(t => [t.id, t]));
    let cur = byId.get(todo.parentId);
    while (cur) {
      ancestors.unshift(cur);
      cur = byId.get(cur.parentId);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="detail-page-nav">
          <Link to="/" className="back-link">← Toodles</Link>
          {ancestors.length > 0 && (
            <span className="breadcrumb">
              {ancestors.map(a => (
                <span key={a.id}>
                  <Link to={`/${a.id}`} className="breadcrumb-link">{a.title}</Link>
                  <span className="breadcrumb-sep"> / </span>
                </span>
              ))}
            </span>
          )}
        </div>
      </header>

      <main className="app-content">
        {!todo ? (
          <p className="empty-state">Todo not found.</p>
        ) : (
          <div className="detail-page-body">
            <TodoItem
              todo={todo}
              allTodos={todos}
              allTimeblocks={timeblocks}
              defaultDetailOpen={true}
            />
          </div>
        )}
      </main>
    </div>
  );
}
