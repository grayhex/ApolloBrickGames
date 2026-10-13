import { describe, expect, it } from 'vitest';
import { levelToJson } from '../../src/content/serialize';
import { validateLevel } from '../../src/content/validate';
import { createContext, Game, makeFrame } from '../../src/core';
import { diagnose, diagnoseForTest, errorsOf, gameLevelJson, levelFromDoc } from '../../src/editor/diagnose';
import { fillRect, setCells } from '../../src/editor/grid';
import { addMark, addObject, setStart, updateObject } from '../../src/editor/ops';
import { makeTestPack } from '../../src/editor/testPack';
import { demoRoomDoc, env, freshDoc, pack } from './helpers';

describe('диагностика: проверка общим валидатором игры с адресами проблем', () => {
  it('шаблон и demo-room не содержат ошибок', () => {
    expect(diagnose(freshDoc(), env)).toEqual([]);
    expect(errorsOf(diagnose(demoRoomDoc(), env))).toEqual([]);
  });

  it('игровой JSON из документа совпадает с исходным уровнем demo-room и проходит общий валидатор', () => {
    const level = pack.levels[0];
    if (!level) throw new Error('нет уровня');
    const json = gameLevelJson(demoRoomDoc());
    expect(json).toEqual(levelToJson(level));
    expect(validateLevel(json, pack.assets, env.validation)).toEqual(level);
  });

  it('старт внутри земли указывает на клетку старта', () => {
    const doc = setStart(freshDoc(), { x: 4, y: 5 });
    const problems = errorsOf(diagnose(doc, env));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ path: '$.start', cell: { x: 4, y: 5 } });
    expect(problems[0]?.message).toMatch(/занят/);
  });

  it('старт не задан — отдельная ошибка; заглушка старта не создаёт ложных', () => {
    const doc = setStart(freshDoc(), null);
    const problems = errorsOf(diagnose(doc, env));
    expect(problems.map((p) => p.message)).toEqual(['точка старта не задана']);
  });

  it('неизвестный тип объекта: ошибка с идентификатором и клеткой, объект остаётся в документе', () => {
    let doc = addObject(freshDoc(), { type: 'dragon', x: 6, y: 3 }).doc;
    doc = updateObject(doc, 'dragon-1', { asset: 'не-существует' });
    const problems = errorsOf(diagnose(doc, env));
    expect(problems.some((p) => p.path === '$.objects[0].type' && p.objectId === 'dragon-1' && p.cell?.x === 6)).toBe(true);
    expect(problems.some((p) => p.path === '$.objects[0].asset')).toBe(true);
    expect(doc.objects[0]?.type).toBe('dragon');
  });

  it('неизвестный символ в rows: ошибка указывает на клетку', () => {
    const doc = { ...freshDoc(), rows: freshDoc().rows.map((row, y) => (y === 2 ? `${row.slice(0, 4)}?${row.slice(5)}` : row)) };
    const problems = errorsOf(diagnose(doc, env));
    expect(problems[0]).toMatchObject({ path: '$.rows[2][4]', cell: { x: 4, y: 2 } });
  });

  it('пометки: «неизвестно» и «предположение» — предупреждения, а не ошибки; в игровом JSON они сохраняются', () => {
    let doc = freshDoc();
    doc = addMark(doc, { x: 2, y: 0, w: 2, h: 2 }, 'unknown', 'не видно на фото', 'Кадр 1')?.doc ?? doc;
    doc = addMark(doc, { x: 6, y: 3, w: 1, h: 1 }, 'assumed', 'похоже на блок')?.doc ?? doc;
    const problems = diagnose(doc, env);
    expect(errorsOf(problems)).toEqual([]);
    expect(problems.filter((p) => p.severity === 'warning')).toHaveLength(2);
    const marks = gameLevelJson(doc)['marks'] as Record<string, unknown>[];
    expect(marks).toEqual([
      { id: 'mark-1', x: 2, y: 0, w: 2, h: 2, status: 'unknown', note: 'не видно на фото', ref: 'Кадр 1' },
      { id: 'mark-2', x: 6, y: 3, status: 'assumed', note: 'похоже на блок' },
    ]);
    // Круговой тест: JSON → уровень → JSON.
    const level = validateLevel(gameLevelJson(doc), pack.assets, env.validation);
    expect(level.marks).toHaveLength(2);
    expect(levelToJson(level)).toEqual(gameLevelJson(doc));
  });

  it('метка за пределами карты — ошибка валидатора с адресом пометки', () => {
    const doc = { ...freshDoc(), marks: [{ id: 'm', x: 12, y: 5, w: 3, h: 1, status: 'unknown' as const, note: '', ref: '' }] };
    const problems = errorsOf(diagnose(doc, env));
    expect(problems[0]).toMatchObject({ path: '$.marks[0]', markId: 'm' });
  });

  it('для теста переходы на другие уровни — ошибка', () => {
    let doc = addObject(freshDoc(), { type: 'finish', x: 10, y: 4 }).doc;
    doc = { ...doc, transitions: [{ from: 'finish-1', to: 'next-level' }] };
    expect(errorsOf(diagnose(doc, env))).toEqual([]);
    const test = errorsOf(diagnoseForTest(doc, env));
    expect(test[0]).toMatchObject({ path: '$.transitions[0].to', objectId: 'finish-1' });
  });
});

describe('тестовый запуск на ядре игры', () => {
  it('копия карты из памяти с несохранёнными изменениями запускается на том же ядре; документ не меняется', () => {
    let doc = freshDoc();
    doc = fillRect(doc, { x: 4, y: 4, w: 1, h: 1 }, '#'); // ступенька, не попавшая ни в какой файл
    const before = JSON.stringify(doc);
    const level = structuredClone(levelFromDoc(doc));
    const testPack = makeTestPack(pack, level);
    expect(testPack.manifest.firstLevel).toBe('test-room');
    expect(testPack.levels).toHaveLength(1);

    const game = new Game(createContext(testPack), 1);
    game.step(makeFrame({ pressed: ['start'] }));
    for (let i = 0; i < 6; i++) game.step(makeFrame({ held: ['right'], pressed: i === 0 ? ['right'] : [] }));
    // Герой упёрся в ступеньку: x не ушёл дальше клетки перед ней.
    expect(game.state.hero.x).toBeLessThan(4);
    expect(JSON.stringify(doc)).toBe(before);
    expect(JSON.stringify(levelFromDoc(doc))).toBe(JSON.stringify(level));
  });

  it('«Тест отсюда»: подмена старта в копии не меняет сохранённую точку', () => {
    const doc = freshDoc();
    const level = { ...structuredClone(levelFromDoc(doc)), start: { x: 8, y: 4 } };
    const game = new Game(createContext(makeTestPack(pack, level)), 1);
    expect(game.state.hero.x).toBe(8);
    expect(doc.start).toEqual({ x: 1, y: 4 });
  });

  it('setCells + диагностика: земля поверх старта делает документ непригодным для теста, но не стирает его', () => {
    const doc = setCells(freshDoc(), [{ x: 1, y: 4, char: '#' }]);
    expect(errorsOf(diagnoseForTest(doc, env)).length).toBeGreaterThan(0);
    expect(doc.start).toEqual({ x: 1, y: 4 });
  });
});
