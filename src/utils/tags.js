export const TAG_PALETTE = [
  { bg: 'rgba(59,130,246,0.12)',  color: '#3b82f6', border: 'rgba(59,130,246,0.35)'  },
  { bg: 'rgba(16,185,129,0.12)',  color: '#10b981', border: 'rgba(16,185,129,0.35)'  },
  { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b', border: 'rgba(245,158,11,0.35)'  },
  { bg: 'rgba(239,68,68,0.12)',   color: '#ef4444', border: 'rgba(239,68,68,0.35)'   },
  { bg: 'rgba(139,92,246,0.12)',  color: '#8b5cf6', border: 'rgba(139,92,246,0.35)'  },
  { bg: 'rgba(236,72,153,0.12)',  color: '#ec4899', border: 'rgba(236,72,153,0.35)'  },
  { bg: 'rgba(20,184,166,0.12)',  color: '#14b8a6', border: 'rgba(20,184,166,0.35)'  },
  { bg: 'rgba(249,115,22,0.12)',  color: '#f97316', border: 'rgba(249,115,22,0.35)'  },
];

/** Deterministic color for a tag based on its name. */
export function tagStyle(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash << 5) - hash + tag.charCodeAt(i);
    hash |= 0;
  }
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}

/**
 * Parse a tag filter query string into a predicate function.
 *
 * Syntax:
 *   work             → has tag "work"
 *   work design      → has "work" AND "design"   (space = AND)
 *   work OR personal → has "work" OR "personal"
 *   -archived        → does NOT have "archived"
 *   NOT archived     → same as -archived
 *   work OR personal -archived
 *     → (work OR personal) AND NOT archived
 *
 * Returns null when the query is empty (no filtering).
 */
export function parseTagFilter(query) {
  const raw = query.trim();
  if (!raw) return null;

  const tokens = raw.split(/\s+/);
  const clauses = [];
  let i = 0;

  while (i < tokens.length) {
    const tok = tokens[i];

    if (tok.toUpperCase() === 'NOT') {
      const next = tokens[i + 1];
      if (next) { clauses.push({ type: 'not', tag: next.toLowerCase() }); i += 2; }
      else i++;
      continue;
    }

    if (tok.startsWith('-') && tok.length > 1) {
      clauses.push({ type: 'not', tag: tok.slice(1).toLowerCase() });
      i++;
      continue;
    }

    // Look ahead for OR chain: a OR b OR c
    const orGroup = [tok.toLowerCase()];
    let j = i + 1;
    while (j < tokens.length && tokens[j].toUpperCase() === 'OR' && tokens[j + 1]) {
      orGroup.push(tokens[j + 1].toLowerCase());
      j += 2;
    }

    clauses.push(
      orGroup.length > 1
        ? { type: 'or', tags: orGroup }
        : { type: 'and', tag: orGroup[0] }
    );
    i = j;
  }

  return (todo) => {
    const tags = (todo.tags ?? []).map(t => t.toLowerCase());
    return clauses.every(c => {
      if (c.type === 'and') return tags.includes(c.tag);
      if (c.type === 'not') return !tags.includes(c.tag);
      if (c.type === 'or')  return c.tags.some(t => tags.includes(t));
      return true;
    });
  };
}
