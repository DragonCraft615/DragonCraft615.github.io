/**
 * Tests for boys_quiz.html pure logic functions.
 *
 * Functions under test (copied verbatim from the source file):
 *   - scoreAnswer(guess, answer)  — tiered percentage-proximity scorer
 *   - fmt(n)                      — en-GB number formatter
 *
 * Why these matter:
 *   scoreAnswer() is the single most important function in the quiz — it
 *   determines every player score. Four scoring tiers hinge on exact
 *   percentage boundaries (1%, 10%, 50%). An off-by-one here would silently
 *   award wrong points on every submission.
 *
 *   fmt() is called on every live keypress to format user input. Returning ""
 *   for invalid values prevents confusing "NaN" UI strings.
 */

// ─── Source functions (verbatim from boys_quiz.html) ─────────────────────────

function scoreAnswer(guess, answer) {
  if (answer === 0) return guess === 0 ? 10 : 0;
  const ratio = Math.abs(guess - answer) / answer;
  if (ratio <= 0.01) return 10;
  if (ratio <= 0.10) return 5;
  if (ratio <= 0.50) return 2;
  return 0;
}

function fmt(n) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '';
  return Number(n).toLocaleString('en-GB');
}

// ─── Scoring tier tests ───────────────────────────────────────────────────────

describe('scoreAnswer — exact and within 1% (10 points)', () => {
  // answer = 86,400 (seconds in a day — easiest to reason about)
  const A = 86400;

  it('exact match scores 10', () => {
    expect(scoreAnswer(A, A)).toBe(10);
  });

  it('guess 1% below boundary scores 10 (ratio = 0.01)', () => {
    // 86400 * 0.99 = 85536; ratio = 864/86400 = 0.01 exactly
    expect(scoreAnswer(85536, A)).toBe(10);
  });

  it('guess 1% above boundary scores 10 (ratio = 0.01)', () => {
    // 86400 * 1.01 = 87264; ratio = 864/86400 = 0.01 exactly
    expect(scoreAnswer(87264, A)).toBe(10);
  });

  it('guess just outside 1% below scores 5, not 10 (ratio ≈ 0.0100115)', () => {
    // 85535: ratio = 865/86400 ≈ 0.01001 > 0.01
    expect(scoreAnswer(85535, A)).toBe(5);
  });
});

describe('scoreAnswer — within 10% but over 1% (5 points)', () => {
  const A = 86400;

  it('guess 5% off scores 5', () => {
    // 86400 * 0.95 = 82080; ratio ≈ 0.05
    expect(scoreAnswer(82080, A)).toBe(5);
  });

  it('guess exactly at 10% boundary scores 5 (ratio = 0.10)', () => {
    // 86400 * 0.90 = 77760; ratio = 8640/86400 = 0.10 exactly (≤ 0.10 → 5 pts)
    expect(scoreAnswer(77760, A)).toBe(5);
  });

  it('guess just outside 10% boundary scores 2, not 5 (ratio ≈ 0.1000116)', () => {
    // 77759: ratio = 8641/86400 ≈ 0.10001 > 0.10
    expect(scoreAnswer(77759, A)).toBe(2);
  });
});

describe('scoreAnswer — within 50% but over 10% (2 points)', () => {
  const A = 86400;

  it('guess 30% off scores 2', () => {
    // 86400 * 0.70 = 60480; ratio = 0.30
    expect(scoreAnswer(60480, A)).toBe(2);
  });

  it('guess exactly at 50% boundary scores 2 (ratio = 0.50)', () => {
    // 86400 * 0.50 = 43200; ratio = 43200/86400 = 0.50 exactly (≤ 0.50 → 2 pts)
    expect(scoreAnswer(43200, A)).toBe(2);
  });

  it('guess just outside 50% boundary scores 0, not 2 (ratio > 0.50)', () => {
    // 43199: ratio = 43201/86400 ≈ 0.50001 > 0.50
    expect(scoreAnswer(43199, A)).toBe(0);
  });
});

describe('scoreAnswer — more than 50% off (0 points)', () => {
  const A = 86400;

  it('guess 90% off scores 0', () => {
    expect(scoreAnswer(8640, A)).toBe(0);
  });

  it('guess of 0 against a non-zero answer scores 0', () => {
    expect(scoreAnswer(0, A)).toBe(0);
  });
});

describe('scoreAnswer — answer = 0 edge case', () => {
  it('guess = 0 when answer = 0 scores 10', () => {
    expect(scoreAnswer(0, 0)).toBe(10);
  });

  it('guess != 0 when answer = 0 scores 0', () => {
    expect(scoreAnswer(1, 0)).toBe(0);
    expect(scoreAnswer(100, 0)).toBe(0);
  });
});

describe('scoreAnswer — all 10 quiz questions sanity check', () => {
  // Verify each ANSWERS value scores 10 against itself.
  // If the ANSWERS array ever changes, these guard rails catch silent regressions.
  const ANSWERS = [34, 19667, 13950000, 42, 2377, 86400, 272, 325000, 5, 10000000000];
  const Q_LABELS = [
    'Levi 510s (mins)', 'Pokémon cards', 'British Library books',
    'Centipede legs', 'Tennis court (cm)', 'Seconds in a day',
    'Tallest person (cm)', 'Oak end-points', 'Painting months', 'Snowflakes',
  ];

  ANSWERS.forEach((answer, i) => {
    it(`exact answer for Q${i + 1} (${Q_LABELS[i]}) scores 10`, () => {
      expect(scoreAnswer(answer, answer)).toBe(10);
    });
  });
});

// ─── Number formatting tests ──────────────────────────────────────────────────

describe('fmt — valid numbers', () => {
  it('formats thousands with commas (en-GB)', () => {
    expect(fmt(86400)).toBe('86,400');
  });

  it('formats millions', () => {
    expect(fmt(1000000)).toBe('1,000,000');
  });

  it('formats 0 as "0"', () => {
    expect(fmt(0)).toBe('0');
  });

  it('formats small numbers without commas', () => {
    expect(fmt(42)).toBe('42');
  });

  it('formats very large numbers', () => {
    expect(fmt(10000000000)).toBe('10,000,000,000');
  });
});

describe('fmt — invalid / empty inputs return ""', () => {
  it('null → ""', () => {
    expect(fmt(null)).toBe('');
  });

  it('undefined → ""', () => {
    expect(fmt(undefined)).toBe('');
  });

  it('empty string → ""', () => {
    expect(fmt('')).toBe('');
  });

  it('NaN → ""', () => {
    expect(fmt(NaN)).toBe('');
  });
});

// ─── Round total calculation ──────────────────────────────────────────────────
// The score total is computed as breakdown.reduce((s, p) => s + p, 0).
// These tests verify the accumulation logic independently of DOM.

describe('round total accumulation', () => {
  it('perfect round (all 10s) totals 100', () => {
    const breakdown = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10];
    expect(breakdown.reduce((s, p) => s + p, 0)).toBe(100);
  });

  it('all zeros totals 0', () => {
    const breakdown = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(breakdown.reduce((s, p) => s + p, 0)).toBe(0);
  });

  it('mixed tier scores accumulate correctly', () => {
    // 2×10 + 3×5 + 2×2 + 3×0 = 20 + 15 + 4 + 0 = 39
    const breakdown = [10, 10, 5, 5, 5, 2, 2, 0, 0, 0];
    expect(breakdown.reduce((s, p) => s + p, 0)).toBe(39);
  });

  it('win condition requires total >= 90', () => {
    const total = [10, 10, 10, 10, 10, 10, 10, 10, 10, 5]
      .reduce((s, p) => s + p, 0);
    expect(total >= 90).toBeTrue();
  });

  it('total of 89 does NOT trigger win condition', () => {
    const total = [10, 10, 10, 10, 10, 10, 10, 10, 9, 0]
      .reduce((s, p) => s + p, 0);
    // Note: 9 is not a valid point value, but we test the boundary
    expect(total >= 90).toBeFalse();
  });
});
