/**
 * Tests for times_tables.html pure logic functions.
 *
 * Functions under test (copied verbatim from the source file):
 *   - pickQuestion(tables, prev, rng) — random question from the chosen tables
 *   - isComplete(typed, answer)       — auto-submit rule
 *   - bestKey(tables)                 — personal-best storage key
 *   - accuracy(correct, wrong)        — percentage, null before any answer
 *   - missKey(q)                      — de-dupes 7×8 / 8×7 in the practise list
 *   - scoreMessage(correct)           — end-of-round tier message
 *   - complexity(a, b)                — 1–10 difficulty of a fact
 *   - describeTables(tables)          — "2–5, 8" label for the results page
 *
 * Why these matter:
 *   pickQuestion() decides what a child is asked: a question from a table they did
 *   NOT select, or the same fact twice in a row, makes the game feel broken.
 *   isComplete() drives auto-submit — one digit too eager and "5" is marked wrong
 *   for 56 before the second digit is typed. bestKey() must ignore selection order
 *   or the same set of tables would get several different personal bests.
 */

// ─── Source functions (verbatim from times_tables.html) ──────────────────────

const MAX_MULTIPLIER = 12;

function pickQuestion(tables, prev, rng) {
  rng = rng || Math.random;
  for (let tries = 0; tries < 50; tries++) {
    const t = tables[Math.floor(rng() * tables.length)];
    const m = 1 + Math.floor(rng() * MAX_MULTIPLIER);
    const flip = rng() < 0.5;
    const q = { a: flip ? m : t, b: flip ? t : m, answer: t * m };
    if (!prev || missKey(q) !== missKey(prev)) return q;
  }
  return { a: tables[0], b: 1, answer: tables[0] };
}

function isComplete(typed, answer) {
  return typed.length >= String(answer).length;
}

function bestKey(tables) {
  return [...tables].sort((x, y) => x - y).join('-');
}

function accuracy(correct, wrong) {
  const total = correct + wrong;
  return total === 0 ? null : Math.round(100 * correct / total);
}

function missKey(q) {
  return Math.min(q.a, q.b) + 'x' + Math.max(q.a, q.b);
}

function scoreMessage(correct) {
  if (correct === 0) return "Not a single one? Tables tamed one at a time — go again!";
  if (correct < 8)   return "A warm-up round. Even dragons start small.";
  if (correct < 15)  return "Getting there — the hoard is growing!";
  if (correct < 22)  return "Fast fingers! Dragon-level recall.";
  if (correct < 30)  return "Blistering pace. The village is impressed.";
  return "Legendary. Are you secretly a calculator?";
}

function complexity(a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  if (lo === 1) return 1;
  if (lo === 10 || hi === 10) return 2;
  if (lo === 2) return 2;
  if (lo === 5 || hi === 5) return 3;
  if (lo === 11 || hi === 11) return lo >= 11 ? 4 : 3;
  return Math.min(10, Math.max(2, Math.round(lo * hi / 12)));
}

function describeTables(tables) {
  const t = [...new Set(tables)].sort((x, y) => x - y);
  if (t.length === 12) return 'All (1–12)';
  const parts = [];
  for (let i = 0; i < t.length;) {
    let j = i;
    while (j + 1 < t.length && t[j + 1] === t[j] + 1) j++;
    if (j - i >= 2) parts.push(t[i] + '–' + t[j]);
    else for (let k = i; k <= j; k++) parts.push(String(t[k]));
    i = j + 1;
  }
  return parts.join(', ');
}

// ─── pickQuestion ────────────────────────────────────────────────────────────

describe('pickQuestion — only asks the selected tables', () => {
  it('every question has the selected table as one operand', () => {
    const tables = [3, 7];
    let prev = null;
    for (let i = 0; i < 2000; i++) {
      const q = pickQuestion(tables, prev);
      expect(tables.includes(q.a) || tables.includes(q.b)).toBeTrue();
      prev = q;
    }
  });

  it('the other operand is always 1 to 12', () => {
    for (let i = 0; i < 2000; i++) {
      const q = pickQuestion([7], null);
      const other = q.a === 7 ? q.b : q.a;
      expect(other >= 1 && other <= 12).toBeTrue();
    }
  });

  it('answer always equals a × b', () => {
    for (let i = 0; i < 2000; i++) {
      const q = pickQuestion([2, 5, 9, 12], null);
      expect(q.answer).toBe(q.a * q.b);
    }
  });

  it('a single selected table still works (and covers all 12 multipliers)', () => {
    const seen = new Set();
    let prev = null;
    for (let i = 0; i < 3000; i++) {
      const q = pickQuestion([6], prev);
      seen.add(q.a === 6 ? q.b : q.a);
      prev = q;
    }
    expect(seen.size).toBe(12);
  });

  it('operand order is shuffled — both 7 × 8 and 8 × 7 appear', () => {
    let sawFirst = false, sawSecond = false;
    for (let i = 0; i < 2000; i++) {
      const q = pickQuestion([7], null);
      if (q.a === 7 && q.b === 8) sawFirst = true;
      if (q.a === 8 && q.b === 7) sawSecond = true;
    }
    expect(sawFirst && sawSecond).toBeTrue();
  });
});

describe('pickQuestion — never repeats the previous fact', () => {
  it('never returns the same pair twice in a row, in either order', () => {
    let prev = null;
    for (let i = 0; i < 5000; i++) {
      const q = pickQuestion([1, 2], prev);
      if (prev) expect(missKey(q) === missKey(prev)).toBeFalse();
      prev = q;
    }
  });

  it('an 8 × 7 does not follow a 7 × 8', () => {
    const prev = { a: 7, b: 8, answer: 56 };
    for (let i = 0; i < 2000; i++) {
      const q = pickQuestion([7], prev);
      expect(missKey(q) === '7x8').toBeFalse();
    }
  });

  it('is deterministic given a seeded rng', () => {
    const seq = [0.1, 0.5, 0.9, 0.2, 0.3, 0.8];
    const mk = () => { let i = 0; return () => seq[i++ % seq.length]; };
    expect(pickQuestion([2, 3, 4], null, mk())).toEqual(pickQuestion([2, 3, 4], null, mk()));
  });
});

// ─── isComplete (auto-submit) ────────────────────────────────────────────────

describe('isComplete — auto-submit rule', () => {
  it('one-digit answer completes after one digit', () => {
    expect(isComplete('6', 6)).toBeTrue();
    expect(isComplete('', 6)).toBeFalse();
  });

  it('two-digit answer waits for the second digit', () => {
    expect(isComplete('5', 56)).toBeFalse();
    expect(isComplete('56', 56)).toBeTrue();
  });

  it('three-digit answer (e.g. 12 × 12 = 144) waits for three digits', () => {
    expect(isComplete('14', 144)).toBeFalse();
    expect(isComplete('144', 144)).toBeTrue();
  });

  it('a wrong full-length entry still completes (so it can be marked wrong)', () => {
    expect(isComplete('57', 56)).toBeTrue();
  });
});

// ─── bestKey ─────────────────────────────────────────────────────────────────

describe('bestKey — personal-best storage key', () => {
  it('is independent of selection order', () => {
    expect(bestKey([7, 2, 12])).toBe(bestKey([12, 7, 2]));
  });

  it('sorts numerically, not alphabetically (2 before 12)', () => {
    expect(bestKey([12, 2])).toBe('2-12');
  });

  it('different selections get different keys', () => {
    expect(bestKey([2, 3]) === bestKey([2, 4])).toBeFalse();
  });

  it('does not mutate the array it is given', () => {
    const a = [9, 3];
    bestKey(a);
    expect(a).toEqual([9, 3]);
  });
});

// ─── accuracy / missKey / scoreMessage ───────────────────────────────────────

describe('accuracy', () => {
  it('is null before any answer (avoids 0/0)', () => {
    expect(accuracy(0, 0)).toBe(null);
  });
  it('rounds to a whole percentage', () => {
    expect(accuracy(2, 1)).toBe(67);
    expect(accuracy(10, 0)).toBe(100);
    expect(accuracy(0, 4)).toBe(0);
  });
});

describe('missKey', () => {
  it('treats 7 × 8 and 8 × 7 as the same fact', () => {
    expect(missKey({ a: 7, b: 8 })).toBe(missKey({ a: 8, b: 7 }));
  });
  it('distinguishes different facts', () => {
    expect(missKey({ a: 7, b: 8 }) === missKey({ a: 7, b: 9 })).toBeFalse();
  });
});

describe('scoreMessage — tier boundaries', () => {
  it('zero gets the encouraging message', () => {
    expect(scoreMessage(0).startsWith('Not a single one')).toBeTrue();
  });
  it('7 and 8 fall in different tiers', () => {
    expect(scoreMessage(7) === scoreMessage(8)).toBeFalse();
  });
  it('29 and 30 fall in different tiers', () => {
    expect(scoreMessage(29) === scoreMessage(30)).toBeFalse();
  });
  it('every score gets a non-empty message', () => {
    for (let n = 0; n <= 80; n++) expect(scoreMessage(n).length > 0).toBeTrue();
  });
});

// ─── complexity ──────────────────────────────────────────────────────────────

describe('complexity — anchor values', () => {
  it('1 × 1 is trivial (1)', () => { expect(complexity(1, 1)).toBe(1); });
  it('anything × 1 is 1, in either order', () => {
    for (let n = 1; n <= 12; n++) {
      expect(complexity(n, 1)).toBe(1);
      expect(complexity(1, n)).toBe(1);
    }
  });
  it('the 10s and 2s are easy (2)', () => {
    expect(complexity(10, 7)).toBe(2);
    expect(complexity(12, 10)).toBe(2);
    expect(complexity(2, 9)).toBe(2);
  });
  it('the 5s and most 11s are 3, but 11 × 11 and 11 × 12 are 4', () => {
    expect(complexity(5, 7)).toBe(3);
    expect(complexity(3, 5)).toBe(3);
    expect(complexity(11, 9)).toBe(3);
    expect(complexity(11, 11)).toBe(4);
    expect(complexity(12, 11)).toBe(4);
  });
  it('8 × 7 is mid-hard (5) and 9 × 12 is harder (9)', () => {
    expect(complexity(8, 7)).toBe(5);
    expect(complexity(9, 12)).toBe(9);
  });
});

describe('complexity — shape', () => {
  it('is symmetric: a × b scores the same as b × a', () => {
    for (let a = 1; a <= 12; a++)
      for (let b = 1; b <= 12; b++)
        expect(complexity(a, b)).toBe(complexity(b, a));
  });
  it('is always a whole number from 1 to 10', () => {
    for (let a = 1; a <= 12; a++)
      for (let b = 1; b <= 12; b++) {
        const c = complexity(a, b);
        expect(Number.isInteger(c) && c >= 1 && c <= 10).toBeTrue();
      }
  });
  it('the hard middle-table facts outrank the easy ones', () => {
    expect(complexity(8, 7) > complexity(6, 3)).toBeTrue();
    expect(complexity(9, 12) > complexity(8, 7)).toBeTrue();
    expect(complexity(7, 8) > complexity(5, 8)).toBeTrue();
  });
  it('the hardest fact in the whole grid scores at least 9', () => {
    let max = 0;
    for (let a = 1; a <= 12; a++)
      for (let b = 1; b <= 12; b++) max = Math.max(max, complexity(a, b));
    expect(max >= 9).toBeTrue();
  });
});

// ─── describeTables ──────────────────────────────────────────────────────────

describe('describeTables — results-page label', () => {
  it('collapses runs of three or more', () => {
    expect(describeTables([2, 3, 4, 5])).toBe('2–5');
    expect(describeTables([10, 11, 12])).toBe('10–12');
  });
  it('lists pairs and singles individually', () => {
    expect(describeTables([6, 7])).toBe('6, 7');
    expect(describeTables([9])).toBe('9');
  });
  it('mixes runs and singles', () => {
    expect(describeTables([2, 3, 4, 5, 8, 10, 11, 12])).toBe('2–5, 8, 10–12');
    expect(describeTables([2, 3, 4, 7, 9, 10])).toBe('2–4, 7, 9, 10');
  });
  it('is independent of selection order and ignores duplicates', () => {
    expect(describeTables([5, 3, 4, 3])).toBe('3–5');
  });
  it('all twelve tables read as "All (1–12)"', () => {
    expect(describeTables([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe('All (1–12)');
  });
  it('11 tables (everything but one) is not "All"', () => {
    expect(describeTables([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])).toBe('1–11');
  });
  it('does not mutate the array it is given', () => {
    const a = [9, 3];
    describeTables(a);
    expect(a).toEqual([9, 3]);
  });
});
