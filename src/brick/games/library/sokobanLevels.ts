/** Сгенерировано `tools/sokoban/generate.py` — вручную не править. Собственные задачи; решение — кратчайшее (строчная буква — шаг, заглавная — толчок). */
export interface SokobanLevel { map: readonly string[]; solution: string }
/** `#` стена, `@` игрок, `+` игрок на цели, `$` ящик, `*` ящик на цели, `.` цель. */
export const SOKOBAN_LEVELS: readonly SokobanLevel[] = [
  {
    map: ['######', '#   .#', '#    #', '#  $ #', '#   @#', '######'],
    solution: 'lUUluR',
  },
  {
    map: ['#######', '#     #', '# $   #', '# #   #', '#  .@ #', '#######'],
    solution: 'llluuRurDD',
  },
  {
    map: ['#######', '# . $ #', '#  @# #', '# # $ #', '#  .  #', '#######'],
    solution: 'ddrruLruuLLdD',
  },
  {
    map: ['#######', '#     #', '#.  $ #', '# @ # #', '# #   #', '#.  $ #', '#######'],
    solution: 'rdrrdLLLrurruuLLL',
  },
  {
    map: ['#######', '#  @  #', '# #   #', '# $.# #', '# $#  #', '#.    #', '#######'],
    solution: 'llddRDuluurrrrddddllL',
  },
  {
    map: ['#######', '#     #', '#   #$#', '# $ # #', '#  . .#', '#  #@ #', '# $  .#', '#######'],
    solution: 'uluuurrDDuulldlDldRdldRRR',
  },
  {
    map: ['#######', '#  .  #', '# #  $#', '#  #$ #', '# $  @#', '# .##.#', '#     #', '#######'],
    solution: 'ddllluluurDuluurrrrDDDlUUruL',
  },
  {
    map: ['########', '#     .#', '#  .  .#', '#   #  #', '# $ ##$#', '#@#  $ #', '#      #', '########'],
    solution: 'uRlddrruUUddrdrruUUUddddlluRdrUUU',
  },
  {
    map: ['########', '# $ @. #', '# ##   #', '#  #   #', '#   #$ #', '# $# . #', '#     .#', '########'],
    solution: 'rddDrddllllUluuuuRRRlllddrDDldRRRR',
  },
  {
    map: ['########', '#     @#', '#  ##  #', '# $    #', '#.    .#', '# # ##.#', '#$ # $ #', '#      #', '########'],
    solution: 'ddddddlluRdrUdlllllUUUURuulDDrRRRurD',
  },
];
