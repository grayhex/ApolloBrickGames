import { FMConsole } from '../brick/fmConsole';
import { PRINCE_PANEL_GAMES } from '../brick/guides/prince';
import { PrinceConsole } from '../brick/princeConsole';
import { applyPrinceModel } from './princeModel';
import { FM38_GAMES } from '../brick/guides/fm38';
import { applyFM38Model } from './fm38Model';
import './exhibit.css';
import './minibrick.css';
import { BrickAudio } from '../audio/brick';
import { MiniConsole } from '../brick/miniConsole';
import { makeBrickInput, BRICK_TICK_HZ, MAX_SCORE, type BrickAction, type BrickEvent } from '../brick/types';
import { actionBit, maskOf, type InputFrame } from '../core';
import { browserGamepadProvider } from '../input/gamepad';
import { browserStorage, musicVolumeOf } from '../input/settings';
import { MINI_LCD_OFF, type LcdView, type MiniLcdState } from '../render/miniScreen';
import { ControlPanel, type ControlPanelActions } from './controlPanel';
import { CornerNav } from './cornerNav';
import { openEncyclopedia } from './help';
import { InputHub } from './hub';
import { onInputLock } from './inputLock';
import { applyStatic, getLang, onLangChange, setLang, t } from './i18n';
import { Lifecycle, type AppHandle, type Carry } from './lifecycle';
import { applyMiniBrickModel } from './minibrickModel';
import { MiniInfoPanel } from './miniInfo';
import { SettingsDialog } from './settingsUi';
import { FixedStepper } from './stepper';
import { applyTheme } from './theme';
import { ToyPanel, type ToyKeyId } from './toy';
import { TOYS } from './toys';
import { parseView, type View } from './view';

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const START = actionBit('start');
const PAUSE = actionBit('pause');
const LEFT = actionBit('left');
const RIGHT = actionBit('right');
const DOWN = actionBit('down');
/** На корпусе Mini и FM-38 нет отдельной «вверх»: клавиша ↑ и большая ROTATE — одна кнопка. У Prince стрелка вверх есть, и это отдельное действие. */
const ROTATE = actionBit('jump') | actionBit('up');
const UP = actionBit('up');
/** Кнопки корпуса и их игровые действия; RESET (`fire`) возвращает в меню, ON/OFF, MUSIC/VOICE и START/PAUSE — отдельно. */
const KEY_ACTIONS: Partial<Record<ToyKeyId, number>> = {
  left: maskOf('left'),
  right: maskOf('right'),
  down: maskOf('down'),
  jump: maskOf('jump'),
};
/** Период мигания клеток и сегментов, мс (полпериода — «горит», полпериода — «погашена»). */
const BLINK_MS = 500;
/** Шкала значков на заставке горит целиком. */


/** Рекорд каждого номера игры хранится отдельно; недоступное хранилище не мешает игре. */
const hiKey = (number: number): string => `crocodile-mario:minibrick:${String(number).padStart(2, '0')}:${number<2?'r2:':''}hi`;
const lineKey = (number:number):string => `crocodile-mario:minibrick:${number}:lines-hi`;
const fmHiKey = (number:number):string => `crocodile-mario:fm38:${number}:hi`;
const princeHiKey = (number:number):string => `crocodile-mario:prince118:${String(number+1).padStart(3,'0')}:hi`;
function loadLines(number:number):number {
  try {return Math.max(0,Math.min(MAX_SCORE,Number.parseInt(browserStorage()?.getItem(lineKey(number))??'',10)||0));}catch{return 0;}
}
function loadHi(number: number): number {
  try {
    const value = Number.parseInt(browserStorage()?.getItem(hiKey(number)) ?? '', 10);
    return Number.isFinite(value) ? Math.min(Math.max(value, 0), MAX_SCORE) : 0;
  } catch {
    return 0;
  }
}
function saveHi(number: number, value: number): void {
  try {
    browserStorage()?.setItem(hiKey(number), String(value));
  } catch {
    // рекорд не сохранится — игре это не мешает
  }
}

/** Кадр ввода такта в действия движка: направления, ROTATE (она же ↑); «вверх» как отдельного действия у игр нет. */
function brickInput(frame: InputFrame, separateUp = false): ReturnType<typeof makeBrickInput> {
  const rotate = separateUp ? actionBit('jump') : ROTATE;
  const actions = (mask: number): BrickAction[] => {
    const out: BrickAction[] = [];
    if (mask & LEFT) out.push('left');
    if (mask & RIGHT) out.push('right');
    if (mask & DOWN) out.push('down');
    if (separateUp && mask & UP) out.push('up');
    if (mask & rotate) out.push('rotate');
    return out;
  };
  return makeBrickInput(actions(frame.pressed), actions(frame.held));
}

/**
 * Mini Brick Game B-S96: играющая игрушка. Своя «аппаратура» (синяя крышка, жёлтые кнопки, ЖК с рамкой стакана и шкалой значков) и своя консоль
 * (`MiniConsole`: заставка рожица → «96», меню номеров 00–96, партия), но та же оболочка страницы: вид, питание, звук, пульт, справка.
 * Движок общий с остальными игрушками (`BrickGame`), без кабинета, рейтингов и админки: у модели нет набора игр для настройки.
 */
export function startMiniBrickApp(carry?: Carry, id: 'minibrick' | 'fm38' | 'prince118' = 'minibrick'): AppHandle {
  const life = new Lifecycle();
  const { signal } = life;
  const fm = id === 'fm38';
  const prince = id === 'prince118';
  const model = TOYS[id];
  document.body.dataset['chrome'] = 'toy';
  document.body.dataset['motion'] = 'off';
  const lcd: LcdView = fm ? applyFM38Model() : prince ? applyPrinceModel() : applyMiniBrickModel();
  const toy = byId('toy');
  const arena = byId('arena');
  const area = byId('game-area');
  const front = byId('lid-front');
  const lower = byId('lower');
  const cover = byId<HTMLButtonElement>('lid-cover');
  const base = byId('base');
  const params = new URLSearchParams(location.search);
  let view: View = carry?.view ?? parseView(params.get('view'), params.get('power') === 'on');
  if((fm||prince) && view==='closed')view='full';
  let powered = carry ? carry.powered : params.get('power') === 'on';
  if (powered && view === 'closed') view = 'full';
  const lid = byId('lid');
  lid.style.setProperty('--lcd-bg', model.lcd.bg);
  lid.style.setProperty('--lcd-aspect', prince ? '311 / 447' : '254 / 314');
  byId('stage').dataset['i18nAttrs'] = `aria-label=${model.stageLabel}`;
  area.dataset['boot'] = 'off';
  area.dataset['menu'] = 'none';
  area.dataset['music'] = 'none';

  const seed = Number.parseInt(params.get('seed') ?? '', 10) || Date.now() % 0x7fffffff || 1;
  const otherHiKey = fm ? fmHiKey : prince ? princeHiKey : null;
  const readHi=(n:number):number=>{
    if(!otherHiKey)return loadHi(n);
    try {
      const value=Number.parseInt(browserStorage()?.getItem(otherHiKey(n))??'',10);
      return Number.isFinite(value)?Math.min(MAX_SCORE,Math.max(0,value)):0;
    } catch {return 0;}
  };
  const mini = fm ? new FMConsole({ seed, hiScore: readHi }) : prince ? new PrinceConsole({ seed, hiScore: readHi }) : new MiniConsole({ seed, hiScore: readHi });
  if (params.has('debug')) Object.defineProperty(window, fm ? '__fm38' : prince ? '__prince118' : '__minibrick', { configurable: true, get: () => mini });

  /** Диалог создаётся после ввода (ему нужен `hub`), а ввод спрашивает, не открыт ли он: держатель ссылки разрывает круг. */
  const ui: { settings: SettingsDialog | null } = { settings: null };
  const isKeyboardActive = (): boolean => {
    if (ui.settings?.isOpen || view === 'closed') return false;
    const active = document.activeElement;
    return active === null || active === document.body || area.contains(active);
  };
  const hub = new InputHub({ keyboardTarget: window, provider: browserGamepadProvider(), storage: browserStorage(), isKeyboardActive, onGamepadDisconnect: () => suspend() });
  setLang(hub.settings.display.lang);
  const stepper = new FixedStepper(1000 / BRICK_TICK_HZ);
  const brickAudio = new BrickAudio();
  let fmMelody = 0;
  const audioProfile = ():string => fm ? `fm38-${fmMelody}` : prince ? 'prince' : 'mini';
  life.onDispose(() => brickAudio.dispose());
  const unlockAudio = (): void => brickAudio.unlock();
  window.addEventListener('keydown', unlockAudio, { signal });
  window.addEventListener('pointerdown', unlockAudio, { signal });

  const ghostOn = (): boolean => hub.settings.display.ghost ?? true;
  const refocus = (): void => {
    if (view !== 'closed') area.focus({ preventScroll: true });
  };

  // ── Игра ────────────────────────────────────────────────────────────
  const savedHi = new Map<number, number>();
  const savedLines = new Map<number, number>();
  const lineRecord=(number:number):number=>{
    if(!savedLines.has(number))savedLines.set(number,loadLines(number));
    return savedLines.get(number)!;
  };
  const persistHi = (): void => {
    if (mini.inMenu) return;
    const stored = savedHi.get(mini.gameNumber) ?? readHi(mini.gameNumber);
    savedHi.set(mini.gameNumber, stored);
    if (mini.hiScore > stored) {
      savedHi.set(mini.gameNumber, mini.hiScore);
      if(otherHiKey){try{browserStorage()?.setItem(otherHiKey(mini.gameNumber),String(mini.hiScore));}catch{/* storage unavailable */}}else saveHi(mini.gameNumber, mini.hiScore);
    }
  };
  /** Число снятых рядов партии (две последние цифры верхней строки): набирается по событиям `lines`, с новой партией обнуляется. */
  let lines = 0;
  const emit = (events: readonly BrickEvent[]): void => {
    for (const event of events) {
      if (event.type === 'started') lines = 0;
      else if (event.type === 'lines') {
        lines += event.count;
        if(!fm && !prince && lines>lineRecord(mini.gameNumber)){savedLines.set(mini.gameNumber,lines);try{browserStorage()?.setItem(lineKey(mini.gameNumber),String(lines));}catch{/* unavailable storage does not stop play */}}
      }
      brickAudio.play(event, mini.game?.id ?? mini.id, mini.inMenu, audioProfile());
    }
    persistHi(); // elapsed driving time also scores without an audio event
  };
  function suspend(): void {
    emit(mini.pause());
    hub.resetDevices();
    hub.tracker.reset();
    stepper.reset();
  }
  const restartGame = (): void => {
    persistHi();
    brickAudio.silence();
    mini.restart();
    hub.tracker.reset();
    stepper.reset();
    refocus();
  };
  const setSound = (on: boolean): void => {
    hub.updateSettings((s) => {
      s.display.sound = on;
    });
    applyDisplay();
  };

  const pressMelody = ():void => {
    if(!fm){setSound(!hub.settings.display.sound);return;}
    if(!powered)return;
    fmMelody=(fmMelody+1)%2;
    unlockAudio();
    // Select music without starting a new game or resetting its line counter.
    brickAudio.play({type:'started'},mini.gameId,false,audioProfile());
    if(mini.phase==='paused')brickAudio.play({type:'paused'},mini.gameId,false,audioProfile());
    toy.dataset['melody']=String(fmMelody);
  };

  function tick(): void {
    const raw = hub.tracker.consume();
    const start = (raw.pressed & START) !== 0;
    const pause = (raw.pressed & PAUSE) !== 0;
    if (mini.inMenu) {
      if (start) emit(mini.start());
      else emit(mini.menu(brickInput(raw, prince)));
      return;
    }
    switch (mini.phase) {
      case 'ready':
      case 'over':
        if (start) emit(mini.start());
        break;
      case 'paused':
        if (start || pause) emit(mini.resume());
        break;
      case 'playing':
        if (pause) emit(mini.pause());
        else if (start) emit(mini.startButton());
        else emit(mini.step(brickInput(raw, prince)));
        break;
    }
  }

  const setPower = (on: boolean): void => {
    if (on === powered) return;
    powered = on;
    if (on && view === 'closed') {
      view = 'full';
      applyView();
    }
    toy.dataset['power'] = on ? 'on' : 'off';
    area.dataset['power'] = on ? 'on' : 'off';
    brickAudio.silence();
    hub.tracker.reset();
    stepper.reset();
    applyDisplay();
    if (on) {
      unlockAudio(); // кнопка ON/OFF срабатывает раньше слушателя окна: без этого сигнал заставки не успевал бы прозвучать
      emit(mini.powerOn());
    } else {
      suspend();
      mini.restart();
    }
  };

  // ── Кнопки корпуса ────────────────────────────────────────────────
  const toyPanel = new ToyPanel(toy, hub, {
    startPauseAction: () => START,
    phase: () => (mini.phase === 'playing' ? 'playing' : mini.phase === 'paused' ? 'paused' : 'ready'),
    powered: () => powered,
    onPower: () => setPower(!powered),
    onSound: pressMelody,
    keyActions: prince ? { ...KEY_ACTIONS, up: maskOf('up') } : KEY_ACTIONS,
    // RESET возвращает в меню; игрового действия у него нет.
    onPress: (id) => {
      if (id !== 'fire') return false;
      if (powered) restartGame();
      return true;
    },
    onReset: () => {
      if (powered) restartGame();
    },
  });
  const hotkeys: Record<string, 'onoff' | 'sound'> = { KeyO: 'onoff', KeyM: 'sound' };
  window.addEventListener(
    'keydown',
    (event) => {
      const id = hotkeys[event.code];
      if (!id || event.repeat || event.ctrlKey || event.altKey || event.metaKey || !isKeyboardActive()) return;
      event.preventDefault();
      toyPanel.hotkey(id, true);
    },
    { signal },
  );
  window.addEventListener(
    'keyup',
    (event) => {
      const id = hotkeys[event.code];
      if (id) toyPanel.hotkey(id, false);
    },
    { signal },
  );

  // ── Вид, пульт, угловое меню ────────────────────────────────────────
  const applyView = (): void => {
    const closed = view === 'closed';
    for (const element of [toy, arena]) {
      element.dataset['view'] = view;
      element.toggleAttribute('data-closed', closed);
      element.toggleAttribute('data-compact', view === 'screen');
    }
    front.inert = closed;
    lower.inert = closed;
    cover.inert = !closed;
    cover.tabIndex = closed ? 0 : -1;
  };
  const setView = (next: View): void => {
    if (next === view) return;
    if((fm||prince) && next==='closed')next='full';
    if (next === 'closed' && powered) return; // включённую игрушку не закрыть: сначала ON/OFF
    view = next;
    applyView();
    applyDisplay();
    if(fm)window.scrollTo(0,0);
    refocus();
  };
  const none = (): void => {};
  const panelActions: ControlPanelActions = {
    pickShell: none,
    toggleSound: () => setSound(!hub.settings.display.sound),
    setVolume: (volume, commit) => {
      if (commit) {
        hub.updateSettings((s) => {
          s.display.volume = volume;
        });
      }
      brickAudio.setVolume(volume);
    },
    setMusicVolume: none,
    setMusic: none,
    toggleGhost: () => {
      if (!fm) return;
      hub.updateSettings((s) => {
        s.display.ghost = !ghostOn();
      });
      applyDisplay();
    },
    setView,
    pickOriginal: none,
    pickBundled: none,
    pickUser: none,
  };
  const controls = new ControlPanel(byId('side-ctl'), {
    toy: id,
    shells: model.shells,
    slots: [],
    bundled: [],
    levels: false,
    music: false,
    speedrun: false,
    remote: fm?['onoff', 'sp']:['onoff', 'sp', 'reset'],
    tickRateHz: BRICK_TICK_HZ,
    onPointerUse: refocus,
    signal,
    actions: panelActions,
  });
  toyPanel.bindRemote(byId('side-ctl'));
  const corner = new CornerNav(
    { devices: byId('devices'), theme: byId<HTMLButtonElement>('corner-theme') },
    {
      toggleTheme: () => {
        hub.updateSettings((s) => {
          s.display.theme = s.display.theme === 'dark' ? 'light' : 'dark';
        });
        applyDisplay();
      },
      toggleGhost: () => {
        if (!fm) return;
        hub.updateSettings((s) => {
          s.display.ghost = !ghostOn();
        });
        applyDisplay();
      },
      togglePause: () => {
        if (powered && !mini.inMenu) emit(mini.phase === 'paused' ? mini.resume() : mini.pause());
      },
      onPointerUse: refocus,
    },
    signal,
  );
  const settings = (ui.settings = new SettingsDialog(byId<HTMLDialogElement>('settings'), hub, {
    onOpen: () => {
      if (powered && mini.phase === 'playing') emit(mini.pause());
      hub.resetDevices();
    },
    onClose: () => {
      applyDisplay();
      refocus();
    },
    signal,
  }));

  function applyDisplay(): void {
    const display = hub.settings.display;
    applyTheme(display.theme);
    corner.setTheme(display.theme);
    // «Сегменты экрана» (призрак погашенных сегментов) есть у FM-38; у Mini призрак всегда виден.
    if (fm) {
      lcd.setGhost?.(ghostOn());
      corner.setGhost(ghostOn());
    } else corner.setGhost(null);
    brickAudio.setMuted(!display.sound);
    brickAudio.setVolume(display.volume);
    controls.update({
      shell: model.defaultShell,
      sound: display.sound,
      volume: display.volume,
      musicVolume: musicVolumeOf(display),
      music: display.music,
      view,
      powered,
      level: null,
    });
  }

  // Левая панель — как у остальных игрушек: карточка устройства и вкладки игр (Mini: гонки и тетрис; FM-38: тетрис A и B); сама следит за языком и привязками клавиш.
  const info = new MiniInfoPanel(byId('side-info'), hub, {
    toy: id,
    ...(fm ? { games: FM38_GAMES } : prince ? { games: PRINCE_PANEL_GAMES } : {}),
    onChoose: (id) => {
      if (powered) mini.selectGame(id);
    },
    onPointerUse: refocus,
    signal,
  });
  function relabel(): void {
    document.documentElement.lang = getLang();
    applyStatic();
    const lang = byId('corner-lang');
    lang.dataset['lang'] = getLang();
    lang.setAttribute('aria-label', t('corner.lang'));
    lang.title = t('corner.langTitle');
    base.querySelector('[data-key="onoff"]')?.setAttribute('aria-label', 'ON/OFF');
  }
  byId('corner-lang').addEventListener(
    'click',
    () => {
      hub.updateSettings((s) => {
        s.display.lang = getLang() === 'ru' ? 'en' : 'ru';
        s.display.langSet = true;
      });
      setLang(hub.settings.display.lang);
    },
    { signal },
  );
  byId('corner-settings').addEventListener('click', () => settings.open(), { signal });
  byId('corner-help').addEventListener('click', () => openEncyclopedia(id), { signal });
  cover.addEventListener('click', () => setView('full'), { signal });
  window.addEventListener(
    'keydown',
    (event) => {
      if (view !== 'closed' || event.repeat || event.ctrlKey || event.altKey || event.metaKey || ui.settings?.isOpen) return;
      if (event.code !== 'Enter' && event.code !== 'Space') return;
      const active = document.activeElement;
      if (active !== null && active !== document.body && active !== cover) return;
      event.preventDefault();
      setView('full');
    },
    { signal },
  );
  // «Только экран»: кнопок корпуса нет, касание экрана включает игрушку, открывает меню и запускает или продолжает партию.
  area.addEventListener(
    'pointerdown',
    () => {
      if (view !== 'screen') return;
      if (!powered) setPower(true);
      else if (mini.screenStage === 'intro' || (mini.inMenu && mini.screenStage === 'menu') || mini.phase === 'over') emit(mini.start());
      else if (mini.phase === 'paused') emit(mini.resume());
    },
    { signal },
  );
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden && powered) suspend();
    },
    { signal },
  );
  window.addEventListener(
    'blur',
    () => {
      if (powered) suspend();
    },
    { signal },
  );
  onInputLock((locked) => {
    if (locked && powered) suspend(); // открыт каталог устройств: партия на паузе
  }, signal);
  onLangChange(relabel, signal);
  life.onDispose(() => {
    settings.close();
    hub.detach();
  });

  // ── Кадр ────────────────────────────────────────────────────────────
  const setData = (name: string, value: string | number): void => {
    const text = String(value);
    if (area.dataset[name] !== text) area.dataset[name] = text;
  };
  const stateOf = (now: number): MiniLcdState => {
    const stage = mini.screenStage;
    const idle = mini.idleDisplay;
    const base = { powered: true, cells: mini.cells(), blink: Math.floor(now / BLINK_MS) % 2 === 0, note: hub.settings.display.sound } as const;
    if (prince) {
      // Prince: заставка — только картинка на матрице; автоплей — идущая сама партия, номер вариации в верхнем ряду, скорость и уровень выбираются; в партии — как у Mini без шкалы значков.
      if (stage === 'intro') return { ...base, preview: null, score: null, lines: null, label: null, linesLabel: false, next: false, speed: null, level: null, scale: 0, pause: false, gameOver: false };
      if (stage === 'menu') return { ...base, preview: mini.preview(), score: mini.gameNumber + 1, lines: null, label: null, linesLabel: false, next: mini.preview() !== null, speed: mini.displaySpeed, level: mini.displayLevel, scale: 0, pause: false, gameOver: false };
      const blocks = mini.gameId === 'tetris';
      const showLines = blocks && mini.phase !== 'over' && idle.lines;
      return { ...base, preview: mini.preview(), score: mini.score, lines: showLines ? lines : null, label: 'score', linesLabel: showLines, next: mini.preview() !== null, speed: mini.displaySpeed, level: blocks ? mini.displayLevel : null, scale: 0, pause: mini.phase === 'paused', gameOver: mini.phase === 'over' };
    }
    if(fm)return {...base,variant:mini.gameNumber?'B':'A',preview:mini.preview(),score:null,lines:mini.inMenu?0:lines,label:null,linesLabel:true,next:true,speed:mini.displaySpeed,level:mini.displayLevel,scale:mini.displayLevel+1,pause:mini.phase==='paused',gameOver:mini.phase==='over',rotate:mini.phase!=='over'};
    // Заставка по фото владельца: горят HI-SCORE с нулём, LINES, NEXT, GAME OVER, SPEED с нулём и вся шкала значков.
    if (stage === 'intro') {
      return { ...base, preview: null, score: mini.hiScore, lines: idle.lines?lineRecord(mini.gameNumber):null, label: 'hi', linesLabel: idle.lines, next: true, speed: mini.displaySpeed, level: null, scale: idle.scale, pause: false, gameOver: true };
    }
    if (stage === 'menu') {
      return {
        ...base,
        preview: null,
        score: mini.hiScore,
        lines: idle.lines?lineRecord(mini.gameNumber):null,
        label: 'hi',
        linesLabel: idle.lines,
        next: false,
        speed: mini.displaySpeed,
        level: mini.displayLevel,
        scale: idle.scale,
        pause: false,
        gameOver: false,
      };
    }
    const blocks = mini.gameId === 'tetris';
    const showLines = blocks && mini.phase !== 'over' && idle.lines;
    return {
      ...base,
      preview: mini.preview(),
      score: mini.score,
      lines: showLines ? lines : null,
      label: 'score',
      linesLabel: showLines,
      next: mini.preview() !== null,
      speed: mini.displaySpeed,
      level: blocks ? mini.displayLevel : null,
      scale: mini.displayLevel + 1,
      pause: mini.phase === 'paused',
      gameOver: mini.phase === 'over',
    };
  };
  let lastStatus = '';
  const updateUi = (): void => {
    info.setActive(fm ? (mini.gameNumber ? 'b' : 'a') : mini.gameId);
    setData('power', powered ? 'on' : 'off');
    setData('phase', powered ? (mini.inMenu ? 'ready' : mini.phase) : 'ready');
    setData('stage', powered ? mini.screenStage : 'off');
    setData('game', mini.gameNumber);
    setData('score', powered ? mini.score : 0);
    setData('speed', powered ? mini.displaySpeed : 0);
    setData('level', powered ? mini.displayLevel : 0);
    corner.setPaused(powered && mini.phase === 'paused');
    const status = !powered ? t('status.off') : mini.phase === 'playing' ? '' : t(mini.phase === 'paused' ? 'status.paused' : 'status.ready');
    if (status !== lastStatus) {
      lastStatus = status;
      byId('sr-status').textContent = status;
    }
  };
  function frame(now: number): void {
    hub.poll();
    if (powered) stepper.advance(now, tick);
    toyPanel.sync(hub.tracker.down);
    lcd.render(powered ? stateOf(now) : MINI_LCD_OFF);
    updateUi();
  }

  toy.dataset['power'] = powered ? 'on' : 'off';
  if(fm)toy.dataset['melody']=String(fmMelody);
  area.dataset['power'] = powered ? 'on' : 'off';
  applyView();
  applyDisplay();
  relabel();
  if (powered) emit(mini.powerOn());
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (life.disposed) return;
      delete document.body.dataset['booting'];
      delete document.body.dataset['motion'];
      refocus();
    }),
  );
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener(
    'resize',
    () => {
      document.body.dataset['motion'] = 'off';
      clearTimeout(resizeTimer);
      resizeTimer = life.timeout(() => delete document.body.dataset['motion'], 200);
    },
    { signal },
  );
  hub.attach();
  refocus();
  life.loop(frame);
  return { dispose: () => life.dispose(), carry: () => ({ view, shell: model.defaultShell, powered }) };
}
