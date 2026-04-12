import Dexie from 'dexie';

export const db = new Dexie('toodles');

db.version(1).stores({
  todos: '++id, title, timeblock, estimate, deadline, parentId, completed, createdAt'
});

// v2: timeblocks become their own table (many per todo)
db.version(2).stores({
  todos: '++id, title, estimate, deadline, parentId, completed, createdAt',
  timeblocks: '++id, todoId, scheduledAt'
});

// v3: *tags creates a multi-entry index — each element of the tags array is indexed
db.version(3).stores({
  todos: '++id, title, estimate, deadline, parentId, completed, createdAt, *tags',
  timeblocks: '++id, todoId, scheduledAt'
});

// v4: remove parentId — todos are flat, no nesting. Migrate existing subtodos to top-level.
db.version(4).stores({
  todos: '++id, title, estimate, deadline, completed, createdAt, *tags',
  timeblocks: '++id, todoId, scheduledAt'
}).upgrade(tx => tx.todos.toCollection().modify({ parentId: null }));

// v5: add type to todos ('task' | 'habit' | 'quick'); add completed to timeblocks
db.version(5).stores({
  todos: '++id, title, estimate, deadline, completed, createdAt, *tags, type',
  timeblocks: '++id, todoId, scheduledAt, completed'
});
