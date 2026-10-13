export interface Layout {
  /** Целый или дробный (если окно меньше экрана) коэффициент масштаба: логический пиксель → устройство. */
  scale: number;
  /** Размер буфера Canvas в физических пикселях. */
  backingWidth: number;
  backingHeight: number;
  /** CSS-размер Canvas. */
  cssWidth: number;
  cssHeight: number;
}

/**
 * Масштабирование с сохранением пропорций и учётом devicePixelRatio.
 * Поле не растягивается: берётся наибольший целый масштаб, который помещается в контейнер
 * (чёткие пиксели). Если и масштаб 1 не помещается — дробный, чтобы картинка влезла.
 * Размер окна и DPR влияют только на отрисовку, но не на правила игры.
 */
export function computeLayout(
  containerCssWidth: number,
  containerCssHeight: number,
  devicePixelRatio: number,
  logicalWidth: number,
  logicalHeight: number,
): Layout {
  const dpr = devicePixelRatio > 0 && Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
  const availableW = Math.max(1, containerCssWidth * dpr);
  const availableH = Math.max(1, containerCssHeight * dpr);
  const fit = Math.min(availableW / logicalWidth, availableH / logicalHeight);
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  const backingWidth = Math.max(1, Math.round(logicalWidth * scale));
  const backingHeight = Math.max(1, Math.round(logicalHeight * scale));
  return {
    scale,
    backingWidth,
    backingHeight,
    cssWidth: backingWidth / dpr,
    cssHeight: backingHeight / dpr,
  };
}
