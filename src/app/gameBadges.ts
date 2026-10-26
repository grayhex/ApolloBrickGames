import './gameBadges.css';
import { h } from './dom';
import { logicOrigin, previewStage, type DevelopmentStage } from '../games/quality';
import type { GameId } from '../games/catalog';
import { RARITY_LABEL, rarityOf } from '../games/rarity';

/** `rarity: false` убирает значок редкости: у вариации игры своей редкости нет (она у игры в целом), у приставок со своим набором игр — тоже. */
export function gameBadges(id: GameId, lang: 'ru' | 'en', options: {mode?: number; stage?: DevelopmentStage; rarity?: boolean} = {}): HTMLElement {
  const ru=lang==='ru', origin=logicOrigin(id,options.mode), stage=options.stage===undefined?previewStage(id,options.mode):options.stage;
  const detail=origin==='rom'
    ? ru?'ROM · Логика исследована по дампу или коду другого эмулятора. Объём сверки — в источниках.':'ROM · Logic researched using a ROM or another emulator. See sources for the verification scope.'
    : ru?'AI · Авторская реконструкция логики проекта по описаниям и наблюдениям.':'AI · Project-authored logic reconstructed from descriptions and observations.';
  const badge=h('span',{class:'game-origin','data-origin':origin,title:detail,'aria-label':detail},h('span',{'aria-hidden':'true'},origin==='rom'?'▦':'✦'),origin.toUpperCase());
  const result=h('span',{class:'game-badges'},badge);
  if(stage){
    const alpha=stage==='alpha',label=ru?(alpha?'Альфа':'Бета'):(alpha?'Alpha':'Beta');
    const note=alpha
      ? ru?'Альфа · Прототип: часть правил или вариантов ещё упрощена.':'Alpha · Prototype: some rules or variants are still simplified.'
      : ru?'Бета · Полный игровой цикл проверен; продолжается доработка деталей и вариантов.':'Beta · The complete game loop has been checked; details and variants are still being refined.';
    result.append(h('span',{class:'gpanel__stage','data-stage':stage,title:note,'aria-label':note},h('b',{'aria-hidden':'true'},alpha?'α':'β'),label));
  }
  const rarity=options.rarity===false?null:rarityOf(id);
  if(rarity){
    const label=RARITY_LABEL[rarity], note=ru?label.noteRu:label.noteEn;
    result.append(h('span',{class:'game-rarity','data-rarity':rarity,title:note,'aria-label':note},h('i',{'aria-hidden':'true'}),ru?label.ru:label.en));
  }
  return result;
}
