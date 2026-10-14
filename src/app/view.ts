/**
 * Вид игрушки: закрыта (крышка сложена, виден логотип), полная (крышка открыта, видны кнопки) или «только экран» (нижней половины нет,
 * крышка с экраном крупно). Это не настройка: игрушка всегда начинается закрытой, выбор действует до перезагрузки страницы.
 */
export const VIEWS = ['closed', 'full', 'screen'] as const;
export type View = (typeof VIEWS)[number];

export const DEFAULT_VIEW: View = 'closed';

/**
 * Начальный вид: игрушка закрыта. Адрес может задать другой — `?view=full|screen|closed`, а ссылка `?power=on` (включить сразу —
 * для ссылок и тестов) заодно раскрывает игрушку: включённую игрушку с закрытой крышкой не увидеть.
 */
export function parseView(value: string | null, powerOn = false): View {
  return VIEWS.find((view) => view === value) ?? (powerOn ? 'full' : DEFAULT_VIEW);
}
