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

  return (
    <div className="app">
      <header className="app-header">
        <div className="detail-page-nav">
          <Link to="/" className="back-link">← Toodles</Link>
        </div>
      </header>

      <main className="app-content">
        {!todo ? (
          <p className="empty-state">Todo not found.</p>
        ) : (
          <div className="detail-page-body">
            <TodoItem
              todo={todo}
              allTimeblocks={timeblocks}
              defaultDetailOpen={true}
            />
          </div>
        )}
      </main>
    </div>
  );
}
