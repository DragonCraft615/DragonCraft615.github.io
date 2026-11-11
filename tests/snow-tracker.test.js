/**
 * Tests for snow_tracker.html pure logic functions (copied verbatim from the source file):
 *   isLeap / seasonLength / dateOfIdx / idxOfDate / defaultSeason — the 1 Nov–end Feb calendar
 *   percentile / smoothSeries / cumsum / statsByDay               — the average-and-range maths
 *   depthStep / simulateDepth                                     — the snow-budget projection
 *   periodOf / windChill / freezingLevel / windAt / vectorMeanDir / classifyPeriod — the 12-day table
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

// ── forecast-table helpers ──
const PERIODS = ['am', 'pm', 'night'];
function prevDate(iso) { return new Date(Date.parse(iso + 'T12:00:00Z') - MS_DAY).toISOString().slice(0, 10); }
// Which table column an hour belongs to: AM 06-12, PM 12-18, night 18-06 (the small hours belong to the night before).
function periodOf(t) {
  const date = t.slice(0, 10), h = +t.slice(11, 13);
  if (h >= 6 && h < 12) return { date, p: 'am' };
  if (h >= 12 && h < 18) return { date, p: 'pm' };
  if (h >= 18) return { date, p: 'night' };
  return { date: prevDate(date), p: 'night' };
}
// Environment Canada / NWS wind chill (°C, km/h); only defined for cold, breezy conditions.
function windChill(t, v) {
  if (t > 10 || v < 4.8) return t;
  const x = Math.pow(v, 0.16);
  return 13.12 + 0.6215 * t - 11.37 * x + 0.3965 * t * x;
}
// Height of the 0 °C line, estimated from a temperature at a known elevation with a standard 6.5 °C/km lapse rate.
function freezingLevel(t, elev) { return elev + t / 0.0065; }
// Wind at height z, blended between pressure levels (ascending {z, spd, dir}); direction comes from the nearer level.
function windAt(z, levels) {
  if (z <= levels[0].z) return { spd: levels[0].spd, dir: levels[0].dir };
  for (let i = 1; i < levels.length; i++) {
    const a = levels[i - 1], b = levels[i];
    if (z <= b.z) { const f = (z - a.z) / (b.z - a.z); return { spd: a.spd + (b.spd - a.spd) * f, dir: f < .5 ? a.dir : b.dir }; }
  }
  const l = levels[levels.length - 1];
  return { spd: l.spd, dir: l.dir };
}
// Average direction (degrees the wind blows FROM) of several readings, weighted by speed.
function vectorMeanDir(spd, dir) {
  let u = 0, v = 0;
  spd.forEach((s, i) => { const r = dir[i] * Math.PI / 180; u += s * Math.sin(r); v += s * Math.cos(r); });
  if (Math.abs(u) < 1e-9 && Math.abs(v) < 1e-9) return null;
  return (Math.atan2(u, v) * 180 / Math.PI + 360) % 360;
}
// Plain-words weather for one column from its snow (cm), rain (mm) and mean cloud cover (%).
function classifyPeriod(snowCm, rainMm, cloud, night) {
  const snowy = snowCm >= 0.5, rainy = rainMm >= 0.3;
  if (snowy && rainy && Math.min(snowCm / 7.7, rainMm) >= 0.3) return { label: 'rain & snow', icon: '🌨️', kind: 'mix' };
  if (snowy && (!rainy || snowCm / 7.7 >= rainMm)) {
    return snowCm < 2 ? { label: 'light snow', icon: '🌨️', kind: 'snow' }
      : snowCm < 8 ? { label: 'mod. snow', icon: '🌨️', kind: 'snow' } : { label: 'heavy snow', icon: '❄️', kind: 'snow' };
  }
  if (rainy) {
    return rainMm < 1.5 ? { label: 'light rain', icon: '🌦️', kind: 'rain' }
      : rainMm < 5 ? { label: 'mod. rain', icon: '🌧️', kind: 'rain' } : { label: 'heavy rain', icon: '🌧️', kind: 'rain' };
  }
  if (cloud < 20) return { label: 'clear', icon: night ? '🌙' : '☀️', kind: 'clear' };
  if (cloud < 60) return { label: 'some clouds', icon: night ? '☁️' : '🌤️', kind: 'part' };
  return { label: 'cloudy', icon: '☁️', kind: 'cloud' };
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

// ─── 12-day forecast table ───────────────────────────────────────────────────

describe('periodOf — which column an hour belongs to', () => {
  it('06:00–11:59 is AM, 12:00–17:59 is PM', () => {
    expect(periodOf('2026-11-11T06:00')).toEqual({ date: '2026-11-11', p: 'am' });
    expect(periodOf('2026-11-11T11:00')).toEqual({ date: '2026-11-11', p: 'am' });
    expect(periodOf('2026-11-11T12:00')).toEqual({ date: '2026-11-11', p: 'pm' });
    expect(periodOf('2026-11-11T17:00')).toEqual({ date: '2026-11-11', p: 'pm' });
  });
  it('evening 18:00–23:59 is that day\'s night', () => {
    expect(periodOf('2026-11-11T18:00')).toEqual({ date: '2026-11-11', p: 'night' });
    expect(periodOf('2026-11-11T23:00')).toEqual({ date: '2026-11-11', p: 'night' });
  });
  it('the small hours belong to the previous day\'s night', () => {
    expect(periodOf('2026-11-12T00:00')).toEqual({ date: '2026-11-11', p: 'night' });
    expect(periodOf('2026-11-12T05:00')).toEqual({ date: '2026-11-11', p: 'night' });
  });
  it('rolls back across a month and year boundary', () => {
    expect(periodOf('2027-01-01T02:00').date).toBe('2026-12-31');
    expect(periodOf('2026-12-01T03:00').date).toBe('2026-11-30');
  });
  it('every hour of a day lands in exactly one column and the 24 hours split 6/6/12', () => {
    const counts = { am: 0, pm: 0, night: 0 };
    for (let h = 0; h < 24; h++) counts[periodOf('2026-11-11T' + String(h).padStart(2, '0') + ':00').p]++;
    expect(counts).toEqual({ am: 6, pm: 6, night: 12 });
  });
});

describe('windChill', () => {
  it('matches the published chart: -10 °C at 20 km/h feels like -18', () => {
    expect(Math.round(windChill(-10, 20))).toBe(-18);
  });
  it('is colder than the air temperature when it is cold and windy', () => {
    expect(windChill(-5, 30) < -5).toBeTrue();
  });
  it('stronger wind means a colder chill', () => {
    expect(windChill(-5, 40) < windChill(-5, 10)).toBeTrue();
  });
  it('falls back to the air temperature in light wind or mild air', () => {
    expect(windChill(-5, 3)).toBe(-5);
    expect(windChill(15, 40)).toBe(15);
  });
});

describe('freezingLevel / windAt / vectorMeanDir', () => {
  it('freezing level sits above the station when it is warm there and below when cold', () => {
    expect(freezingLevel(3, 2100) > 2100).toBeTrue();
    expect(freezingLevel(-3, 2100) < 2100).toBeTrue();
    expect(Math.round(freezingLevel(0, 2100))).toBe(2100);
  });
  it('6.5 °C of cooling is 1,000 m', () => {
    expect(Math.round(freezingLevel(6.5, 2000))).toBe(3000);
  });
  const L = [{ z: 1400, spd: 5, dir: 90 }, { z: 2900, spd: 20, dir: 120 }, { z: 5500, spd: 60, dir: 230 }];
  it('wind at a level equals that level\'s wind', () => {
    expect(windAt(2900, L).spd).toBe(20);
    expect(windAt(1400, L).spd).toBe(5);
  });
  it('interpolates speed between levels and increases with height here', () => {
    const lo = windAt(2100, L), hi = windAt(3400, L);
    expect(lo.spd > 5 && lo.spd < 20).toBeTrue();
    expect(hi.spd > 20 && hi.spd < 60).toBeTrue();
    expect(hi.spd > lo.spd).toBeTrue();
  });
  it('clamps below the lowest and above the highest level', () => {
    expect(windAt(500, L).spd).toBe(5);
    expect(windAt(9000, L).spd).toBe(60);
  });
  it('takes direction from the nearer level', () => {
    expect(windAt(1500, L).dir).toBe(90);
    expect(windAt(2800, L).dir).toBe(120);
  });
  it('vector mean of opposite equal winds has no direction; steady wind keeps it', () => {
    expect(vectorMeanDir([10, 10], [0, 180])).toBe(null);
    expect(Math.round(vectorMeanDir([5, 9, 12], [90, 90, 90]))).toBe(90);
  });
  it('averages across north without going wrong (350° and 10° give ~0°)', () => {
    const d = vectorMeanDir([10, 10], [350, 10]);
    expect(d < 1 || d > 359).toBeTrue();
  });
  it('a stronger reading pulls the average toward it', () => {
    expect(vectorMeanDir([30, 3], [90, 270]) < 180).toBeTrue();
  });
});

describe('classifyPeriod — plain-words weather', () => {
  it('no precipitation: clear, some clouds, cloudy by cloud cover', () => {
    expect(classifyPeriod(0, 0, 5, false).label).toBe('clear');
    expect(classifyPeriod(0, 0, 40, false).label).toBe('some clouds');
    expect(classifyPeriod(0, 0, 95, false).label).toBe('cloudy');
  });
  it('clear night shows a moon, clear day a sun', () => {
    expect(classifyPeriod(0, 0, 0, true).icon).toBe('🌙');
    expect(classifyPeriod(0, 0, 0, false).icon).toBe('☀️');
  });
  it('snow gets heavier with the amount', () => {
    expect(classifyPeriod(1, 0, 100, false).label).toBe('light snow');
    expect(classifyPeriod(4, 0, 100, false).label).toBe('mod. snow');
    expect(classifyPeriod(12, 0, 100, false).label).toBe('heavy snow');
  });
  it('rain gets heavier with the amount', () => {
    expect(classifyPeriod(0, 1, 100, false).label).toBe('light rain');
    expect(classifyPeriod(0, 3, 100, false).label).toBe('mod. rain');
    expect(classifyPeriod(0, 9, 100, false).label).toBe('heavy rain');
  });
  it('a trace below the thresholds doesn\'t count as precipitation', () => {
    expect(classifyPeriod(0.3, 0.1, 10, false).label).toBe('clear');
  });
  it('meaningful rain and snow together read as rain & snow', () => {
    expect(classifyPeriod(3, 1, 100, false).label).toBe('rain & snow');
  });
  it('mostly-snow with a dribble of rain is still snow', () => {
    expect(classifyPeriod(6, 0.1, 100, false).kind).toBe('snow');
  });
  it('precipitation overrides cloud cover', () => {
    expect(classifyPeriod(5, 0, 0, false).kind).toBe('snow');
  });
});
