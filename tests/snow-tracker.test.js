/**
 * Tests for snow_tracker.html pure logic functions (copied verbatim from the source file):
 *   isLeap / seasonLength / dateOfIdx / idxOfDate / defaultSeason — the 1 Nov–end Feb calendar
 *   percentile / smoothSeries / cumsum / statsByDay               — the average-and-range maths
 *   depthStep / simulateDepth                                     — the snow-budget projection
 *
 * Why these matter:
 *   Every line on the chart is indexed by days since 1 Nov, so an off-by-one in dateOfIdx/idxOfDate
 *   or a leap-year slip silently shifts the whole forecast against the history. The percentiles drive
 *   the ensemble uncertainty band, and depthStep decides whether the projected snowpack can go
 *   negative or grow without snow.
 */

// ─── Source functions (verbatim from snow_tracker.html) ──────────────────────

const MS_DAY = 86400000;

function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
function seasonLength(startYear) { return isLeap(startYear + 1) ? 121 : 120; }
function dateOfIdx(startYear, idx) { return new Date(Date.UTC(startYear, 10, 1 + idx)).toISOString().slice(0, 10); }
function idxOfDate(startYear, iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(startYear, 10, 1)) / MS_DAY);
}
// The winter to show by default: the one in progress (or about to start in October), else the last one finished.
function defaultSeason(iso) {
  const [y, m] = iso.split('-').map(Number);
  return m >= 10 ? y : y - 1;
}

// Linear-interpolated percentile (p from 0 to 1), ignoring nulls.
function percentile(values, p) {
  const v = values.filter(x => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = (v.length - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

// Centred moving average (±half days), using whichever days exist; a missing day stays missing.
function smoothSeries(arr, half) {
  return arr.map((v, i) => {
    if (v == null) return null;
    let s = 0, n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      if (arr[j] != null) { s += arr[j]; n++; }
    }
    return n ? s / n : null;
  });
}

function cumsum(arr) {
  let t = 0;
  return arr.map(v => { if (v == null) return null; t += v; return t; });
}

// Mean / min / max / count across winters for each day index.
function statsByDay(seasons, len) {
  const mean = [], min = [], max = [], n = [];
  for (let i = 0; i < len; i++) {
    const v = seasons.map(s => s[i]).filter(x => x != null);
    n.push(v.length);
    mean.push(v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
    min.push(v.length ? Math.min(...v) : null);
    max.push(v.length ? Math.max(...v) : null);
  }
  return { mean, min, max, n };
}

// One day of a simple snow budget fitted to the Tignes Le Lac station: fresh snow settles to ~75% of
// its depth, warm days melt, the pack compacts a little every day. Returns next morning's depth (cm).
function depthStep(d, snow, temp, m) {
  const on = d > 0 ? 1 : 0, active = (d > 0 || snow > 0) ? 1 : 0;
  return Math.max(0, d + m.a * snow + m.b * Math.max(temp, 0) * on + m.c * d * on + m.k * active);
}
// Weather for consecutive days -> the depth the morning after each of them.
function simulateDepth(d0, snow, temp, m) {
  const out = [];
  let d = d0;
  for (let i = 0; i < snow.length; i++) { d = depthStep(d, snow[i] || 0, temp[i] == null ? 0 : temp[i], m); out.push(d); }
  return out;
}

// ─── calendar ────────────────────────────────────────────────────────────────

describe('winter calendar — index <-> date', () => {
  it('index 0 is 1 November of the start year', () => {
    expect(dateOfIdx(2026, 0)).toBe('2026-11-01');
    expect(idxOfDate(2026, '2026-11-01')).toBe(0);
  });
  it('index 30 is 1 December and 61 is 1 January', () => {
    expect(dateOfIdx(2026, 30)).toBe('2026-12-01');
    expect(dateOfIdx(2026, 61)).toBe('2027-01-01');
  });
  it('index 119 is 28 February in a normal winter', () => {
    expect(dateOfIdx(2026, 119)).toBe('2027-02-28');
    expect(idxOfDate(2026, '2027-02-28')).toBe(119);
  });
  it('index 120 is 29 February only when the end year is a leap year', () => {
    expect(dateOfIdx(2023, 120)).toBe('2024-02-29');
    expect(seasonLength(2023)).toBe(121);
    expect(seasonLength(2026)).toBe(120);
  });
  it('round-trips every day of a leap and a normal winter', () => {
    [2023, 2026].forEach(y => {
      for (let i = 0; i < seasonLength(y); i++) expect(idxOfDate(y, dateOfIdx(y, i))).toBe(i);
    });
  });
  it('days before 1 November have negative indices (pre-season readings)', () => {
    expect(idxOfDate(2026, '2026-10-31')).toBe(-1);
    expect(dateOfIdx(2026, -1)).toBe('2026-10-31');
  });
  it('isLeap handles century rules', () => {
    expect(isLeap(2000)).toBeTrue();
    expect(isLeap(1900)).toBeFalse();
    expect(isLeap(2024)).toBeTrue();
    expect(isLeap(2027)).toBeFalse();
  });
});

describe('defaultSeason — which winter to show', () => {
  it('Nov and Dec belong to the winter starting that year', () => {
    expect(defaultSeason('2026-11-10')).toBe(2026);
    expect(defaultSeason('2026-12-31')).toBe(2026);
  });
  it('Jan and Feb belong to the winter that started last year', () => {
    expect(defaultSeason('2027-01-01')).toBe(2026);
    expect(defaultSeason('2027-02-28')).toBe(2026);
  });
  it('October shows the winter about to start', () => {
    expect(defaultSeason('2026-10-15')).toBe(2026);
  });
  it('Mar–Sep shows the winter that just finished', () => {
    expect(defaultSeason('2027-03-01')).toBe(2026);
    expect(defaultSeason('2027-09-30')).toBe(2026);
  });
});

// ─── percentile / smoothing / stats ──────────────────────────────────────────

describe('percentile', () => {
  it('median of an odd and even list', () => {
    expect(percentile([3, 1, 2], .5)).toBe(2);
    expect(percentile([1, 2, 3, 4], .5)).toBe(2.5);
  });
  it('0 and 1 are the min and max', () => {
    expect(percentile([5, 9, 1, 7], 0)).toBe(1);
    expect(percentile([5, 9, 1, 7], 1)).toBe(9);
  });
  it('interpolates between members (10th percentile of 0..10)', () => {
    expect(percentile([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], .1)).toBe(1);
    expect(percentile([0, 10], .25)).toBe(2.5);
  });
  it('ignores nulls and returns null when nothing is left', () => {
    expect(percentile([null, 4, null, 8], .5)).toBe(6);
    expect(percentile([null, null], .5)).toBe(null);
    expect(percentile([], .5)).toBe(null);
  });
  it('does not reorder the caller\'s array', () => {
    const a = [3, 1, 2];
    percentile(a, .5);
    expect(a).toEqual([3, 1, 2]);
  });
  it('a 51-member spread keeps p10 <= median <= p90', () => {
    const m = Array.from({ length: 51 }, (_, i) => i * 0.7);
    expect(percentile(m, .1) <= percentile(m, .5) && percentile(m, .5) <= percentile(m, .9)).toBeTrue();
  });
});

describe('smoothSeries', () => {
  it('a flat series stays flat', () => {
    expect(smoothSeries([2, 2, 2, 2, 2], 1)).toEqual([2, 2, 2, 2, 2]);
  });
  it('averages ±half days in the middle', () => {
    expect(smoothSeries([0, 0, 9, 0, 0], 1)[2]).toBe(3);
  });
  it('uses fewer days at the edges instead of inventing zeros', () => {
    expect(smoothSeries([4, 8, 6], 1)).toEqual([6, 6, 7]);
  });
  it('keeps missing days missing and skips them when averaging', () => {
    const s = smoothSeries([2, null, 4], 1);
    expect(s[1]).toBe(null);
    expect(s[0]).toBe(2);
  });
  it('preserves the total snowfall roughly (mean of smoothed ~ mean of raw)', () => {
    const raw = Array.from({ length: 60 }, (_, i) => (i % 7 === 0 ? 20 : 0));
    const sm = smoothSeries(raw, 3);
    const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    expect(Math.abs(mean(raw) - mean(sm)) < 1).toBeTrue();
  });
});

describe('cumsum / statsByDay', () => {
  it('running total', () => {
    expect(cumsum([1, 2, 3])).toEqual([1, 3, 6]);
  });
  it('stops counting at missing days without losing the running total', () => {
    expect(cumsum([1, null, 3])).toEqual([1, null, 4]);
  });
  it('mean, min, max and count per day across winters', () => {
    const st = statsByDay([[1, 10], [3, 20], [5, null]], 2);
    expect(st.mean).toEqual([3, 15]);
    expect(st.min).toEqual([1, 10]);
    expect(st.max).toEqual([5, 20]);
    expect(st.n).toEqual([3, 2]);
  });
  it('a day with no data at all gives nulls, not NaN or Infinity', () => {
    const st = statsByDay([[null], [null]], 1);
    expect(st.mean).toEqual([null]);
    expect(st.min).toEqual([null]);
    expect(st.n).toEqual([0]);
  });
});

// ─── snow-budget projection ──────────────────────────────────────────────────

describe('depthStep / simulateDepth', () => {
  const M = { a: 0.75, b: -1.34, c: -0.0146, k: 0.44 };   // roughly the fitted Tignes Le Lac values
  it('fresh snow adds less than its raw depth (it settles)', () => {
    const d = depthStep(50, 20, -5, M);
    expect(d > 50 && d < 50 + 20).toBeTrue();
  });
  it('a warm, snowless day melts the pack', () => {
    expect(depthStep(80, 0, 8, M) < 80).toBeTrue();
  });
  it('depth can never go negative', () => {
    expect(depthStep(2, 0, 15, M)).toBe(0);
    expect(depthStep(0, 0, 15, M)).toBe(0);
  });
  it('bare ground with no snow stays bare (no phantom snow)', () => {
    expect(depthStep(0, 0, -10, M)).toBe(0);
  });
  it('bare ground with a snowfall starts a pack', () => {
    expect(depthStep(0, 10, -3, M) > 0).toBeTrue();
  });
  it('more snow always means a deeper pack, all else equal', () => {
    expect(depthStep(40, 15, -4, M) > depthStep(40, 5, -4, M)).toBeTrue();
  });
  it('a long dry cold spell slowly compacts but never vanishes', () => {
    const out = simulateDepth(100, new Array(10).fill(0), new Array(10).fill(-8), M);
    expect(out.length).toBe(10);
    expect(out[9] > 60 && out[9] <= 100).toBeTrue();
  });
  it('treats missing weather as zero rather than NaN', () => {
    const out = simulateDepth(30, [null, 4], [null, null], M);
    expect(out.every(v => Number.isFinite(v))).toBeTrue();
  });
  it('returns one depth per day of weather', () => {
    expect(simulateDepth(10, [1, 2, 3], [0, 0, 0], M).length).toBe(3);
  });
});
