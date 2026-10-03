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
