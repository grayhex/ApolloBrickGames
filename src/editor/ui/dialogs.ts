import { button, el, type Kid } from './el';

export interface DialogButton {
  label: string;
  primary?: boolean;
  /** Возврат false оставляет диалог открытым. */
  action?: () => boolean | void;
}

/** Сейчас открыт модальный диалог (горячие клавиши редактора в это время отключены). */
export function modalOpen(): boolean {
  return document.querySelector('dialog.editor-dialog[open]') !== null;
}

/**
 * Модальный диалог на элементе <dialog>. Закрывается кнопкой, Esc или программно; результат —
 * индекс нажатой кнопки (-1 — закрыт без выбора).
 */
export function showDialog(
  title: string,
  body: Kid[] | ((close: (index?: number) => void) => Kid[]),
  buttons: DialogButton[],
  options: { wide?: boolean } = {},
): Promise<number> {
  return new Promise((resolve) => {
    const dialog = el('dialog', { class: `editor-dialog${options.wide ? ' editor-dialog--wide' : ''}`, 'aria-labelledby': 'editor-dialog-title' });
    let result = -1;
    const close = (index: number): void => {
      result = index;
      dialog.close();
    };
    const footer = el('div', { class: 'editor-dialog__buttons' });
    buttons.forEach((spec, index) => {
      footer.append(
        button(
          spec.label,
          () => {
            if (spec.action?.() === false) return;
            close(index);
          },
          { class: spec.primary ? 'btn btn--primary' : 'btn' },
        ),
      );
    });
    const content = typeof body === 'function' ? body((index = -1) => close(index)) : body;
    dialog.append(el('h2', { id: 'editor-dialog-title' }, title), el('div', { class: 'editor-dialog__body' }, ...content), footer);
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });
    document.body.append(dialog);
    dialog.showModal();
    footer.querySelector<HTMLElement>('.btn--primary, .btn')?.focus();
  });
}

export function showMessage(title: string, lines: readonly string[], intro?: string): Promise<number> {
  return showDialog(
    title,
    [intro ? el('p', {}, intro) : null, el('ul', { class: 'editor-dialog__list' }, ...lines.map((line) => el('li', {}, line)))],
    [{ label: 'Закрыть', primary: true }],
  );
}

export async function confirmDialog(title: string, body: Kid[], okLabel: string, cancelLabel = 'Отмена'): Promise<boolean> {
  const index = await showDialog(title, body, [{ label: okLabel, primary: true }, { label: cancelLabel }]);
  return index === 0;
}
