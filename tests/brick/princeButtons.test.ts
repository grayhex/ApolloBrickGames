import { describe, expect, it } from 'vitest';
import { PRINCE_BUTTONS } from '../../src/brick/guides/prince';

describe('Prince 皇太子: справка по кнопкам корпуса', () => {
  it('девять кнопок с иероглифами корпуса, чтением, подписью и описанием на двух языках', () => {
    expect(PRINCE_BUTTONS).toHaveLength(9);
    expect(PRINCE_BUTTONS.map((button) => button.glyph.replace('\n', ''))).toEqual(['旋转', '上', '下', '左', '右', '开始暂停', '复位', '声音', '开关']);
    for (const button of PRINCE_BUTTONS) {
      expect(button.pinyin).toMatch(/\S/);
      expect(button.cap).toMatch(/\S/);
      expect(button.text.ru).toMatch(/[а-я]/i);
      expect(button.text.en).toMatch(/[a-z]/i);
    }
  });

  it('клавиши клавиатуры совпадают с привязками проекта: стрелки и WASD, Space/Z — поворот, X — сброс, Enter/P — старт и пауза', () => {
    const keys = Object.fromEntries(PRINCE_BUTTONS.map((button) => [button.cap, button.keys]));
    expect(keys['ROTATE']).toBe('Space · Z');
    expect(keys['RESET']).toBe('X');
    expect(keys['START/PAUSE']).toBe('Enter · P');
    expect(keys['↑']).toBe('↑ · W');
  });
});
