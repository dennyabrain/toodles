import { useState, useEffect } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../db';
import TodoItem from './TodoItem';

function TodosTab() {
  const [todos, setTodos] = useState([]);
  const [timeblocks, setTimeblocks] = useState([]);
  const [newTitle, setNewTitle] = useState('');

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

  const topLevelTodos = todos.filter(t => !t.parentId);

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

      <div className="todo-list">
        {topLevelTodos.length === 0 ? (
          <p className="empty-state">No todos yet. Add one above to get started.</p>
        ) : (
          topLevelTodos.map(todo => (
            <TodoItem
              key={todo.id}
              todo={todo}
              allTodos={todos}
              allTimeblocks={timeblocks}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default TodosTab;
