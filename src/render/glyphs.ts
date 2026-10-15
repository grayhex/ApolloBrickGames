/**
 * Нейтральные заглушки 8×8 (монохром). Это НЕ графика оригинала: просто различимые
 * формы, чтобы проверять движок. В каталоге ресурсов их можно заменить PNG/SVG.
 */
const GLYPHS: Record<string, readonly string[]> = {
  block: ['########', '#......#', '#.####.#', '#.#..#.#', '#.#..#.#', '#.####.#', '#......#', '########'],
  platform: ['########', '#.#.#.#.', '########', '........', '........', '........', '........', '........'],
  deco: ['........', '..#..#..', '........', '....#...', '........', '.#....#.', '........', '........'],
  hero: ['...###..', '..####..', '..#.###.', '...###..', '..####..', '.#.##.#.', '...##...', '..#..#..'],
  life: ['........', '.##..##.', '########', '########', '.######.', '..####..', '...##...', '........'],
  projectile: ['........', '.##..##.', '########', '########', '.######.', '..####..', '...##...', '........'],
  target: ['########', '#......#', '#.#..#.#', '#..##..#', '#..##..#', '#.#..#.#', '#......#', '########'],
  patroller: ['..####..', '.######.', '##.##.##', '########', '########', '.##..##.', '.##..##.', '##....##'],
  hazard: ['........', '........', '#..#..#.', '#..#..#.', '##.##.##', '##.##.##', '########', '########'],
  finish: ['.#####..', '.#####..', '.#####..', '.#......', '.#......', '.#......', '.#......', '####....'],
  unknown: ['#.#.#.#.', '.#.#.#.#', '#.#.#.#.', '.#.#.#.#', '#.#.#.#.', '.#.#.#.#', '#.#.#.#.', '.#.#.#.#'],
};

export const GLYPH_NAMES: readonly string[] = Object.keys(GLYPHS);

const GLYPH_SIZE = 8;
const cache = new Map<string, HTMLCanvasElement>();

function glyphCanvas(name: string, size: number, ink: string, flipX: boolean): HTMLCanvasElement {
  const key = `${name}|${size}|${ink}|${flipX ? 1 : 0}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const rows = GLYPHS[name] ?? GLYPHS['unknown'] ?? [];
    const unit = size / GLYPH_SIZE;
    ctx.fillStyle = ink;
    rows.forEach((row, py) => {
      for (let px = 0; px < GLYPH_SIZE; px++) {
        if (row[px] !== '#') continue;
        const x = flipX ? GLYPH_SIZE - 1 - px : px;
        ctx.fillRect(x * unit, py * unit, unit, unit);
      }
    });
  }
  cache.set(key, canvas);
  return canvas;
}

/** Рисует заглушку в квадрат size×size логических пикселей. Неизвестное имя → глиф unknown. */
export function drawGlyph(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  size: number,
  ink: string,
  flipX = false,
): void {
  ctx.drawImage(glyphCanvas(name, size, ink, flipX), x, y);
}
