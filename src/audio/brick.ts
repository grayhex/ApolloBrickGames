import { BRICK_TICK_HZ, type BrickEvent } from '../brick/types';

import { BRICK_PHRASES, type BrickSound, type BrickTone } from './brickPhrases';
import { MASTER_GAIN } from './beeper';

const TETRIS = new Set(['tetris', 'tetris-big', 'tetris-pentix', 'tetris-flicker']);
export function brickSound(event: BrickEvent, game: string, inMenu: boolean, nativeProfile?: string): BrickSound | null {
  if (nativeProfile === 'sea') {
    // «Морской бой»: мелодии и эффекты сняты с записей оригинала (`seaTunes.ts`); остальное — общие сигналы Brick Game.
    if (event.type === 'intro') return 'sea_intro';
    if (event.type === 'introFx') return 'sea_blast';
    // Музыка партии (владелец): у всех игр, кроме A, один раз играет мелодия «Ромео»; в игре A один раз, без повтора, играет мелодия заставки.
    if (event.type === 'started') return game === 'sea-battle' ? 'sea_intro_once' : 'sea_romeo_music';
    if (event.type === 'lock' || event.type === 'drop') return 'sea_fall_tick';
    if (event.type === 'step') return game === 'romeo-juliet' ? 'sea_fall_tick' : null;
    if (game === 'sea-battle') {
      // Ход игры A: вспышка при выстреле, «капля» из шести ступеней на падении мины, вспышка на потоплении корабля (звук `game-a.MOV`).
      if (event.type === 'launch' || event.type === 'explode') return 'sea_blast';
      if (event.type === 'hit' || event.type === 'shot') return 'sea_splash';
    }
  }
  if (nativeProfile === 'e88') {
    if (inMenu) return event.type === 'move' ? 'e88_menu' : null;
    if (event.type === 'started') return TETRIS.has(game) ? 'e88_tetris_music' : 'e88_start';
    if (event.type === 'gameOver') return 'e88_over';
    if (game !== 'snake') {
      switch(event.type){
        case 'move':return 'e88_move';
        case 'rotate':case 'shot':return 'e88_turn';
        case 'lock':case 'drop':return 'e88_lock';
        case 'hit':case 'explode':return 'e88_hit';
        case 'lines':return `e88_lines_${Math.max(1,Math.min(4,event.count))}` as BrickSound;
        case 'bonus':return 'e88_bonus';
        case 'win':return 'e88_win';
        case 'crash':return 'e88_crash';
        default:return null;
      }
    }
  }
  if (game === 'snake' && !inMenu) {
    switch (event.type) {
      case 'started': return 'e88_start';
      case 'move': return 'e88_move';
      case 'bonus': return 'e88_bonus';
      case 'lifeLost': return 'e88_crash';
      case 'win': return 'e88_win';
      case 'gameOver': return 'e88_over';
    }
  }
  switch (event.type) {
    case 'started':
      return game === 'brickgame' ? 'welcome' : TETRIS.has(game) ? 'select' : 'start';
    case 'move':
      return inMenu ? 'select' : TETRIS.has(game) ? 'b0202_move' : 'move';
    case 'rotate':
      return TETRIS.has(game) ? 'b0202_turn' : 'turn';
    case 'lock':
      return 'fall';
    case 'drop':
      return 'fall_super';
    case 'shot':
      return 'move';
    case 'hit':
    case 'explode':
      return 'hit_cell';
    case 'crash':
      return 'kaboom';
    case 'bonus':
      return 'bonus';
    case 'win':
      return 'win';
    case 'gameOver':
      return 'game_over';
    case 'lines':
      return event.count >= 4 ? 'tetris' : 'remove_line';
    default:
      return null; // lifeLost follows crash: do not play a second death cue
  }
}
/** Фрагмент записи с момента `offsetMs`: каждая нота получает собственное `atMs` (у дорожек общие часы), нота на границе обрезается. */
export function seekTones(notes:readonly BrickTone[],offsetMs:number):BrickTone[]{
  const clocks=new Map<number,number>();
  const out:BrickTone[]=[];
  for(const note of notes){
    const track=note.track??0;
    const start=note.atMs??clocks.get(track)??0;
    const end=start+note.ms;
    clocks.set(track,end);
    if(end<=offsetMs)continue;
    const from=Math.max(start,offsetMs);
    out.push({...note,ms:end-from,atMs:from-offsetMs});
  }
  return out;
}
/** Фоновая музыка с отдельными голосами: поверх неё звучат обычные сигналы, пауза и продолжение сохраняют место. */
const BACKGROUND_MUSIC = new Set<BrickSound>(['e88_tetris_music', 'sea_intro', 'sea_intro_once', 'sea_romeo_music']);
const PAD_HZ = [523, 659, 392, 330] as const;
const MUSIC = new Set<BrickSound>(['welcome', 'start', 'win', 'game_over', 'kaboom', 'tetris']);
const PRIORITY = (sound: BrickSound): number =>
  sound.startsWith('e88_') ? 0 : MUSIC.has(sound) ? 3 : sound === 'move' || sound === 'b0202_move' || sound === 'sea_fall_tick' ? 0 : sound === 'turn' || sound === 'b0202_turn' ? 1 : 2;

/** Synthesized tones with priority; B0202 effects may overlay its separate noise channel. */
export class BrickAudio {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private voices = new Set<{ oscillator: OscillatorNode; envelope: GainNode }>();
  private musicVoices = new Set<{ oscillator: OscillatorNode; envelope: GainNode }>();
  private music: {notes:readonly BrickTone[];offset:number;since:number;paused:boolean;loop:boolean} | null = null;
  private until = 0;
  private priority = 0;
  private volume = 0.25;
  private muted = false;
  private disposed = false;
  private gestureAt = -Infinity;
  unlock(): void {
    if (this.disposed) return;
    this.gestureAt = performance.now();
    if (!this.context) {
      try {
        this.context = new AudioContext({ latencyHint: 'interactive' });
        this.gain = this.context.createGain();
        this.gain.connect(this.context.destination);
        this.setVolume(this.volume);
      } catch {
        return;
      } // Web Audio unavailable: gameplay remains usable.
    }
    void this.context.resume().catch(() => {});
  }
  setMuted(value: boolean): void {
    this.muted = value;
    if (value) this.silence();
    this.setVolume(this.volume);
  }
  setVolume(value: number): void {
    this.volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.25;
    if (this.gain) this.gain.gain.value = this.muted ? 0 : this.volume * MASTER_GAIN;
  }
  play(event: BrickEvent, game: string, inMenu: boolean, nativeProfile?: string): void {
    if (event.type === 'paused') {
      this.pauseMusic();
      this.stopEffects();
      return;
    }
    if(event.type==='resumed'){this.resumeMusic();return;}
    // Вспышка заставки идёт поверх её мелодии: единственное событие меню, которое музыку не обрывает.
    if((inMenu&&event.type!=='introFx')||event.type==='started'||event.type==='gameOver')this.silence();
    const sound = brickSound(event, game, inMenu, nativeProfile);
    const padHz = event.type === 'tone' ? PAD_HZ[event.pad] : undefined;
    const notes: readonly BrickTone[] | null =
      event.type === 'tone' && padHz && Number.isFinite(event.ticks) && event.ticks > 0
        ? [{ hz: padHz, ms: (Math.max(1, event.ticks) * 1000) / BRICK_TICK_HZ }]
        : sound
          ? BRICK_PHRASES[sound]
          : null;
    // A pad is gameplay information: startup music and reward jingles must not mask it.
    const priority = event.type === 'tone' ? 3 : sound ? PRIORITY(sound) : 0;
    const context = this.context;
    // Allow the first gesture's cue while resume() settles, but never queue stale background events.
    if (
      !notes ||
      !context ||
      !this.gain ||
      this.muted ||
      this.disposed ||
      (context.state !== 'running' && !(context.state === 'suspended' && performance.now() - this.gestureAt < 400))
    )
      return;
    if (context.currentTime < this.until && priority < this.priority) return;
    if(sound&&BACKGROUND_MUSIC.has(sound)){
      this.music={notes,offset:0,since:context.currentTime,paused:false,loop:sound==='sea_intro'};
      this.schedule(notes,true);
      return;
    }
    this.stopEffects();
    this.schedule(notes,false);
    this.priority = priority;
  }
  private schedule(notes:readonly BrickTone[],music:boolean):void {
    const context=this.context!,voices=music?this.musicVoices:this.voices;
    const start = context.currentTime;
    for (const track of new Set(notes.map((note) => note.track ?? 0))) {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = notes.find((note) => (note.track ?? 0) === track)?.wave ?? 'square';
      oscillator.connect(envelope);
      envelope.connect(this.gain!);
      const voice = { oscillator, envelope };
      voices.add(voice);
      const playingMusic = this.music;
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
        if (!voices.delete(voice)) return;
        if (music && !voices.size && this.music === playingMusic && !this.music?.paused) {
          if (this.music?.loop) {
            this.music.offset = 0; this.music.since = context.currentTime;
            this.schedule(this.music.notes, true);
          } else this.music = null;
        }
      };
      envelope.gain.setValueAtTime(0, start);
      let at = start;
      let random = 0x2545f491;
      for (const note of notes.filter((note) => (note.track ?? 0) === track)) {
        if (note.atMs !== undefined) at = start + note.atMs / 1000;
        const duration = note.ms / 1000;
        const end = at + duration;
        const gain = (note.gain ?? 1) * (music ? .5 : 1);
        envelope.gain.setValueAtTime(0, at);
        if (note.hz > 0) {
          envelope.gain.linearRampToValueAtTime(gain, at + Math.min(0.002, duration / 4));
          envelope.gain.setValueAtTime(gain, end - Math.min(0.004, duration / 4));
          envelope.gain.linearRampToValueAtTime(0, end);
          oscillator.frequency.setValueAtTime(note.hz, at);
          if (note.noise) {
            for (let t = at + 0.004; t < end; t += 0.004) {
              random ^= random << 13;
              random ^= random >>> 17;
              random ^= random << 5;
              const center = note.hz + (((note.to ?? note.hz) - note.hz) * (t - at)) / (end - at);
              oscillator.frequency.setValueAtTime(center * (0.65 + ((random >>> 0) / 0x100000000) * 0.7), t);
            }
          } else if (note.to) oscillator.frequency.exponentialRampToValueAtTime(note.to, end);
        }
        at = end;
      }
      oscillator.start(start);
      oscillator.stop(at);
      if(!music)this.until = Math.max(this.until, at);
    }
  }
  private stopEffects(): void {
    for (const { oscillator, envelope } of this.voices) {
      envelope.disconnect();
      try {
        oscillator.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.voices.clear();
    this.until = 0;
  }
  private stopMusic():void {
    for(const {oscillator,envelope}of this.musicVoices){envelope.disconnect();try{oscillator.stop();}catch{/* already ended */}}
    this.musicVoices.clear();
  }
  private pauseMusic():void {
    if(this.music&&!this.music.paused){this.music.offset+=Math.max(0,this.context!.currentTime-this.music.since);this.music.paused=true;}
    this.stopMusic();
  }
  private resumeMusic():void {
    const music=this.music;
    if(!music?.paused||this.muted||!this.context||this.disposed)return;
    const notes=seekTones(music.notes,music.offset*1000);
    if(!notes.length){this.music=null;return;}
    music.paused=false;music.since=this.context.currentTime;this.schedule(notes,true);
  }
  silence():void {this.music=null;this.stopMusic();this.stopEffects();}
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.silence();
    void this.context?.close().catch(() => {});
    this.context = null;
    this.gain = null;
  }
}
