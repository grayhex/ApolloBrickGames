import { openEncyclopedia } from './help';
import './exhibit.css';
import './taksun.css';
import { browserGamepadProvider } from '../input/gamepad';
import { browserStorage, musicVolumeOf } from '../input/settings';
import { alibabaMark, applyAlibabaModel } from './alibabaModel';
import { BoxDialog } from './boxViewer';
import { ControlPanel } from './controlPanel';
import { CornerNav } from './cornerNav';
import { h } from './dom';
import { InputHub } from './hub';
import { packButton } from './packButton';
import { PACKS } from './packs';
import { applyStatic, getLang, onLangChange, setLang, t } from './i18n';
import { Lifecycle, type AppHandle, type Carry } from './lifecycle';
import { SettingsDialog } from './settingsUi';
import { applyTaksunModel } from './taksunModel';
import { applyTheme } from './theme';
import { TOYS } from './toys';
import { parseView, type View } from './view';

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
/** An exhibit only (Alibaba, TAKSUN): no BrickConsole, audio, simulated game, boot sequence or animation-frame loop. */
export async function startExhibitApp(id: 'alibaba' | 'taksun', carry?: Carry): Promise<AppHandle> {
  const life = new Lifecycle(),
    { signal } = life,
    model = TOYS[id];
  document.body.dataset['chrome'] = 'toy';
  document.body.dataset['motion'] = 'off';
  if (id === 'taksun') applyTaksunModel();
  else applyAlibabaModel();
  const toy = byId('toy'),
    arena = byId('arena'),
    area = byId('game-area'),
    front = byId('lid-front'),
    lower = byId('lower'),
    cover = byId<HTMLButtonElement>('lid-cover');
  const params = new URLSearchParams(location.search);
  let view = carry?.view ?? parseView(params.get('view'), params.get('power') === 'on');
  toy.dataset['power'] = 'off';
  area.dataset['power'] = 'off';
  area.dataset['phase'] = 'unavailable';
  area.dataset['boot'] = 'off';
  area.dataset['menu'] = 'none';
  area.dataset['music'] = 'none';
  const lid = byId('lid');
  lid.style.setProperty('--lcd-bg', model.lcd.bg);
  lid.style.setProperty('--lcd-aspect', '254 / 314');
  byId('stage').dataset['i18nAttrs'] = `aria-label=${model.stageLabel}`;
  const hub = new InputHub({ keyboardTarget: window, provider: browserGamepadProvider(), storage: browserStorage(), isKeyboardActive: () => false });
  setLang(hub.settings.display.lang);
  const focus = (): void => {
    if (view !== 'closed') area.focus({ preventScroll: true });
  };
  const notice = h('dialog', { class: 'settings alibaba-notice', id: `${id}-notice`, 'aria-labelledby': `${id}-notice-title` });
  document.body.append(notice);
  // TAKSUN: 3D-коробка (пока заглушка) открывается из левой панели; пока диалог открыт, клавиши модели не работают.
  const box = id === 'taksun' ? new BoxDialog(byId<HTMLDialogElement>('box-dialog'), PACKS.taksun, { onOpen: () => {}, onClose: focus }, signal) : null;
  let boxThumb: { dispose(): void } | null = null;
  life.onDispose(() => boxThumb?.dispose());
  const closeDialog = (dialog: HTMLDialogElement): void => {
    dialog.close();
    focus(); // Native close events are queued; keyboard input must work immediately after Escape.
  };
  const populateDialog = (dialog: HTMLDialogElement): void => {
    const close = h('button', { class: 'btn btn--primary', type: 'button' }, t('common.close'));
    close.addEventListener('click', () => closeDialog(dialog), { signal });
    dialog.replaceChildren(
      h('h2', { id: dialog === notice ? `${id}-notice-title` : `${id}-help-title` }, t('alibaba.unavailable')),
      h('p', {}, t(`${id}.description`)),
      h('p', {}, t(`${id}.details`)),
      close,
    );
    dialog.setAttribute('aria-labelledby', dialog === notice ? `${id}-notice-title` : `${id}-help-title`);
  };
  const showNotice = (): void => {
    if (notice.open) return;
    populateDialog(notice);
    notice.showModal();
  };
  const settings = new SettingsDialog(byId<HTMLDialogElement>('settings'), hub, {
    onOpen: () => {},
    onClose: () => {
      refresh();
      focus();
    },
    signal,
  });
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
    view = next;
    applyView();
    refresh();
    focus();
  };
  const none = (): void => {};
  const controls = new ControlPanel(byId('side-ctl'), {
    toy: id,
    shells: model.shells,
    slots: [],
    bundled: [],
    levels: false,
    music: false,
    speedrun: false,
    tickRateHz: 60,
    onPointerUse: focus,
    signal,
    actions: {
      pickShell: none,
      toggleSound: none,
      setVolume: none,
      setMusicVolume: none,
      setMusic: none,
      toggleGhost: none,
      setView,
      pickOriginal: none,
      pickBundled: none,
      pickUser: none,
    },
  });
  const corner = new CornerNav(
    { devices: byId('devices'), theme: byId<HTMLButtonElement>('corner-theme') },
    {
      toggleTheme: () => {
        hub.updateSettings((s) => {
          s.display.theme = s.display.theme === 'dark' ? 'light' : 'dark';
        });
        refresh();
      },
      toggleGhost: none,
      onPointerUse: focus,
    },
    signal,
  );
  function refresh(): void {
    const display = hub.settings.display;
    applyTheme(display.theme);
    corner.setTheme(display.theme);
    corner.setGhost(null);
    corner.setPaused(false);
    corner.setDevices({ keyboard: 'ready', gamepad: 'hidden', padName: null });
    controls.update({
      shell: model.defaultShell,
      sound: false,
      volume: display.volume,
      musicVolume: musicVolumeOf(display),
      music: display.music,
      view,
      powered: false,
      level: null,
    });
  }
  function relabel(): void {
    document.documentElement.lang = getLang();
    applyStatic();
    const lang = byId('corner-lang');
    lang.dataset['lang'] = getLang();
    lang.setAttribute('aria-label', t('corner.lang'));
    lang.title = t('corner.langTitle');
    const info = byId('side-info');
    info.dataset['toy'] = id;
    boxThumb?.dispose();
    boxThumb = null;
    if (id === 'taksun') {
      const pack = box ? packButton(PACKS.taksun, box, signal) : null;
      boxThumb = pack;
      info.replaceChildren(
        h(
          'header',
          { class: `side__top side__top--logo${pack ? ' side__top--box' : ''}` },
          h('h2', { class: 'visually-hidden', id: 'info-title' }, model.name),
          h('div', { class: 'about__sticker' }, h('img', { class: 'about__logo', src: `${import.meta.env.BASE_URL}brand/taksun-wordmark.svg`, width: '465', height: '125', alt: model.name })),
          ...(pack ? [pack.element] : []),
        ),
        h(
          'section',
          { class: 'side__sec' },
          h('p', { class: 'alibaba-status' }, t('alibaba.unavailable')),
          h('p', { class: 'gtext' }, t('taksun.description')),
        ),
        h(
          'section',
          { class: 'side__sec' },
          h('h3', { class: 'side__h' }, t('alibaba.reference')),
          h('p', { class: 'gtext' }, t('taksun.details')),
          h('p', { class: 'gtext' }, t('taksun.tip')),
        ),
      );
    } else {
      info.replaceChildren(
        h('div', { class: 'alibaba-info__mark' }, alibabaMark('dance')),
        h(
          'section',
          { class: 'side__sec' },
          h('h2', { class: 'side__h', id: 'info-title' }, model.name),
          h('p', { class: 'alibaba-status' }, t('alibaba.unavailable')),
          h('p', { class: 'gtext' }, t(`${id}.description`)),
        ),
        h(
          'section',
          { class: 'side__sec' },
          h('h3', { class: 'side__h' }, t('alibaba.reference')),
          h('p', { class: 'gtext' }, t(`${id}.details`)),
          h('p', { class: 'gtext' }, t('alibaba.tip')),
        ),
      );
    }
    byId('sr-status').textContent = t('alibaba.unavailable');
    byId<HTMLButtonElement>('base')
      .querySelector('[data-key="onoff"]')
      ?.setAttribute('aria-label', `ON/OFF — ${t('alibaba.unavailable')}`);
    if (notice.open) populateDialog(notice);
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
  byId('corner-help').addEventListener(
    'click',
    () => {
      openEncyclopedia(id);
    },
    { signal },
  );
  cover.addEventListener('click', () => setView('full'), { signal });
  area.addEventListener(
    'click',
    () => {
      if (view === 'screen') showNotice();
    },
    { signal },
  );
  byId('base').querySelector('[data-key="onoff"]')!.addEventListener('click', showNotice, { signal });
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || notice.open || settings.isOpen || box?.isOpen) return;
      if ((event.target as Element | null)?.closest('button,a,input,select,textarea,[contenteditable=true]')) return;
      if (event.code === 'KeyO') {
        event.preventDefault();
        showNotice();
      } else if (['Enter', 'Space'].includes(event.code)) {
        event.preventDefault();
        if (view === 'closed') setView('full');
        else showNotice();
      }
    },
    { signal },
  );
  onLangChange(relabel, signal);
  for (const dialog of [notice]) {
    dialog.addEventListener('close', focus, { signal });
    dialog.addEventListener(
      'cancel',
      (event) => {
        event.preventDefault();
        closeDialog(dialog);
      },
      { signal },
    );
  }
  life.onDispose(() => {
    settings.close();
    notice.close();
    notice.remove();
    hub.detach();
  });
  applyView();
  refresh();
  relabel();
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (life.disposed) return;
      delete document.body.dataset['booting'];
      delete document.body.dataset['motion'];
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
  return { dispose: () => life.dispose(), carry: () => ({ view, shell: model.defaultShell, powered: false }) };
}
