/**
 * Dragonia — Micro Test Runner
 *
 * A minimal describe/it/expect framework that renders results in the browser.
 * No dependencies. Open tests/index.html in any modern browser to run.
 */

const _runner = (() => {
  const suites = [];
  let _current = null;

  function describe(name, fn) {
    _current = { name, tests: [] };
    suites.push(_current);
    fn();
    _current = null;
  }

  function it(desc, fn) {
    if (!_current) throw new Error('it() called outside describe()');
    _current.tests.push({ desc, fn });
  }

  function expect(actual) {
    return {
      toBe(expected) {
        if (actual !== expected)
          throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      },
      toEqual(expected) {
        const a = JSON.stringify(actual), b = JSON.stringify(expected);
        if (a !== b) throw new Error(`Expected ${b}, got ${a}`);
      },
      toBeTrue() {
        if (actual !== true) throw new Error(`Expected true, got ${JSON.stringify(actual)}`);
      },
      toBeFalse() {
        if (actual !== false) throw new Error(`Expected false, got ${JSON.stringify(actual)}`);
      },
      toBeGreaterThanOrEqual(n) {
        if (actual < n) throw new Error(`Expected ${actual} >= ${n}`);
      },
      toBeLessThanOrEqual(n) {
        if (actual > n) throw new Error(`Expected ${actual} <= ${n}`);
      },
      toContain(item) {
        if (!actual.includes(item))
          throw new Error(`Expected array to contain ${JSON.stringify(item)}`);
      },
    };
  }

  function run() {
    const root = document.getElementById('results');
    let totalPass = 0, totalFail = 0;

    suites.forEach(suite => {
      let suitePass = 0, suiteFail = 0;
      const failures = [];

      suite.tests.forEach(test => {
        try {
          test.fn();
          suitePass++;
          totalPass++;
        } catch (e) {
          suiteFail++;
          totalFail++;
          failures.push({ desc: test.desc, msg: e.message });
        }
      });

      const suiteEl = document.createElement('div');
      suiteEl.className = 'suite' + (suiteFail > 0 ? ' suite-fail' : ' suite-pass');

      const title = document.createElement('div');
      title.className = 'suite-title';
      title.textContent = `${suite.name}  (${suitePass} passed, ${suiteFail} failed)`;
      suiteEl.appendChild(title);

      suite.tests.forEach(test => {
        const failed = failures.find(f => f.desc === test.desc);
        const row = document.createElement('div');
        row.className = 'test-row ' + (failed ? 'test-fail' : 'test-pass');
        row.textContent = (failed ? '✗ ' : '✓ ') + test.desc;
        suiteEl.appendChild(row);

        if (failed) {
          const err = document.createElement('div');
          err.className = 'test-error';
          err.textContent = failed.msg;
          suiteEl.appendChild(err);
        }
      });

      root.appendChild(suiteEl);
    });

    const summary = document.getElementById('summary');
    summary.className = totalFail > 0 ? 'summary fail' : 'summary pass';
    summary.textContent =
      totalFail > 0
        ? `${totalFail} test(s) FAILED — ${totalPass} passed`
        : `All ${totalPass} tests passed ✓`;
  }

  return { describe, it, expect, run };
})();

const describe = _runner.describe;
const it       = _runner.it;
const expect   = _runner.expect;

window.addEventListener('DOMContentLoaded', () => _runner.run());
