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
