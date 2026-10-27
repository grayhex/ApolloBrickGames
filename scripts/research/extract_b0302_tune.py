#!/usr/bin/env python3
"""Generate the B0302 tone-only fixture and Web Audio notes from a ROM probe trace."""
import argparse
import json
from pathlib import Path

REVISION = '376cca92c6d000ffd6046e5491f2a1c3d1a5eab0'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--trace', type=Path, required=True)
    parser.add_argument('--fixture', type=Path, required=True)
    parser.add_argument('--typescript', type=Path, required=True)
    args = parser.parse_args()
    data = json.loads(args.trace.read_text())
    if data['reference']['revision'] != REVISION:
        raise SystemExit('Unexpected BrickEmuPy revision')
    trace = data['audioStart']
    events = [event for event in trace['events'] if event['channel'] == 0]
    notes = []
    for current, following in zip(events, events[1:]):
        at = (current['cycle'] - trace['start']) / 690
        duration = (following['cycle'] - current['cycle']) / 690
        tone = current['tone']
        if tone is not None and 1400 <= at < 11000 and duration > 5:
            notes.append({'hz':round(tone[0],4), 'ms':round(duration,3),
                          'gain':round(tone[2],4), 'atMs':round(at,3)})
    if not notes:
        raise SystemExit('No stable melody intervals found')
    fixture = {'revision':REVISION, 'device':'Apollo18in1B0302', 'slot':'03', 'clockHz':690000,
               'description':'Stable tone-channel intervals after START; sub-5ms register transients and noise channel omitted.',
               'notes':notes}
    args.fixture.write_text(json.dumps(fixture,ensure_ascii=False,indent=2)+'\n')
    lines = ["/** B0302 mode 03 tone-register observations; no sampled audio. See docs/devices/e23-b0302.md. */",
             "import type { BrickTone } from './brickPhrases';", 'export const B0302_TETRIS_TUNE:readonly BrickTone[] = [']
    for note in notes:
        lines.append('  {hz:%s,ms:%s,gain:%s,atMs:%s},' % (note['hz'],note['ms'],note['gain'],note['atMs']))
    args.typescript.write_text('\n'.join(lines+ ['];'])+'\n')


if __name__ == '__main__':
    main()
