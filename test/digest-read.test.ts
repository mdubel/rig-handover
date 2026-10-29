import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

// The real nights. Read-only: these tests never write here.
const runsDir = fileURLToPath(new URL('../runs', import.meta.url));

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight(runsDir, '2026-10-28');
  const row = (job: string) => night?.rows.find((r) => r.job === job);

  it('has 5 jobs, sorted by job, and 1 bad line', () => {
    expect(night?.night).toBe('2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('fixtures/refresh: 3 retries, then ok', () => {
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      fails: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('notes/backup: failed with its error', () => {
    expect(row('notes/backup')).toMatchObject({
      runs: 1,
      fails: 1,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
      owner: 'lane-07',
    });
  });

  it('digest/render: keeps the row with a null owner', () => {
    expect(row('digest/render')).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok' });
  });

  it('lane/sync: the truncated last line is not counted', () => {
    expect(row('lane/sync')).toMatchObject({
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
  });
});

describe('readNight edge cases (temp runs dir)', () => {
  let root: string;
  let dir: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'rig-digest-read-'));
    dir = join(root, 'runs');
    mkdirSync(dir);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns null for a night with no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD, even if the path exists', () => {
    writeFileSync(join(root, 'x.jsonl'), '');
    expect(readNight(dir, '../x')).toBeNull();
    expect(readNight(dir, '2026-10-28\n')).toBeNull();
    expect(readNight(dir, '')).toBeNull();
  });

  it('an empty file is a night with no rows', () => {
    writeFileSync(join(dir, '2026-02-01.jsonl'), '');
    expect(readNight(dir, '2026-02-01')).toEqual({ night: '2026-02-01', rows: [], badLines: 0 });
  });

  it('counts lines that are not RunLines, skips blank lines, never throws', () => {
    const ok = { at: '2026-02-02T01:00:00+01:00', job: 'a', status: 'ok', owner: 'rook' };
    const lines = [
      JSON.stringify(ok),
      '',
      'not json',
      '[1,2]',
      'null',
      JSON.stringify({ ...ok, status: 'done' }),
      JSON.stringify({ ...ok, owner: undefined }),
      JSON.stringify({ ...ok, owner: 7 }),
      JSON.stringify({ ...ok, at: 'yesterday' }),
      JSON.stringify({ ...ok, job: '' }),
      JSON.stringify({ ...ok, error: null }),
      `${JSON.stringify({ ...ok, at: '2026-02-02T02:00:00+01:00', status: 'fail', error: 'boom' })}\r`,
      '   ',
    ];
    writeFileSync(join(dir, '2026-02-02.jsonl'), `${lines.join('\n')}\n`);

    const night = readNight(dir, '2026-02-02');
    expect(night?.badLines).toBe(9);
    expect(night?.rows).toEqual([
      {
        job: 'a',
        owner: 'rook',
        runs: 2,
        retries: 0,
        fails: 1,
        lastStatus: 'fail',
        lastError: 'boom',
        firstAt: '2026-02-02T01:00:00+01:00',
        lastAt: '2026-02-02T02:00:00+01:00',
      },
    ]);
  });
});
