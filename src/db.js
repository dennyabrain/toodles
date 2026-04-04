import Dexie from 'dexie';

export const db = new Dexie('toodles');

// Fields listed here are indexed (queryable).
// All other fields on stored objects are persisted too.
db.version(1).stores({
  todos: '++id, title, timeblock, estimate, deadline, parentId, completed, createdAt'
});
