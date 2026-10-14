/**
 * Вид игрушки: закрыта (крышка сложена, виден логотип), полная (крышка открыта, видны кнопки) или «только экран» (нижней половины нет,
 * крышка с экраном крупно). Это не настройка: игрушка всегда начинается закрытой, выбор действует до перезагрузки страницы.
 */
export const VIEWS = ['closed', 'full', 'screen'] as const;
export type View = (typeof VIEWS)[number];

export const DEFAULT_VIEW: View = 'closed';

/** Начальный вид: игрушка закрыта; `?view=full|screen|closed` в адресе задаёт другой (для ссылок и тестов). */
export function parseView(value: string | null): View {
  return VIEWS.find((view) => view === value) ?? DEFAULT_VIEW;
}
