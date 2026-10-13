import type { Pilot } from './pilot';

/** Полное прохождение демо-пакета: оба участка, выстрелы, прыжки, финиш. */
export function playDemoWalkthrough(p: Pilot): void {
  const hero = () => p.state.hero;
  const obj = (id: string) => p.state.objects.find((o) => o.id === id);

  p.tick([], ['start']);

  // ── Участок 1 ────────────────────────────────────────────────────────────
  p.until(() => hero().x >= 8, ['right']); // подойти к низкой стенке (x=9..10)
  p.tick();
  p.until(() => hero().x >= 12, ['right'], ['jump']); // перепрыгнуть стенку
  p.settle();
  p.until(() => hero().x >= 13, ['right']); // край ямы (x=14..16)
  p.tick();
  p.until(() => hero().x >= 18, ['right'], ['jump']); // перепрыгнуть яму
  p.settle();
  p.until(() => hero().x >= 19, ['right']); // упереться в мишень (x=20)
  p.until(() => obj('target-1')?.active === false, ['fire'], ['fire']); // разрушить мишень
  p.until(() => hero().x >= 24, ['right']); // вход в коридор с потолком
  p.tick();
  p.until(() => obj('patrol-1')?.active === false, ['fire'], ['fire'], 200); // снять патруль
  p.until(() => hero().x >= 34, ['right']); // перед опасной областью (x=35..36)
  p.tick();
  p.tick([], ['jump']); // подняться, не сходя с места
  p.until(() => hero().x >= 37, ['right']); // над областью
  p.settle();
  p.until(() => p.state.levelId === 'demo-2', ['right']); // финиш (x=38)

  // ── Участок 2 ────────────────────────────────────────────────────────────
  p.until(() => hero().x >= 3, ['right']);
  p.tick();
  p.tick([], ['jump']);
  p.ticks(5);
  p.until(() => hero().x >= 4, ['right']); // на платформу A
  p.settle();
  p.until(() => hero().x >= 7, ['right']);
  p.tick();
  p.tick([], ['jump']);
  p.ticks(5);
  p.until(() => hero().x >= 9, ['right']); // на платформу B
  p.settle();
  p.until(() => hero().x <= 9, ['left']);
  p.tick();
  p.tick([], ['jump']);
  p.ticks(5);
  p.until(() => hero().x <= 7, ['left']); // на платформу C
  p.settle();
  p.until(() => obj('patrol-2')?.active === false, ['fire'], ['fire'], 200); // патруль на C
  p.tick();
  p.tick([], ['jump']);
  p.ticks(5);
  p.until(() => hero().x >= 9, ['right']); // на платформу D
  p.settle();
  p.until(() => p.state.phase === 'completed', ['right']); // финиш (x=11, y=0)
}
