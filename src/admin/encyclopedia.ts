import { h } from '../app/dom';
import { GAMES, type GameId } from '../games/catalog';
import { illustrationUrl, type SiteConfig } from '../config/schema';

export function adminEncyclopedia(root: HTMLElement, before: HTMLElement, getConfig: () => SiteConfig, changed: () => void): { refresh(): void } {
  const card=h('section',{class:'admin__card admin__encyclopedia',id:'admin-encyclopedia'});
  const select=h('select',{'aria-label':'Игра для оригинальной иллюстрации'},...Object.values(GAMES).map(game=>h('option',{value:game.id},game.names.ru)));
  const url=h('input',{type:'url',placeholder:'https://…/original.jpg',maxlength:'2048','aria-label':'Ссылка на оригинальную иллюстрацию'});
  const status=h('p',{role:'status',class:'admin__image-status'});
  const preview=h('div',{class:'admin__image-preview'});
  const save=h('button',{type:'button'},'Сохранить ссылку в черновик');
  const remove=h('button',{type:'button'},'Убрать иллюстрацию');
  const view=h('button',{type:'button'},'Посмотреть иллюстрацию');
  card.append(h('h2',{},'Энциклопедия игр'),h('p',{},'Оригинальные изображения для всех игр, независимо от меню приставок. Разместите файл на внешнем хостинге и укажите прямую ссылку HTTPS. Общая публикация выполняется кнопкой «Опубликовать» ниже.'),h('label',{},'Игра',select),h('label',{},'Оригинальная иллюстрация · HTTPS',url),h('div',{class:'admin__row-actions'},save,view,remove),status,preview);
  root.insertBefore(card,before);
  function refresh():void {
    url.value=getConfig().encyclopedia?.[select.value as GameId]?.imageUrl??'';
    url.setCustomValidity('');status.textContent='';preview.replaceChildren();
    remove.disabled=!url.value;
  }
  select.addEventListener('change',refresh);
  function checked():string|null {
    try { const result=illustrationUrl(url.value.trim());url.setCustomValidity('');return result; }
    catch(error){const message=error instanceof Error?error.message:String(error);url.setCustomValidity(message);url.reportValidity();status.textContent=message;return null;}
  }
  url.addEventListener('input',()=>url.setCustomValidity(''));
  save.addEventListener('click',()=>{
    const value=checked();if(!value)return;
    const config=getConfig();config.encyclopedia??={};config.encyclopedia[select.value as GameId]={imageUrl:value};
    changed();refresh();status.textContent='Ссылка сохранена в черновике. Опубликуйте конфигурацию, чтобы её увидели посетители.';
  });
  remove.addEventListener('click',()=>{
    const config=getConfig();if(config.encyclopedia){delete config.encyclopedia[select.value as GameId];if(!Object.keys(config.encyclopedia).length)delete config.encyclopedia;}
    changed();refresh();status.textContent='Иллюстрация удалена из черновика.';
  });
  view.addEventListener('click',()=>{
    const value=checked();if(!value)return;
    const img=h('img',{src:value,alt:'Оригинальная иллюстрация',referrerpolicy:'no-referrer',decoding:'async'});
    img.addEventListener('error',()=>{preview.replaceChildren();status.textContent='Изображение не загрузилось. Проверьте прямую ссылку и разрешение хостинга на показ изображения.';},{once:true});
    preview.replaceChildren(img);
  });
  refresh();return {refresh};
}
