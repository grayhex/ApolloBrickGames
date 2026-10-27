import { svg } from './dom';

/**
 * Ложбина под три служебные кнопки: одна изогнутая выемка с круглыми концами (форма по фотографии TAKSUN TS-995). Mini Brick B-S96 отлит в той же форме,
 * поэтому геометрия общая: кривая лежит в системе координат TS-995 (400 × 650), а Mini повторяет её сдвигом и масштабом так, чтобы выемка прошла
 * через центры его кнопок (ON/OFF, MUSIC/VOICE, RESET); толщина выемки — по размеру кнопок (у TS-995 около 1,3 кнопки).
 */
export const FUNCTION_GROOVE_SHAPE = 'M86 262Q84 322 122 368';

export interface GrooveFit {
  /** Перенос и масштаб формы в систему координат корпуса. */
  transform: string;
  /** Толщина внешней выемки в единицах формы (внутреннее дно уже неё). */
  width: number;
  /** Цвета: светлая кромка снизу, тень сверху, дно. */
  edge: string;
  edgeOpacity: string;
  shadow: string;
  floor: string;
}

/** Три слоя выемки: светлая кромка снизу, тень сверху, дно темнее панели. */
export function functionGroove(fit: GrooveFit): SVGElement[] {
  const place = (extra: string): string => `${fit.transform} ${extra}`.trim();
  const layer = (stroke: string, width: number, transform: string, opacity?: string): SVGElement =>
    svg('path', {
      d: FUNCTION_GROOVE_SHAPE,
      fill: 'none',
      'stroke-linecap': 'round',
      stroke,
      'stroke-width': String(width),
      ...(opacity ? { 'stroke-opacity': opacity } : {}),
      ...(transform ? { transform } : {}),
    });
  return [
    layer(fit.edge, fit.width, place('translate(0 1.8)'), fit.edgeOpacity),
    layer(fit.shadow, fit.width, fit.transform),
    layer(fit.floor, Math.round(fit.width * 0.868 * 10) / 10, place('translate(0 1.2)')),
  ];
}
