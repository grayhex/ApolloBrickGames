import { NATIVE_MENUS, nativeEntry, originalMenu, type NativeDeviceId } from '../devices/catalog';
import type { ConfigToy } from '../config/schema';
/** Original entry references stay distinct even when several positions use the same engine. */
export function nativeMenuEditor(id: NativeDeviceId, toy: ConfigToy, changed: () => void): HTMLElement {
  const root = document.createElement('section'); root.className = 'admin__card';
  const text = (tag: string, content: string): HTMLElement => { const el = document.createElement(tag); el.textContent = content; return el; };
  const button = (label: string, action: () => void, disabled = false): HTMLButtonElement => {
    const el = document.createElement('button'); el.type = 'button'; el.textContent = label; el.disabled = disabled;
    el.addEventListener('click', () => { action(); changed(); render(); }); return el;
  };
  const option = (entryId: string): HTMLOptionElement => {
    const entry = nativeEntry(id, entryId)!; const o = document.createElement('option'); o.value = entryId;
    o.textContent = `${entry.nativeCode} · ${entry.name.ru}${entry.available ? '' : ' · исследуется'}`; return o;
  };
  const render = (): void => {
    root.replaceChildren(text('h2', `Меню · ${toy.games.length} / ${NATIVE_MENUS[id].length}`),text('p',originalMenu(id,toy.games) ? 'Оригинальный набор' : 'Изменённый набор'));
    const label = text('label','Выбрана при включении'), first = document.createElement('select'); first.setAttribute('aria-label','Выбрана при включении');
    first.append(...toy.games.map(g => option(g.entryId!))); first.value = toy.defaultEntry!;
    first.addEventListener('change', () => { toy.defaultEntry = first.value; toy.defaultGame = nativeEntry(id,first.value)!.gameId; changed(); }); label.append(first); root.append(label);
    const list = document.createElement('ol'); list.className = 'admin__games';
    toy.games.forEach((game,i) => {
      const entry = nativeEntry(id,game.entryId!)!, row = document.createElement('li'); row.dataset['entry'] = entry.entryId;
      row.append(text('strong',`${entry.nativeCode} · ${entry.name.ru}`),text('small',`${entry.profileId} / ${entry.variantId} / r${entry.rulesetVersion} · ${entry.available ? 'Доступен' : 'Исследуется — запуск отключён'}`));
      const actions = document.createElement('div'); actions.className = 'admin__row-actions';
      actions.append(button('↑', () => { [toy.games[i-1],toy.games[i]] = [game,toy.games[i-1]!]; },i===0),button('↓', () => { [toy.games[i+1],toy.games[i]] = [game,toy.games[i+1]!]; },i===toy.games.length-1),button('Удалить', () => {
        toy.games.splice(i,1); if(toy.defaultEntry===game.entryId) { toy.defaultEntry=toy.games[0]!.entryId; toy.defaultGame=toy.games[0]!.id; }
      },toy.games.length===1)); row.append(actions); list.append(row);
    }); root.append(list);
    const add = document.createElement('select'); add.setAttribute('aria-label','Добавить оригинальную позицию');
    add.append(...NATIVE_MENUS[id].filter(e => !toy.games.some(g => g.entryId===e.entryId)).map(e => option(e.entryId))); add.disabled=!add.options.length;
    root.append(add,button('Добавить в меню',()=>{const entry=nativeEntry(id,add.value)!;toy.games.push({id:entry.gameId,entryId:entry.entryId});},!add.options.length),button('Восстановить оригинальный набор',()=>{
      toy.games=NATIVE_MENUS[id].map(e=>({id:e.gameId,entryId:e.entryId}));toy.defaultEntry=toy.games[0]!.entryId;toy.defaultGame=toy.games[0]!.id;
    }));
  }; render(); return root;
}
