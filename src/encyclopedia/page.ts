import './styles.css';
import { gameBadges } from '../app/gameBadges';
import { h } from '../app/dom';
import { getLang, setLang } from '../app/i18n';
import { applyTheme } from '../app/theme';
import { clipCanvas, clipFor } from '../app/demoClip';
import { schemeEl, modeLabels } from '../app/guidePanel';
import { browserStorage, loadSettings, saveSettings } from '../input/settings';
import { GAMES, isGameId, type GameId } from '../games/catalog';
import { BRICK_GAMES } from '../brick/games';
import { getConfig } from '../config/runtime';
import { ENTRIES, guideFor, type Family, type SourceKind } from './catalog';

const copy = {
  ru:{title:'Энциклопедия игр',eyebrow:'BRICK GAME / FIELD NOTES',lead:'Знакомые игры. Маленькие экраны. Большие истории.',intro:'Правила, живая демонстрация и источники каждой реконструкции — в одном месте.',back:'К игрушкам',search:'Найти игру',all:'Все игры',blocks:'Фигуры и линии',arcade:'Аркады',puzzle:'Головоломки',adventure:'Приключения и устройства',rules:'Правила',modes:'Варианты',sources:'Источники',accuracy:'Основа реконструкции',scale:'Шкала по источникам: описание — 30%, код / фото / видео — 60%, сверка по дампу — 90%, независимое подтверждение несколькими источниками — 100%. Это оценка источников, а не измеренный процент совпадения прошивок. ROM / AI показывает происхождение логики; α / β — полноту реализации. Эти признаки независимы.',live:'Геймплей',liveNote:'Запись настоящего движка, не управление игрой',pause:'Остановить анимацию',play:'Воспроизвести анимацию',original:'Оригинальная иллюстрация',imageError:'Оригинальная иллюстрация временно недоступна.',scoring:'Очки и прогресс',notes:'Особенности реконструкции',empty:'Ничего не найдено. Попробуйте другое название.',unresearched:'Ещё не исследовано',aboutSources:'На чём основана игра',theme:'Сменить тему',language:'Сменить язык',catalog:'Каталог игр',games:'игр',menu:'Открыть каталог',wiki:'Описание с вики',code:'Исследование кода',rom:'Оригинальный дамп',video:'Видео геймплея',research:'Материалы исследования',owner:'Оригинальное устройство'},
  en:{title:'Game encyclopedia',eyebrow:'BRICK GAME / FIELD NOTES',lead:'Familiar games. Tiny screens. Big stories.',intro:'Rules, live demonstrations and the sources behind every reconstruction, in one place.',back:'Back to the toys',search:'Find a game',all:'All games',blocks:'Blocks & lines',arcade:'Arcades',puzzle:'Puzzles',adventure:'Adventures & devices',rules:'Rules',modes:'Variants',sources:'Sources',accuracy:'Reconstruction evidence',scale:'Source scale: description — 30%, code / photos / video — 60%, ROM cross-check — 90%, independent corroboration across sources — 100%. This rates the evidence, not measured firmware equivalence. ROM / AI identifies the origin of the logic; α / β describes implementation readiness. These are independent.',live:'Gameplay',liveNote:'Recorded from the real engine; not interactive',pause:'Pause animation',play:'Play animation',original:'Original illustration',imageError:'The original illustration is temporarily unavailable.',scoring:'Score & progression',notes:'Reconstruction notes',empty:'No matches. Try another title.',unresearched:'Not researched yet',aboutSources:'Behind the reconstruction',theme:'Change theme',language:'Change language',catalog:'Game catalog',games:'games',menu:'Open catalog',wiki:'Wiki description',code:'Code research',rom:'Original ROM',video:'Gameplay video',research:'Research notes',owner:'Original device'},
} as const;

export function startEncyclopedia(): void {
  const storage=browserStorage(), settings=loadSettings(storage);
  setLang(settings.display.lang); applyTheme(settings.display.theme);
  document.body.dataset['chrome']='encyclopedia';
  delete document.body.dataset['booting'];
  const params=new URLSearchParams(location.search);
  const articleId = (value: string | null): GameId => value && isGameId(value) ? value : 'tetris';
  let selected: GameId=articleId(params.get('game'));
  let family:Family|'all'='all', query='';
  let articleLife=new AbortController();
  const root=h('main',{class:'encyclopedia'});
  document.body.replaceChildren(root);
  const text=():typeof copy['ru']|typeof copy['en']=>copy[getLang()];
  const familyName=(f:Family|'all'):string=>text()[f];
  const header=h('header',{class:'enc-header'});
  const back=h('a',{class:'enc-back',href:`${import.meta.env.BASE_URL}?toy=${encodeURIComponent(params.get('toy')??'brickgame')}`});
  const theme=h('button',{type:'button',class:'enc-icon',id:'enc-theme'},'◐');
  const lang=h('button',{type:'button',class:'enc-icon',id:'enc-lang'});
  const mark=h('a',{href:import.meta.env.BASE_URL,class:'enc-mark'},h('img',{src:`${import.meta.env.BASE_URL}brand/brick-game-online-icon.svg`,alt:'',width:'44',height:'44'}),h('span',{},'BRICK GAME',h('small',{},'ONLINE')));
  header.append(mark,h('div',{class:'enc-header__actions'},back,theme,lang));
  const intro=h('header',{class:'enc-intro'},h('p',{class:'enc-eyebrow'},text().eyebrow));
  const title=h('h1',{}), lead=h('p',{class:'enc-lead'}), introText=h('p',{});
  intro.append(title,lead,introText);
  const layout=h('div',{class:'enc-layout'});
  const sidebar=h('aside',{class:'enc-sidebar'});
  const search=h('input',{type:'search',id:'enc-search',autocomplete:'off'});
  const filters=h('div',{class:'enc-filters','aria-label':text().catalog});
  const count=h('p',{class:'enc-count',role:'status','aria-live':'polite'});
  const list=h('nav',{class:'enc-list','aria-label':text().catalog});
  sidebar.append(search,filters,count,list);
  const article=h('article',{class:'enc-article',id:'enc-article'});
  layout.append(sidebar,article); root.append(header,intro,layout);

  function renderList(): void {
    const c=text();
    filters.replaceChildren(...(['all','blocks','arcade','puzzle','adventure'] as const).map(f=>{
      const button=h('button',{type:'button','aria-pressed':String(family===f)},familyName(f));
      button.addEventListener('click',()=>{family=f;renderList();}); return button;
    }));
    const found=ENTRIES.filter(e=>(family==='all'||e.family===family)&&`${GAMES[e.id].names.ru} ${GAMES[e.id].names.en}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    count.textContent=`${found.length} / ${ENTRIES.length} ${c.games}`;
    list.replaceChildren(...found.map(e=>{
      const button=h('button',{type:'button',class:'enc-item','data-game':e.id,'aria-current':e.id===selected?'page':'false'},h('span',{class:'enc-item__icon','aria-hidden':'true'},e.family==='blocks'?'▦':e.family==='puzzle'?'◇':e.family==='adventure'?'▧':'✦'),h('span',{},GAMES[e.id].names[getLang()],h('small',{},GAMES[e.id].names.en),...(e.id==='clock'?[]:[gameBadges(e.id,getLang())])),h('span',{class:'enc-item__accuracy'},e.accuracy?`${e.accuracy}%`:'—'));
      button.addEventListener('click',()=>{
        selected=e.id;
        const url=new URL(location.href);url.searchParams.set('game',selected);url.hash='';history.pushState(null,'',url);
        renderList();renderArticle();
        if(matchMedia('(max-width: 760px)').matches) article.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
      });return button;
    }),...(found.length?[]:[h('p',{class:'enc-empty'},c.empty)]));
  }
  function renderArticle(): void {
    articleLife.abort(); articleLife=new AbortController();
    const signal=articleLife.signal, c=text(), language=getLang(), entry=ENTRIES.find(e=>e.id===selected)!;
    const guide=guideFor(selected);
    const name=GAMES[selected].names[language];
    document.title=`${name} · ${c.title} · Brick Game Online`;
    const heading=h('header',{class:'enc-article__head'},h('div',{},h('p',{class:'enc-eyebrow'},familyName(entry.family)),h('h2',{},name),...(selected==='clock'?[]:[gameBadges(selected,language)]),h('p',{},guide?.summary[language]??entry.scope[language])),h('div',{class:'enc-accuracy',style:`--accuracy:${entry.accuracy}`},h('strong',{},entry.accuracy?`${entry.accuracy}%`:'—'),h('span',{},entry.accuracy?c.accuracy:c.unresearched)));
    const navigation=h('nav',{class:'enc-jump','aria-label':c.title},...['rules','modes','sources'].map(id=>h('a',{href:`#${id}`},c[id as 'rules'|'modes'|'sources'])));
    const hero=h('div',{class:'enc-hero'});
    const clip=clipFor(selected);
    if(clip){
      let playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;
      const canvas=clipCanvas(clip,`${name} · ${c.live}`,{scale:4,signal,playing:()=>playing});
      const toggle=h('button',{type:'button',class:'enc-play','aria-pressed':String(playing)},playing?c.pause:c.play);
      toggle.addEventListener('click',()=>{playing=!playing;toggle.setAttribute('aria-pressed',String(playing));toggle.textContent=playing?c.pause:c.play;});
      hero.append(h('figure',{class:'enc-demo'},h('div',{class:'enc-demo__lcd'},canvas),h('figcaption',{},h('b',{},c.live),h('span',{},c.liveNote)),toggle));
    }
    const details=h('div',{class:'enc-overview'});
    if(guide){
      details.append(h('p',{class:'enc-goal'},guide.goal[language]),h('div',{class:'enc-facts'},...guide.facts.map(f=>h('div',{},h('strong',{},f.value),h('span',{},f.label[language])))));
      for(const scheme of guide.schemes) details.append(schemeEl(scheme,language));
    }
    const original=getConfig().encyclopedia?.[selected]?.imageUrl??(selected==='mario'?`${import.meta.env.BASE_URL}brand/pack-mario/front.webp`:null);
    if(original){
      const img=h('img',{src:original,alt:`${c.original}: ${name}`,loading:'lazy',decoding:'async',referrerpolicy:'no-referrer'});
      const figure=h('figure',{class:'enc-original'},img,h('figcaption',{},c.original));
      img.addEventListener('error',()=>{figure.replaceChildren(h('p',{class:'enc-image-error',role:'status'},c.imageError));},{once:true,signal});
      details.append(figure);
    }
    hero.append(details);
    const rules=h('section',{class:'enc-section',id:'rules'},h('h3',{},c.rules));
    if(guide)rules.append(h('ol',{class:'enc-rules'},...guide.rules.map(r=>h('li',{},r[language]))),h('h4',{},c.scoring),h('ul',{class:'enc-scoring'},...guide.scoring.map(s=>h('li',{},h('span',{},s.what[language]),h('b',{},s.points)))),h('p',{},guide.progression[language]),...(guide.lives?[h('p',{},guide.lives[language])]:[]));
    else rules.append(h('p',{},entry.scope[language]));
    const modes=h('section',{class:'enc-section',id:'modes'},h('h3',{},c.modes));
    const def=BRICK_GAMES[selected];
    if(def)modes.append(h('ol',{class:'enc-modes'},...modeLabels(def,undefined,language).map((m,i)=>h('li',{},h('span',{},m.number),m.name,gameBadges(selected,language,{mode:i,rarity:false})))));
    else modes.append(h('p',{},selected==='mario'?(language==='ru'?'Девять уровней приключения Mario на оригинальном сегментном экране.':'Nine Mario adventure levels on the original segmented screen.'):entry.scope[language]));
    const sources=h('section',{class:'enc-section',id:'sources'},h('h3',{},c.aboutSources),h('p',{class:'enc-scope'},entry.scope[language]),h('div',{class:'enc-sources'},...entry.sources.map(s=>h('a',{href:s.url,target:'_blank',rel:'noopener noreferrer'},h('span',{class:'enc-source__kind'},c[s.kind as SourceKind]),h('strong',{},s.title+' ↗'),h('p',{},s.note[language])))),h('details',{class:'enc-scale'},h('summary',{},c.accuracy),h('p',{},c.scale)));
    if(guide?.assumptions.length)sources.append(h('h4',{},c.notes),h('ul',{},...guide.assumptions.map(a=>h('li',{},a[language]))));
    article.replaceChildren(heading,navigation,hero,rules,modes,sources);
    article.classList.remove('enc-arrive');void article.offsetWidth;article.classList.add('enc-arrive');
  }
  function relabel():void{
    const c=text();document.documentElement.lang=getLang();title.textContent=c.title;lead.textContent=c.lead;introText.textContent=c.intro;back.textContent='← '+c.back;theme.textContent=settings.display.theme==='dark'?'☀':'☾';theme.title=c.theme;theme.setAttribute('aria-label',c.theme);lang.textContent=getLang()==='ru'?'EN':'RU';lang.setAttribute('aria-label',c.language);search.placeholder=c.search;search.setAttribute('aria-label',c.search);list.setAttribute('aria-label',c.catalog);renderList();renderArticle();
  }
  search.addEventListener('input',()=>{query=search.value.trim();renderList();});
  theme.addEventListener('click',()=>{settings.display.theme=settings.display.theme==='dark'?'light':'dark';applyTheme(settings.display.theme);saveSettings(storage,settings);renderArticle();});
  lang.addEventListener('click',()=>{settings.display.lang=getLang()==='ru'?'en':'ru';settings.display.langSet=true;saveSettings(storage,settings);setLang(settings.display.lang);relabel();});
  window.addEventListener('popstate',()=>{const id=articleId(new URLSearchParams(location.search).get('game'));if(id!==selected){selected=id;renderList();renderArticle();}});
  // A document restored from the browser's back/forward cache resumes its timers.
  // Article changes dispose their own recording; document destruction cleans up the rest.
  relabel();
  if (['#rules','#modes','#sources'].includes(location.hash)) requestAnimationFrame(()=>document.querySelector(location.hash)?.scrollIntoView());
}
