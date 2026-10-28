import { describe, expect, it } from 'vitest';
import { DEVICE_FACTS, SOURCE_ORDER } from '../../src/app/deviceFacts';
import { TOY_IDS } from '../../src/app/toys';
import { MESSAGES } from '../../src/app/messages';

describe('сведения для карточки устройства', () => {
  it('есть у каждой игрушки; источники из известного набора, без повторов', () => {
    for (const id of TOY_IDS) {
      const facts = DEVICE_FACTS[id];
      expect(facts, id).toBeDefined();
      expect(new Set(facts.sources).size, `${id}: источники без повторов`).toBe(facts.sources.length);
      for (const source of facts.sources) expect(SOURCE_ORDER, `${id}: ${source}`).toContain(source);
      expect(facts.sources.length, `${id}: хотя бы один источник`).toBeGreaterThan(0);
    }
  });

  it('год и питание — строки или null; вариации — положительное число или null; названия игр на двух языках', () => {
    for (const id of TOY_IDS) {
      const facts = DEVICE_FACTS[id];
      expect(facts.year === null || /^\d{4}$/.test(facts.year), `${id}: год`).toBe(true);
      expect(facts.power === null || facts.power.trim().length > 0, `${id}: питание`).toBe(true);
      expect(facts.variations === null || (Number.isInteger(facts.variations) && facts.variations > 0), `${id}: вариации`).toBe(true);
      for (const game of facts.games) {
        expect(game.ru.trim().length, `${id}: ${game.en}`).toBeGreaterThan(0);
        expect(game.en.trim().length, `${id}: ${game.ru}`).toBeGreaterThan(0);
      }
    }
  });

  it('число вариаций совпадает с «N in 1» на корпусе там, где оно напечатано', () => {
    expect(DEVICE_FACTS.tank168.variations).toBe(168);
    expect(DEVICE_FACTS['apollo-b0202'].variations).toBe(126);
    expect(DEVICE_FACTS.e88.variations).toBe(8);
    expect(DEVICE_FACTS.e23.variations).toBe(96);
    expect(DEVICE_FACTS['apollo-b0302'].variations).toBe(18);
    expect(DEVICE_FACTS.minibrick.variations).toBe(96);
    expect(DEVICE_FACTS.alibaba.variations).toBe(99);
    expect(DEVICE_FACTS.taksun.variations).toBe(9999);
    expect(DEVICE_FACTS.fm38.variations).toBe(2);
    expect(DEVICE_FACTS.prince118.variations).toBe(118);
  });

  it('у каждого источника есть подпись и подсказка на двух языках', () => {
    for (const lang of ['ru', 'en'] as const) {
      for (const kind of SOURCE_ORDER) {
        const messages = MESSAGES[lang] as Record<string, string>;
        expect(messages[`dcard.src.${kind}`], `${lang} ${kind}`).toBeTruthy();
        expect(messages[`dcard.src.${kind}.title`], `${lang} ${kind} title`).toBeTruthy();
      }
    }
  });
});
