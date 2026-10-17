/** Measured B0202 tone-register commands, not recorded audio. See docs/brick/rom-review.md.
 * Generated from tests/fixtures/brickemu/b0202.json; sub-0.1 ms register-write transients omitted. */
import type { BrickTone } from './brickPhrases';
export const B0202_EFFECTS = {
  b0202_move: [
    {
      hz: 505.37109375,
      ms: 14.842029,
      gain: 0.6666666666666666,
    },
    {
      hz: 631.7138671875,
      ms: 14.852174,
      gain: 0.6666666666666666,
    },
    {
      hz: 965.9957885742188,
      ms: 29.666667,
      gain: 0.6666666666666666,
    },
    {
      hz: 1389.7705078125,
      ms: 29.684058,
      gain: 1.0,
    },
    {
      hz: 1884.613037109375,
      ms: 29.678261,
      gain: 1.0,
    },
    {
      hz: 2424.201965332031,
      ms: 29.681159,
      gain: 1.0,
    },
    {
      hz: 2692.6803588867188,
      ms: 14.804348,
      gain: 1.0,
    },
  ],
  b0202_turn: [
    {
      hz: 2679.5196533203125,
      ms: 14.843478,
      gain: 1.0,
    },
    {
      hz: 2358.3984375,
      ms: 14.837681,
      gain: 1.0,
    },
    {
      hz: 2105.712890625,
      ms: 14.842029,
      gain: 1.0,
    },
    {
      hz: 1895.1416015625,
      ms: 14.836232,
      gain: 1.0,
    },
    {
      hz: 1726.6845703125,
      ms: 14.842029,
      gain: 1.0,
    },
    {
      hz: 1516.11328125,
      ms: 14.84058,
      gain: 1.0,
    },
    {
      hz: 1305.5419921875,
      ms: 14.83913,
      gain: 0.6666666666666666,
    },
    {
      hz: 1094.970703125,
      ms: 11.873913,
      gain: 0.6666666666666666,
    },
    {
      hz: 884.3994140625,
      ms: 11.833333,
      gain: 0.3333333333333333,
    },
    {
      hz: 1516.11328125,
      ms: 29.643478,
      gain: 0.4,
      noise: true,
      track: 1,
      atMs: 0.165217,
    },
  ],
} satisfies Record<string, readonly BrickTone[]>;
