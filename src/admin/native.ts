import { nativeFamilies, nativeEntry, type NativeDeviceId } from '../devices/catalog';
import { nativeDefault, type ConfigToy } from '../config/schema';
/** A game is assigned once; optional native modifications belong to its card. */
export function nativeMenuEditor(id: NativeDeviceId, toy: ConfigToy, changed: () => void): HTMLElement {
  const root=document.createElement('section');root.className='admin__card';
  const families=nativeFamilies(id);
  const text=(tag:string,content:string):HTMLElement=>{const el=document.createElement(tag);el.textContent=content;return el;};
  const button=(label:string,action:()=>void,disabled=false):HTMLButtonElement=>{
    const el=document.createElement('button');el.type='button';el.textContent=label;el.disabled=disabled;
    el.addEventListener('click',()=>{action();changed();render();});return el;
  };
  const option=(entryId:string):HTMLOptionElement=>{
    const e=nativeEntry(id,entryId)!,o=document.createElement('option');o.value=entryId;
    o.textContent=`${id==='apollo-b0202'?e.group:e.nativeCode} · ${e.name.ru}${e.approximate?e.stage==='beta'?' · β':' · α':''}`;return o;
  };
  const render=():void=>{
    const original=JSON.stringify(toy.games)===JSON.stringify(nativeDefault(id).games);
    root.replaceChildren(text('h2',`Игры · ${toy.games.length} / ${families.length}`),text('p',original?'Оригинальный набор':'Изменённый набор'),text('p',id==='apollo-b0202'?'Назначается игра целиком. Она запускается с базового варианта; включённые модификации выбираются кнопкой MODE на корпусе.':`Каждый номер — самостоятельный пункт меню устройства (${families.length} пунктов).`));
    const label=text('label','Выбрана при включении'),first=document.createElement('select');first.setAttribute('aria-label','Выбрана при включении');
    first.append(...toy.games.map(g=>option(g.entryId!)));first.value=toy.defaultEntry!;
    first.addEventListener('change',()=>{toy.defaultEntry=first.value;toy.defaultGame=nativeEntry(id,first.value)!.gameId;changed();});label.append(first);root.append(label);
    const list=document.createElement('ol');list.className='admin__games';
    toy.games.forEach((game,i)=>{
      const family=families.find(f=>f.base.entryId===game.entryId)!,entry=family.base,row=document.createElement('li');row.dataset['entry']=entry.entryId;
      row.append(text('strong',`${id==='apollo-b0202'?entry.group:entry.nativeCode} · ${entry.name.ru}`),text('small',entry.approximate?`${entry.stage==='beta'?'β':'α'} · Приближённая версия из библиотеки`:'Базовая игра'));
      if(family.variants.length){
        const mods=document.createElement('fieldset');mods.className='admin__modifications';mods.append(text('legend','Модификации (MODE)'));
        for(const variant of family.variants){
          const label=text('label',`${variant.nativeCode} · ${variant.name.ru}`),input=document.createElement('input');input.type='checkbox';input.checked=game.variants?.includes(variant.entryId)??false;
          input.setAttribute('aria-label',`Модификация ${variant.nativeCode}`);
          input.addEventListener('change',()=>{const chosen=new Set(game.variants);if(input.checked)chosen.add(variant.entryId);else chosen.delete(variant.entryId);game.variants=family.variants.filter(v=>chosen.has(v.entryId)).map(v=>v.entryId);changed();render();});label.prepend(input);mods.append(label);
        }row.append(mods);
      }
      const actions=document.createElement('div');actions.className='admin__row-actions';
      actions.append(button('↑',()=>{[toy.games[i-1],toy.games[i]]=[game,toy.games[i-1]!];},i===0),button('↓',()=>{[toy.games[i+1],toy.games[i]]=[game,toy.games[i+1]!];},i===toy.games.length-1),button('Удалить',()=>{
        toy.games.splice(i,1);if(toy.defaultEntry===game.entryId){toy.defaultEntry=toy.games[0]!.entryId;toy.defaultGame=toy.games[0]!.id;}
      },toy.games.length===1));row.append(actions);list.append(row);
    });root.append(list);
    const add=document.createElement('select');add.setAttribute('aria-label','Добавить игру');
    add.append(...families.filter(f=>!toy.games.some(g=>g.entryId===f.base.entryId)).map(f=>option(f.base.entryId)));add.disabled=!add.options.length;
    root.append(add,button('Добавить в меню',()=>{const f=families.find(f=>f.base.entryId===add.value)!;toy.games.push({id:f.base.gameId,entryId:f.base.entryId,variants:f.variants.map(v=>v.entryId)});},!add.options.length),button('Восстановить оригинальный набор',()=>{const defaults=nativeDefault(id);toy.games=defaults.games;toy.defaultEntry=defaults.defaultEntry;toy.defaultGame=defaults.defaultGame;}));
  };render();return root;
}
