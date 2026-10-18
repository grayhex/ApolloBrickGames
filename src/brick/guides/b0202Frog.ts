import { gt, type GameGuideData } from '../guide';
export const B0202_FROG_GUIDE: GameGuideData = {
  summary: gt('Лягушка пересекает движущуюся дорогу. Вариант 01 следует Apollo B0202 A01; остальные варианты сохраняют правила симулятора.', 'A frog crosses moving traffic. Variant 01 follows Apollo B0202 A01; other variants keep simulator rules.'),
  goal: gt('Дойди до верхнего края, избегая занятых клеток.', 'Reach the top edge while avoiding occupied cells.'),
  rules: [
    gt('В варианте 01 шаг вперёд — одна клетка; последний прыжок с ряда 17 пересекает финиш. Заполнять десять отдельных домов не нужно.', 'In variant 01 a forward step covers one cell; the final jump from row 17 crosses the finish. There are no ten separate homes to fill.'),
    gt('Две полосатые обочины разделяют дорогу. Машины движутся группами рядов, в обе стороны; движущийся ряд переносит лягушку.', 'Two striped islands divide the road. Groups of traffic rows move in both directions; a moving row carries the frog.'),
    gt('Каждый переход даёт столько очков, какова выбранная скорость: от 1 до 10. После короткого мигания — снова на старт.', 'Each crossing earns the selected speed in points: 1 to 10. After a short blink the frog returns to the start.'),
    gt('Варианты 02–16 — прежние дороги с восемью полосами, прыжками через разделители и десятью домами; их нумерация не сверена с Apollo.', 'Variants 02–16 retain the previous eight-lane roads, jumps over dividers and ten homes; their numbering is not verified against Apollo.'),
  ],
  controls: [{button:'arrows',text:gt('Шаг в выбранную сторону.', 'Step in the selected direction.')},{button:'rotate',text:gt('Шаг вперёд.', 'Step forward.')}],
  scoring: [{what:gt('Переход в варианте 01', 'Variant 01 crossing'),points:'+1…10'}],
  facts:[{value:'10×20',label:gt('матрица','display')},{value:'16',label:gt('вариантов','variants')}],
  progression:gt('В 01 дорога продолжается после каждого перехода. Полное соответствие оригинальному таймеру, поздним событиям и потере жизни ещё не установлено.', 'In 01 the road continues after each crossing. Full fidelity of the original timer, later events and life-loss sequence is not yet established.'),
  lives:gt('Четыре жизни в адаптации. Точное соответствие запаса лягушек и индикатора ROM ещё проверяется.', 'Four lives in this adaptation. The exact ROM frog reserve and indicator semantics are still under investigation.'),
  schemes:[{cells:['..........','..........','..........','..........','..........','..........','..........','..........','##..##..##','..........','..........','..........','..........','..........','##..##..##','..........','..........','..........','..........','.....*....'],caption:gt('Полосатые обочины и мигающая лягушка; в начале дорога постепенно заполняется.', 'Striped islands and the blinking frog; traffic gradually enters after the start.')}],
  assumptions:[gt('01: шаг, очки и расписание рядов проверены по ROM. ГСЧ, сцены и часть таймерных событий адаптированы; 02–16 — симулятор n0Live.', '01: ROM steps, scores and row schedule verified. RNG, scenes and some timed events are adapted; 02–16 follow the n0Live simulator.')],
};
