import { useState } from 'react';
import { db } from '../db';

function TodoItem({ todo, allTodos, depth = 0 }) {
  const [expanded, setExpanded] = useState(true);
  const [addingSubtodo, setAddingSubtodo] = useState(false);
  const [subtodoTitle, setSubtodoTitle] = useState('');

  const children = allTodos.filter(t => t.parentId === todo.id);

  const toggleComplete = () => {
    db.todos.update(todo.id, { completed: !todo.completed });
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

  const openSubtodoForm = () => {
    setAddingSubtodo(true);
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
        <span className={`todo-title${todo.completed ? ' done' : ''}`}>
          {todo.title}
        </span>
        <button className="add-sub-btn" onClick={openSubtodoForm} title="Add sub-todo">
          +
        </button>
      </div>

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
