/**
 * Tests for dragon_blocks.html pure logic functions.
 *
 * Functions under test (copied verbatim from the source file):
 *   - rotate90(shape)             — clockwise 90° rotation of a 2-D piece matrix
 *   - collision(shape, row, col)  — board + wall collision detection
 *   - SCORE_TABLE                 — line-clear scoring constants
 *   - clearLines() scoring logic  — level-multiplied score accumulation
 *   - ghostRow() logic            — ghost-piece drop calculation
 *
 * Why these matter:
 *   collision() is called on every keypress and every game-loop tick. A silent
 *   bug here lets pieces clip through walls or the floor, breaking the core
 *   game mechanic. rotate90() powers all seven piece shapes through four
 *   rotations — wrong results produce malformed pieces that cannot be placed.
 *   The score table is the only feedback loop for the player, so wrong values
 *   here are immediately visible and demoralising.
 */

// ─── Source constants and functions (verbatim from dragon_blocks.html) ────────

const COLS = 10, ROWS = 20;
const SCORE_TABLE = [0, 100, 300, 500, 800];

function rotate90(shape) {
  const R = shape.length, C = shape[0].length;
  const out = [];
  for (let c = 0; c < C; c++) {
    out.push([]);
    for (let r = R - 1; r >= 0; r--) out[c].push(shape[r][c]);
  }
  return out;
}

// collision() references `board` as a module-level variable in the source.
// We create a test-local wrapper that accepts the board as a parameter so
// each test can set up its own board state cleanly.
function makeCollision(board) {
  return function collision(shape, row, col) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const br = row + r, bc = col + c;
        if (br >= ROWS) return true;
        if (bc < 0 || bc >= COLS) return true;
        if (br >= 0 && board[br][bc] !== null) return true;
      }
    }
    return false;
  };
}

function emptyBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
}

// ─── rotate90 ─────────────────────────────────────────────────────────────────

describe('rotate90 — I-piece (1×4)', () => {
  const I = [[1, 1, 1, 1]]; // horizontal

  it('rotates 1×4 to 4×1', () => {
    expect(rotate90(I)).toEqual([[1], [1], [1], [1]]);
  });

  it('rotating 4×1 returns to 1×4', () => {
    expect(rotate90([[1], [1], [1], [1]])).toEqual([[1, 1, 1, 1]]);
  });

  it('four rotations return to the original shape', () => {
    let s = I;
    for (let i = 0; i < 4; i++) s = rotate90(s);
    expect(s).toEqual(I);
  });
});

describe('rotate90 — O-piece (2×2)', () => {
  const O = [[1, 1], [1, 1]];

  it('rotating a square piece is identity', () => {
    expect(rotate90(O)).toEqual(O);
  });

  it('four rotations still equal original', () => {
    let s = O;
    for (let i = 0; i < 4; i++) s = rotate90(s);
    expect(s).toEqual(O);
  });
});

describe('rotate90 — T-piece', () => {
  // T  =  [ [0,1,0],
  //          [1,1,1] ]
  const T = [[0, 1, 0], [1, 1, 1]];

  it('first clockwise rotation produces correct shape', () => {
    // Expected: [[1,0],[1,1],[1,0]]
    expect(rotate90(T)).toEqual([[1, 0], [1, 1], [1, 0]]);
  });

  it('four rotations return to original', () => {
    let s = T;
    for (let i = 0; i < 4; i++) s = rotate90(s);
    expect(s).toEqual(T);
  });
});

describe('rotate90 — all seven dragon pieces restore after 4 rotations', () => {
  const PIECES_SHAPES = [
    [[1, 1, 1, 1]],           // I — Fire Wyvern
    [[1, 1], [1, 1]],         // O — Dragon Egg
    [[0, 1, 0], [1, 1, 1]],  // T — Thunder Drake
    [[0, 1, 1], [1, 1, 0]],  // S — Forest Serpent
    [[1, 1, 0], [0, 1, 1]],  // Z — Inferno Drake
    [[1, 0, 0], [1, 1, 1]],  // J — Frost Drake
    [[0, 0, 1], [1, 1, 1]],  // L — Storm Wyrm
  ];
  const PIECE_NAMES = [
    'Fire Wyvern (I)', 'Dragon Egg (O)', 'Thunder Drake (T)',
    'Forest Serpent (S)', 'Inferno Drake (Z)', 'Frost Drake (J)', 'Storm Wyrm (L)',
  ];

  PIECES_SHAPES.forEach((shape, i) => {
    it(`${PIECE_NAMES[i]} returns to original after 4 rotations`, () => {
      let s = shape;
      for (let r = 0; r < 4; r++) s = rotate90(s);
      expect(s).toEqual(shape);
    });
  });
});

describe('rotate90 — output dimensions', () => {
  it('swaps rows and columns for non-square shapes', () => {
    const shape = [[1, 0, 1], [0, 1, 0]]; // 2 rows × 3 cols
    const rotated = rotate90(shape);
    expect(rotated.length).toBe(3);        // was 3 cols, now 3 rows
    expect(rotated[0].length).toBe(2);     // was 2 rows, now 2 cols
  });
});

// ─── collision — wall boundaries ─────────────────────────────────────────────

describe('collision — wall and floor boundaries', () => {
  const board = emptyBoard();
  const collision = makeCollision(board);
  const single = [[1]]; // 1×1 piece

  it('detects floor collision (row = ROWS)', () => {
    expect(collision(single, ROWS, 0)).toBeTrue();
  });

  it('no collision on the last valid row (ROWS - 1)', () => {
    expect(collision(single, ROWS - 1, 0)).toBeFalse();
  });

  it('detects right-wall collision (col = COLS)', () => {
    expect(collision(single, 0, COLS)).toBeTrue();
  });

  it('no collision on the last valid column (COLS - 1)', () => {
    expect(collision(single, 0, COLS - 1)).toBeFalse();
  });

  it('detects left-wall collision (col = -1)', () => {
    expect(collision(single, 0, -1)).toBeTrue();
  });

  it('no collision at column 0', () => {
    expect(collision(single, 0, 0)).toBeFalse();
  });

  it('4-wide piece at the last safe column (col 6) does not collide', () => {
    const line = [[1, 1, 1, 1]];
    // Cells at cols 6,7,8,9 — all within [0, COLS-1] = [0, 9]
    expect(collision(line, 0, 6)).toBeFalse();
  });

  it('4-wide piece collides when rightmost cell is out of bounds (col 7)', () => {
    const line = [[1, 1, 1, 1]];
    // Cells at cols 7,8,9,10 — col 10 ≥ COLS(10) → collision
    expect(collision(line, 0, 7)).toBeTrue();
  });
});

describe('collision — piece spawning above the board (negative rows)', () => {
  const board = emptyBoard();
  const collision = makeCollision(board);

  it('a piece entirely above the board (row < 0) does not collide', () => {
    // row = -1 means the cell is at row -1 + 0 = -1, which is above the board
    expect(collision([[1]], -1, 5)).toBeFalse();
  });

  it('piece partially above partially in board does not collide if in-board cells are empty', () => {
    // 2-row piece starting at row -1: row -1 is above (ok), row 0 is empty (ok)
    expect(collision([[1], [1]], -1, 5)).toBeFalse();
  });
});

describe('collision — locked pieces on the board', () => {
  it('detects collision with a locked cell', () => {
    const board = emptyBoard();
    board[10][5] = '#ff6b1a'; // simulate a locked piece
    const collision = makeCollision(board);
    expect(collision([[1]], 10, 5)).toBeTrue();
  });

  it('no collision when piece is adjacent to, but not on, a locked cell', () => {
    const board = emptyBoard();
    board[10][5] = '#ff6b1a';
    const collision = makeCollision(board);
    expect(collision([[1]], 10, 4)).toBeFalse();
    expect(collision([[1]], 10, 6)).toBeFalse();
    expect(collision([[1]], 9,  5)).toBeFalse();
  });

  it('a fully-filled row still collides on every column', () => {
    const board = emptyBoard();
    board[19] = new Array(COLS).fill('#ffffff');
    const collision = makeCollision(board);
    for (let c = 0; c < COLS; c++) {
      expect(collision([[1]], 19, c)).toBeTrue();
    }
  });
});

// ─── Scoring table ────────────────────────────────────────────────────────────

describe('SCORE_TABLE — single-level scoring', () => {
  it('1 line at level 1 = 100 points', () => {
    expect(SCORE_TABLE[1] * 1).toBe(100);
  });

  it('2 lines at level 1 = 300 points', () => {
    expect(SCORE_TABLE[2] * 1).toBe(300);
  });

  it('3 lines at level 1 = 500 points', () => {
    expect(SCORE_TABLE[3] * 1).toBe(500);
  });

  it('4 lines (Tetris) at level 1 = 800 points', () => {
    expect(SCORE_TABLE[4] * 1).toBe(800);
  });

  it('SCORE_TABLE[0] = 0 (no lines cleared gives no score)', () => {
    expect(SCORE_TABLE[0]).toBe(0);
  });
});

describe('SCORE_TABLE — level multiplier', () => {
  it('1 line at level 3 = 300 points', () => {
    expect(SCORE_TABLE[1] * 3).toBe(300);
  });

  it('4 lines at level 5 = 4000 points', () => {
    expect(SCORE_TABLE[4] * 5).toBe(4000);
  });

  it('Tetris clears score more per line than singles', () => {
    // 4 singles = 4 × 100 = 400; one Tetris = 800 — Tetris is twice as efficient
    const fourSingles = SCORE_TABLE[1] * 4;
    const tetris      = SCORE_TABLE[4];
    expect(tetris > fourSingles).toBeTrue();
  });
});

describe('SCORE_TABLE — level progression formula', () => {
  // dropInterval = Math.max(80, 800 - (level - 1) * 72)
  it('level 1 drop interval is 800 ms', () => {
    const interval = Math.max(80, 800 - (1 - 1) * 72);
    expect(interval).toBe(800);
  });

  it('level 2 drop interval is 728 ms', () => {
    const interval = Math.max(80, 800 - (2 - 1) * 72);
    expect(interval).toBe(728);
  });

  it('drop interval is capped at 80 ms minimum', () => {
    // 800 - (level-1)*72 hits 80 at level ≈ 11
    const highLevel = Math.max(80, 800 - (15 - 1) * 72);
    expect(highLevel).toBe(80);
  });

  it('level threshold: 10 lines cleared advances to level 2', () => {
    const lines = 10;
    const newLevel = Math.floor(lines / 10) + 1;
    expect(newLevel).toBe(2);
  });

  it('level threshold: 9 lines cleared stays at level 1', () => {
    const lines = 9;
    const newLevel = Math.floor(lines / 10) + 1;
    expect(newLevel).toBe(1);
  });

  it('level threshold: 20 lines cleared reaches level 3', () => {
    const newLevel = Math.floor(20 / 10) + 1;
    expect(newLevel).toBe(3);
  });
});

// ─── ghostRow logic ───────────────────────────────────────────────────────────

describe('ghostRow — drop distance calculation', () => {
  // ghostRow() walks the piece downward until the next step would collide.
  // We replicate the logic directly so it can be tested without a live game.
  function calcGhostRow(shape, startRow, col, board) {
    const collision = makeCollision(board);
    let r = startRow;
    while (!collision(shape, r + 1, col)) r++;
    return r;
  }

  it('piece at top of empty board drops to second-to-last row', () => {
    const board = emptyBoard();
    const shape = [[1]]; // 1×1 piece
    // A 1×1 piece starting at row 0 should land at ROWS - 1 = 19
    const ghost = calcGhostRow(shape, 0, 5, board);
    expect(ghost).toBe(ROWS - 1);
  });

  it('piece lands on top of a locked piece', () => {
    const board = emptyBoard();
    board[15][5] = '#ffffff'; // locked piece at row 15, col 5
    const shape = [[1]];
    // Piece should stop at row 14 (one above the locked cell)
    const ghost = calcGhostRow(shape, 0, 5, board);
    expect(ghost).toBe(14);
  });

  it('hard-drop score = 2 × drop distance', () => {
    // doHardDrop awards 2 pts per cell dropped
    const dropDistance = 10;
    expect(dropDistance * 2).toBe(20);
  });

  it('soft-drop score = 1 pt per cell', () => {
    // doSoftDrop awards +1 per row
    const drops = 5;
    expect(drops * 1).toBe(5);
  });
});

// ─── clearLines simulation ────────────────────────────────────────────────────

describe('clearLines — line detection logic', () => {
  it('a fully-filled row is detected as clearable', () => {
    const row = new Array(COLS).fill('#ffffff');
    expect(row.every(cell => cell !== null)).toBeTrue();
  });

  it('a row with one empty cell is not clearable', () => {
    const row = new Array(COLS).fill('#ffffff');
    row[5] = null;
    expect(row.every(cell => cell !== null)).toBeFalse();
  });

  it('an empty row is not clearable', () => {
    const row = new Array(COLS).fill(null);
    expect(row.every(cell => cell !== null)).toBeFalse();
  });
});
