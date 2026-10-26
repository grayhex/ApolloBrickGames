import { BoxViewer, type BoxDialog } from './boxViewer';
import { h } from './dom';
import { t } from './i18n';
import type { PackModel } from './packs';

/**
 * Миниатюра 3D-упаковки рядом с наклейкой (левая панель): щелчок открывает диалог `BoxDialog`, над ней (наведение, фокус) коробка медленно поворачивается.
 * Общая для панели игрушек с движком (`infoPanel.ts`) и экспонатов (`exhibitApp.ts`).
 */
export function packButton(pack: PackModel, dialog: BoxDialog, signal?: AbortSignal): { element: HTMLButtonElement; dispose(): void } {
  const thumb = new BoxViewer({ model: pack, interactive: false, signal });
  const element = h(
    'button',
    { type: 'button', class: 'boxbtn', 'data-box-open': pack.id, 'aria-label': t(pack.text.open), title: t(pack.text.open) },
    thumb.element,
    h('span', { class: 'boxbtn__cap', 'aria-hidden': 'true' }, t('box.cap')),
    h('span', { class: 'boxbtn__label', 'aria-hidden': 'true' }, t(pack.text.short)),
  );
  const options = { signal };
  element.addEventListener('click', () => dialog.open(), options);
  element.addEventListener('pointerenter', () => thumb.setSpin(true), options);
  element.addEventListener('pointerleave', () => thumb.setSpin(false), options);
  element.addEventListener('focus', () => thumb.setSpin(true), options);
  element.addEventListener('blur', () => thumb.setSpin(false), options);
  return { element, dispose: () => thumb.dispose() };
}
