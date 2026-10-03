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
 *   - complexity(a, b) / factProfile  — 1–10 difficulty from modelled error rate × speed
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

// How hard a fact is, scored out of 10 from two things: how often people get it WRONG and how SLOW
// they are on it. Honest caveat: no public per-fact table of error rates and response times could be
// retrieved, so these are MODELLED from the well-replicated findings rather than measured per fact:
//  - problem-size effect: bigger products mean more errors and slower answers;
//  - tie effect: 7 × 7 and 8 × 8 are easier than their neighbours;
//  - shortcut tables are near-trivial: ×1, ×10, ×2 (doubling), ×5 (count-by-fives), and ×11 up to 9
//    (repeated digit, but 11 × 11 and 11 × 12 break the pattern);
//  - the 9s have a digit-sum trick, so a little easier than their size suggests;
//  - 12 × n is treated as two steps (a 6 × n fact, doubled), so a touch harder than 6 × n.
// The error scale is calibrated to one verified number: Campbell & Graham (1985) found adults get
// about 8% of single-digit (2–9) facts wrong, and the model's mean over 2–9 × 2–9 lands there.
// Error and speed are each min-max scaled over the whole 12 × 12 grid and averaged, so the easiest
// fact scores exactly 1 and the hardest exactly 10. Swap in real norms by replacing factProfile().
function factGap(a, b) {
  const ea = a === 12 ? 6 : a, eb = b === 12 ? 6 : b;
  let g = Math.max(0, Math.min(1, (ea * eb - 9) / 72));
  if (a === b) g *= 0.65;
  if (a === 9 || b === 9) g *= 0.9;
  return Math.min(1, g + 0.08 * ((a === 12) + (b === 12)));
}
function factProfile(a, b) {            // -> { err: chance of a wrong answer, secs: typical answer time }
  const lo = Math.min(a, b), hi = Math.max(a, b);
  if (lo === 1) return { err: 0.005, secs: 0.8 };
  if (lo === 10 || hi === 10) return { err: 0.01, secs: 0.9 };
  if (lo === 2) return { err: 0.02, secs: 1.0 };
  if (lo === 5 || hi === 5) return { err: 0.03, secs: 1.1 };
  if (lo === 11 || hi === 11) return lo >= 11 ? { err: 0.06, secs: 1.7 } : { err: 0.03, secs: 1.3 };
  const g = factGap(a, b);
  return { err: 0.03 + 0.26 * g, secs: 1.0 + 1.2 * g };
}
const FACT_RANGE = (() => {
  let eMin = Infinity, eMax = -Infinity, sMin = Infinity, sMax = -Infinity;
  for (let a = 1; a <= 12; a++) for (let b = 1; b <= 12; b++) {
    const p = factProfile(a, b);
    eMin = Math.min(eMin, p.err); eMax = Math.max(eMax, p.err);
    sMin = Math.min(sMin, p.secs); sMax = Math.max(sMax, p.secs);
  }
  return { eMin, eMax, sMin, sMax };
})();
function complexity(a, b) {
  const p = factProfile(a, b), r = FACT_RANGE;
  const h = 0.5 * (p.err - r.eMin) / (r.eMax - r.eMin) + 0.5 * (p.secs - r.sMin) / (r.sMax - r.sMin);
  return Math.round((1 + 9 * h) * 10) / 10;
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

// ─── complexity (modelled error rate × speed, out of 10) ─────────────────────

describe('complexity — anchors', () => {
  it('1 × 1 is trivial: exactly 1', () => { expect(complexity(1, 1)).toBe(1); });
  it('anything × 1 scores 1, in either order', () => {
    for (let n = 1; n <= 12; n++) {
      expect(complexity(n, 1)).toBe(1);
      expect(complexity(1, n)).toBe(1);
    }
  });
  it('the shortcut tables (10s, 2s, 5s) stay easy', () => {
    for (let n = 1; n <= 12; n++) {
      expect(complexity(10, n) <= 2).toBeTrue();
      expect(complexity(2, n) <= 2.5).toBeTrue();
      expect(complexity(5, n) <= 3).toBeTrue();
    }
  });
  it('8 × 7 and 9 × 12 are hard (7.5 or more)', () => {
    expect(complexity(8, 7) >= 7.5).toBeTrue();
    expect(complexity(9, 12) >= 7.5).toBeTrue();
  });
  it('the hardest fact in the 12 × 12 grid scores exactly 10 and the easiest exactly 1', () => {
    let max = 0, min = 99;
    for (let a = 1; a <= 12; a++)
      for (let b = 1; b <= 12; b++) { max = Math.max(max, complexity(a, b)); min = Math.min(min, complexity(a, b)); }
    expect(max).toBe(10);
    expect(min).toBe(1);
  });
});

describe('complexity — shape', () => {
  it('is symmetric: a × b scores the same as b × a', () => {
    for (let a = 1; a <= 12; a++)
      for (let b = 1; b <= 12; b++)
        expect(complexity(a, b)).toBe(complexity(b, a));
  });
  it('is always between 1 and 10, to one decimal place', () => {
    for (let a = 1; a <= 12; a++)
      for (let b = 1; b <= 12; b++) {
        const c = complexity(a, b);
        expect(c >= 1 && c <= 10).toBeTrue();
        expect(Math.abs(c * 10 - Math.round(c * 10)) < 1e-9).toBeTrue();
      }
  });
  it('problem-size effect: bigger products in the same tables score higher', () => {
    expect(complexity(3, 4) < complexity(6, 7)).toBeTrue();
    expect(complexity(6, 7) < complexity(8, 9)).toBeTrue();
    expect(complexity(4, 6) < complexity(7, 8)).toBeTrue();
  });
  it('tie effect: n × n is easier than its neighbours', () => {
    expect(complexity(7, 7) < complexity(7, 8)).toBeTrue();
    expect(complexity(8, 8) < complexity(8, 9)).toBeTrue();
    expect(complexity(9, 9) < complexity(8, 9)).toBeTrue();
  });
  it('11 × 11 and 11 × 12 are harder than the rest of the 11s', () => {
    expect(complexity(11, 11) > complexity(11, 9)).toBeTrue();
    expect(complexity(11, 12) > complexity(11, 3)).toBeTrue();
  });
});

describe('factProfile — modelled error rate and speed', () => {
  it('mean error over 2–9 × 2–9 matches the ~8% adult figure (Campbell & Graham 1985)', () => {
    let sum = 0, n = 0;
    for (let a = 2; a <= 9; a++) for (let b = 2; b <= 9; b++) { sum += factProfile(a, b).err; n++; }
    const mean = sum / n;
    expect(mean >= 0.07 && mean <= 0.09).toBeTrue();
  });
  it('harder facts are both more error-prone and slower than easy ones', () => {
    const easy = factProfile(3, 4), hard = factProfile(8, 9);
    expect(hard.err > easy.err).toBeTrue();
    expect(hard.secs > easy.secs).toBeTrue();
  });
  it('error rates are probabilities and times are positive for every fact', () => {
    for (let a = 1; a <= 12; a++)
      for (let b = 1; b <= 12; b++) {
        const p = factProfile(a, b);
        expect(p.err > 0 && p.err < 1 && p.secs > 0).toBeTrue();
      }
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
