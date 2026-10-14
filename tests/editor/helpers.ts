import { levelOf, loadRoomPack, loadSandboxPack, SANDBOX_ID } from '../helpers/content';
import { validationEnv, DEMO_BEHAVIORS } from '../../src/core';
import { GLYPH_NAMES } from '../../src/render/glyphs';
import type { DiagnoseEnv } from '../../src/editor/diagnose';
import { docFromLevel, newRoomDoc } from '../../src/editor/templates';
import type { EditorDoc } from '../../src/editor/types';

export const pack = loadRoomPack();
export const env: DiagnoseEnv = { assets: pack.assets, validation: validationEnv(DEMO_BEHAVIORS, GLYPH_NAMES) };

/** Пустая комната по профилю room: 13×6, пол в нижнем ряду. */
export function freshDoc(): EditorDoc {
  return newRoomDoc(pack, { projectId: 'p1', name: 'Тест', pack: 'room', id: 'test-room' });
}

export function demoRoomDoc(): EditorDoc {
  return docFromLevel(levelOf(loadSandboxPack(), SANDBOX_ID), { projectId: 'p2', name: SANDBOX_ID, pack: 'room' });
}

/** Минимальные заголовки изображений для проверки sniffImage и архива. */
export function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = 6;
  return bytes;
}
