import './alibaba.css';
import { browserGamepadProvider } from '../input/gamepad';
import { browserStorage, musicVolumeOf } from '../input/settings';
import { alibabaMark, applyAlibabaModel } from './alibabaModel';
import { ControlPanel } from './controlPanel';
import { CornerNav } from './cornerNav';
import { h } from './dom';
import { InputHub } from './hub';
import { applyStatic, getLang, onLangChange, setLang, t } from './i18n';
import { Lifecycle, type AppHandle, type Carry } from './lifecycle';
import { SettingsDialog } from './settingsUi';
import { applyTheme } from './theme';
import { TOYS } from './toys';
import { parseView, type View } from './view';

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
/** An exhibit only: no BrickConsole, audio, simulated game, boot sequence or animation-frame loop. */
export async function startAlibabaApp(carry?: Carry): Promise<AppHandle> {
  const life = new Lifecycle(),
    { signal } = life,
    model = TOYS.alibaba;
  document.body.dataset['chrome'] = 'toy';
  document.body.dataset['motion'] = 'off';
  applyAlibabaModel();
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
  byId('stage').dataset['i18nAttrs'] = 'aria-label=stage.label.alibaba';
  const hub = new InputHub({ keyboardTarget: window, provider: browserGamepadProvider(), storage: browserStorage(), isKeyboardActive: () => false });
  setLang(hub.settings.display.lang);
  const focus = (): void => {
    if (view !== 'closed') area.focus({ preventScroll: true });
  };
  const notice = h('dialog', { class: 'settings alibaba-notice', id: 'alibaba-notice', 'aria-labelledby': 'alibaba-notice-title' });
  document.body.append(notice);
  const help = byId<HTMLDialogElement>('help');
  const populateDialog = (dialog: HTMLDialogElement): void => {
    const close = h('button', { class: 'btn btn--primary', type: 'button' }, t('common.close'));
    close.addEventListener('click', () => dialog.close(), { signal });
    dialog.replaceChildren(
      h('h2', { id: dialog === notice ? 'alibaba-notice-title' : 'alibaba-help-title' }, t('alibaba.unavailable')),
      h('p', {}, t('alibaba.description')),
      h('p', {}, t('alibaba.details')),
      close,
    );
    dialog.setAttribute('aria-labelledby', dialog === notice ? 'alibaba-notice-title' : 'alibaba-help-title');
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
    display: { onChange: () => refresh() },
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
    toy: 'alibaba',
    shells: ['white'],
    slots: [],
    bundled: [],
    levelsDisabled: true,
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
      shell: 'white',
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
    info.dataset['toy'] = 'alibaba';
    info.replaceChildren(
      h('div', { class: 'alibaba-info__mark' }, alibabaMark('dance')),
      h(
        'section',
        { class: 'side__sec' },
        h('h2', { class: 'side__h' }, model.name),
        h('p', { class: 'alibaba-status' }, t('alibaba.unavailable')),
        h('p', { class: 'gtext' }, t('alibaba.description')),
      ),
      h(
        'section',
        { class: 'side__sec' },
        h('h3', { class: 'side__h' }, t('alibaba.reference')),
        h('p', { class: 'gtext' }, t('alibaba.details')),
        h('p', { class: 'gtext' }, t('alibaba.tip')),
      ),
    );
    byId('sr-status').textContent = t('alibaba.unavailable');
    byId<HTMLButtonElement>('base')
      .querySelector('[data-key="onoff"]')
      ?.setAttribute('aria-label', `ON/OFF — ${t('alibaba.unavailable')}`);
    if (notice.open) populateDialog(notice);
    if (help.open) populateDialog(help);
  }
  byId('corner-lang').addEventListener(
    'click',
    () => {
      hub.updateSettings((s) => {
        s.display.lang = getLang() === 'ru' ? 'en' : 'ru';
      });
      setLang(hub.settings.display.lang);
    },
    { signal },
  );
  byId('corner-settings').addEventListener('click', () => settings.open(), { signal });
  byId('corner-help').addEventListener(
    'click',
    () => {
      populateDialog(help);
      if (!help.open) help.showModal();
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
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || notice.open || help.open || settings.isOpen) return;
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
  for (const dialog of [notice, help]) dialog.addEventListener('close', focus, { signal });
  life.onDispose(() => {
    settings.close();
    if (help.open) help.close();
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
  return { dispose: () => life.dispose(), carry: () => ({ view, shell: 'white', powered: false }) };
}
