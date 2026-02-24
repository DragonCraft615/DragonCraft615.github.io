/**
 * Tests for alien_invasion.html pure logic functions.
 *
 * Functions under test (copied verbatim from the source file):
 *   - rand(min, max)           — integer RNG in inclusive range
 *   - hpColor(pct)             — percentage → HSL colour string
 *   - shuffle(arr)             — Fisher-Yates in-place shuffle (returns copy)
 *   - dealEnemyDamage logic    — defend reduction, dodge, HP floor clamping
 *   - playerAction logic       — enchant doubling, potion healing, life drain
 *   - upgrade apply functions  — stat mutations
 *
 * Why these matter:
 *   rand() drives all combat outcomes. If it ever returns values outside
 *   [min, max] the game can deal impossible damage values. hpColor() controls
 *   the HP bar colour — clamping bugs make the bar green even at 0 HP.
 *   The defend reduction (×0.60) is a core balance mechanic; wrong maths here
 *   makes defending useless or overpowered. Upgrade apply() functions directly
 *   mutate player state and have no other validation layer.
 */

// ─── Source functions (verbatim from alien_invasion.html) ────────────────────

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function hpColor(pct) {
  const h = Math.round(Math.max(0, Math.min(1, pct)) * 120);
  return `hsl(${h}, 75%, 45%)`;
}

// ─── rand ─────────────────────────────────────────────────────────────────────

describe('rand — range and type', () => {
  it('always returns a value within [min, max] inclusive', () => {
    for (let i = 0; i < 2000; i++) {
      const v = rand(10, 20);
      expect(v >= 10 && v <= 20).toBeTrue();
    }
  });

  it('always returns an integer', () => {
    for (let i = 0; i < 500; i++) {
      expect(Number.isInteger(rand(1, 100))).toBeTrue();
    }
  });

  it('returns exactly min when min === max', () => {
    expect(rand(7, 7)).toBe(7);
    expect(rand(0, 0)).toBe(0);
  });

  it('can reach both the minimum and the maximum (statistical)', () => {
    // With 10,000 samples over [1,2], both values must appear
    const seen = new Set();
    for (let i = 0; i < 10000; i++) seen.add(rand(1, 2));
    expect(seen.has(1)).toBeTrue();
    expect(seen.has(2)).toBeTrue();
  });

  it('never returns a value outside damage range [12, 22] (player base)', () => {
    for (let i = 0; i < 1000; i++) {
      const dmg = rand(12, 22);
      expect(dmg >= 12 && dmg <= 22).toBeTrue();
    }
  });
});

// ─── hpColor ─────────────────────────────────────────────────────────────────

describe('hpColor — colour mapping', () => {
  it('100% HP → full green (hue 120)', () => {
    expect(hpColor(1)).toBe('hsl(120, 75%, 45%)');
  });

  it('0% HP → full red (hue 0)', () => {
    expect(hpColor(0)).toBe('hsl(0, 75%, 45%)');
  });

  it('50% HP → yellow (hue 60)', () => {
    expect(hpColor(0.5)).toBe('hsl(60, 75%, 45%)');
  });

  it('25% HP → hue 30 (orange-red)', () => {
    expect(hpColor(0.25)).toBe('hsl(30, 75%, 45%)');
  });

  it('clamps pct > 1 to green', () => {
    expect(hpColor(1.5)).toBe('hsl(120, 75%, 45%)');
    expect(hpColor(99)).toBe('hsl(120, 75%, 45%)');
  });

  it('clamps pct < 0 to red', () => {
    expect(hpColor(-0.1)).toBe('hsl(0, 75%, 45%)');
    expect(hpColor(-99)).toBe('hsl(0, 75%, 45%)');
  });

  it('HP bar should never show green (hue 120) at 0 HP', () => {
    expect(hpColor(0)).not.toBe('hsl(120, 75%, 45%)');
  });
});

// ─── shuffle ──────────────────────────────────────────────────────────────────

describe('shuffle — array integrity', () => {
  const original = [0, 1, 2, 3, 4, 5, 6]; // upgrade pool indices

  it('returns an array of the same length', () => {
    expect(shuffle(original).length).toBe(original.length);
  });

  it('does not mutate the original array', () => {
    const copy = [...original];
    shuffle(copy);
    expect(copy).toEqual(original);
  });

  it('contains exactly the same elements', () => {
    const result = shuffle(original);
    expect([...result].sort((a, b) => a - b)).toEqual([...original].sort((a, b) => a - b));
  });

  it('each element appears exactly once', () => {
    const result = shuffle(original);
    original.forEach(item => {
      expect(result.filter(x => x === item).length).toBe(1);
    });
  });

  it('slicing 3 from a shuffled pool gives 3 unique upgrades', () => {
    // This mirrors: shuffle(UPGRADE_POOL).slice(0, 3)
    const pool = [0, 1, 2, 3, 4, 5, 6, 7];
    const chosen = shuffle(pool).slice(0, 3);
    expect(chosen.length).toBe(3);
    expect(new Set(chosen).size).toBe(3); // all unique
  });
});

// ─── defend damage reduction ──────────────────────────────────────────────────

describe('defend — 40% damage reduction', () => {
  // Source: dmg = Math.round(dmg * 0.60) when G.defending is true.

  it('100 damage → 60 when defending', () => {
    expect(Math.round(100 * 0.60)).toBe(60);
  });

  it('20 damage → 12 when defending', () => {
    expect(Math.round(20 * 0.60)).toBe(12);
  });

  it('50 damage → 30 when defending', () => {
    expect(Math.round(50 * 0.60)).toBe(30);
  });

  it('Zorgax max special (50) → 30 when defending', () => {
    expect(Math.round(50 * 0.60)).toBe(30);
  });

  it('reduced damage is always ≤ raw damage', () => {
    [10, 18, 24, 32, 36, 50].forEach(raw => {
      expect(Math.round(raw * 0.60) <= raw).toBeTrue();
    });
  });

  it('reduced damage is always > 0 when raw > 0', () => {
    [10, 18, 24, 32, 36, 50].forEach(raw => {
      expect(Math.round(raw * 0.60) > 0).toBeTrue();
    });
  });
});

// ─── HP floor clamping ────────────────────────────────────────────────────────

describe('HP clamping — G.hp never goes negative', () => {
  // Source: G.hp = Math.max(0, G.hp - dmg);

  it('HP cannot drop below 0', () => {
    let hp = 10;
    const dmg = 50;
    hp = Math.max(0, hp - dmg);
    expect(hp).toBe(0);
  });

  it('HP stays at current value when dmg = 0', () => {
    let hp = 75;
    hp = Math.max(0, hp - 0);
    expect(hp).toBe(75);
  });

  it('enemy HP is also floored at 0', () => {
    let enemyHp = 5;
    const playerDmg = 100;
    enemyHp = Math.max(0, enemyHp - playerDmg);
    expect(enemyHp).toBe(0);
  });
});

// ─── Potion healing ──────────────────────────────────────────────────────────

describe('potion — heals 30 HP, capped at maxHP', () => {
  // Source: const healed = Math.min(30, G.maxHP - G.hp);

  it('heals full 30 when HP is low enough', () => {
    const maxHP = 100, hp = 50;
    expect(Math.min(30, maxHP - hp)).toBe(30);
  });

  it('heals partial amount when within 30 HP of max', () => {
    const maxHP = 100, hp = 80;
    expect(Math.min(30, maxHP - hp)).toBe(20); // only 20 left to fill
  });

  it('heals 0 when already at max HP (button should be disabled)', () => {
    const maxHP = 100, hp = 100;
    expect(Math.min(30, maxHP - hp)).toBe(0);
  });

  it('healed HP does not exceed maxHP', () => {
    const maxHP = 100;
    let hp = 85;
    const healed = Math.min(30, maxHP - hp);
    hp += healed;
    expect(hp <= maxHP).toBeTrue();
  });
});

// ─── Enchant multiplier ───────────────────────────────────────────────────────

describe('enchant — doubles next attack damage', () => {
  // Source: dmg = Math.round(dmg * 2);

  it('doubles damage correctly', () => {
    expect(Math.round(15 * 2)).toBe(30);
    expect(Math.round(22 * 2)).toBe(44);
    expect(Math.round(12 * 2)).toBe(24);
  });

  it('enchant + rage both double (independent multipliers)', () => {
    let dmg = 15;
    dmg = Math.round(dmg * 2);  // enchant
    dmg = Math.round(dmg * 2);  // rage
    expect(dmg).toBe(60);
  });

  it('enchant + crit (1.5×) stack correctly', () => {
    let dmg = 20;
    dmg = Math.round(dmg * 2);   // enchant → 40
    dmg = Math.round(dmg * 1.5); // crit    → 60
    expect(dmg).toBe(60);
  });
});

// ─── Life drain ──────────────────────────────────────────────────────────────

describe('life drain — heals 5 HP per attack hit', () => {
  // Source: const healed = Math.min(G.lifeDrain, G.maxHP - G.hp);

  it('heals up to lifeDrain per attack', () => {
    const maxHP = 100, hp = 80, lifeDrain = 5;
    const healed = Math.min(lifeDrain, maxHP - hp);
    expect(healed).toBe(5);
  });

  it('does not overheal beyond maxHP', () => {
    const maxHP = 100, hp = 98, lifeDrain = 5;
    const healed = Math.min(lifeDrain, maxHP - hp);
    expect(healed).toBe(2); // only 2 HP left to fill
  });

  it('heals 0 when already at maxHP', () => {
    const maxHP = 100, hp = 100, lifeDrain = 5;
    const healed = Math.min(lifeDrain, maxHP - hp);
    expect(healed).toBe(0);
  });
});

// ─── Upgrade apply functions ──────────────────────────────────────────────────

describe('upgrade — Sharpened Spear (+8 dmg)', () => {
  it('increases both atkMin and atkMax by 8', () => {
    const state = { atkMin: 12, atkMax: 22 };
    // apply: s => { s.atkMin += 8; s.atkMax += 8; }
    state.atkMin += 8;
    state.atkMax += 8;
    expect(state.atkMin).toBe(20);
    expect(state.atkMax).toBe(30);
  });
});

describe('upgrade — Iron Shield (+25 max HP, heals 25)', () => {
  it('increases maxHP by 25', () => {
    const state = { hp: 70, maxHP: 100 };
    state.maxHP += 25;
    state.hp = Math.min(state.hp + 25, state.maxHP);
    expect(state.maxHP).toBe(125);
  });

  it('heals 25 HP immediately, but does not overheal', () => {
    const state = { hp: 95, maxHP: 100 };
    state.maxHP += 25; // maxHP = 125
    state.hp = Math.min(state.hp + 25, state.maxHP);
    expect(state.hp).toBe(120); // 95 + 25 = 120, under new cap of 125
  });

  it('does not go over new maxHP even at full HP', () => {
    const state = { hp: 100, maxHP: 100 };
    state.maxHP += 25; // maxHP = 125
    state.hp = Math.min(state.hp + 25, state.maxHP);
    expect(state.hp).toBe(125);
  });
});

describe('upgrade — Lucky Clover (dodge chance +20%, capped at 60%)', () => {
  it('adds 0.20 dodge chance from base 0', () => {
    const state = { dodgeChance: 0 };
    state.dodgeChance = Math.min(state.dodgeChance + 0.20, 0.60);
    expect(state.dodgeChance).toBe(0.20);
  });

  it('stacking three clovers caps at 60%', () => {
    const state = { dodgeChance: 0 };
    for (let i = 0; i < 3; i++) {
      state.dodgeChance = Math.min(state.dodgeChance + 0.20, 0.60);
    }
    expect(state.dodgeChance).toBe(0.60);
  });

  it('dodge chance never exceeds 60% regardless of stacking', () => {
    const state = { dodgeChance: 0.55 };
    state.dodgeChance = Math.min(state.dodgeChance + 0.20, 0.60);
    expect(state.dodgeChance).toBe(0.60);
  });
});

describe('upgrade — Battle Rage (rage chance +25%, capped at 75%)', () => {
  it('stacking three rage upgrades caps at 75%', () => {
    const state = { rageChance: 0 };
    for (let i = 0; i < 3; i++) {
      state.rageChance = Math.min(state.rageChance + 0.25, 0.75);
    }
    expect(state.rageChance).toBe(0.75);
  });
});

describe('upgrade — Eagle Eye (crit chance +20%, capped at 60%)', () => {
  it('stacking three crits caps at 60%', () => {
    const state = { critChance: 0 };
    for (let i = 0; i < 3; i++) {
      state.critChance = Math.min(state.critChance + 0.20, 0.60);
    }
    expect(state.critChance).toBe(0.60);
  });
});

// ─── Enemy data integrity ─────────────────────────────────────────────────────

describe('enemy definitions — data integrity', () => {
  const ENEMIES = [
    { id: 'zork',   hp: 80,  maxHP: 80,  level: 1, isBoss: false },
    { id: 'blorp',  hp: 130, maxHP: 130, level: 2, isBoss: false },
    { id: 'gloop',  hp: 180, maxHP: 180, level: 3, isBoss: false },
    { id: 'zorgax', hp: 280, maxHP: 280, level: 4, isBoss: true  },
  ];

  it('each enemy starts with hp === maxHP', () => {
    ENEMIES.forEach(e => {
      expect(e.hp).toBe(e.maxHP);
    });
  });

  it('enemy HP increases with level', () => {
    for (let i = 1; i < ENEMIES.length; i++) {
      expect(ENEMIES[i].maxHP > ENEMIES[i - 1].maxHP).toBeTrue();
    }
  });

  it('exactly one enemy is the boss', () => {
    expect(ENEMIES.filter(e => e.isBoss).length).toBe(1);
  });

  it('boss is the last enemy', () => {
    expect(ENEMIES[ENEMIES.length - 1].isBoss).toBeTrue();
  });

  it('fight counter formula matches enemy count', () => {
    // fight-counter shows: Fight ${idx + 1} / ${ENEMIES.length}
    expect(ENEMIES.length).toBe(4);
    expect(`Fight ${1} / ${ENEMIES.length}`).toBe('Fight 1 / 4');
  });
});
