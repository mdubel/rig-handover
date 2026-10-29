import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestNight } from '../src/digest/types.js';

// Temp runs dir only: runs/ is read-only fixtures and is never touched here.
let runsDir: string;

const GOOD_NIGHT = [
  '{"at":"2026-01-01T23:00:01+01:00","job":"beta/rotate","status":"ok","owner":null}',
  '{"at":"2026-01-01T23:00:02+01:00","job":"alpha/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-01-01T23:30:02+01:00","job":"alpha/sync","status":"retry","owner":"rook","error":"timeout"}',
  '{"at":"2026-01-01T23:45:02+01:00","job":"alpha/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-01-01T23:50:00+01:00","job":"beta/rotate","status":"fail","owner":null,"error":"disk full"}',
].join('\n');

const BAD_LINE_NIGHT = [
  '{"at":"2026-01-03T00:00:00+01:00","job":"alpha/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-01-03T01:00:00+01:00","job":"x/y',
].join('\n');

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: '' };

function appFor(dir: string) {
  return createApp({ ...config, runsDir: dir });
}

beforeAll(() => {
  runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-runs-'));
  fs.writeFileSync(path.join(runsDir, '2026-01-01.jsonl'), GOOD_NIGHT + '\n');
  fs.writeFileSync(path.join(runsDir, '2026-01-02.jsonl'), '');
  fs.writeFileSync(path.join(runsDir, '2026-01-03.jsonl'), BAD_LINE_NIGHT + '\n');
});

afterAll(() => {
  fs.rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('200 for a good night, with both jobs rendered', async () => {
    const res = await appFor(runsDir).request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('alpha/sync');
    expect(html).toContain('beta/rotate');
  });

  it('lists jobs in the same order as the JSON rows (sorted by job)', async () => {
    const app = appFor(runsDir);
    const html = await (await app.request('/digest/2026-01-01')).text();
    const json = (await (await app.request('/api/digest/2026-01-01')).json()) as DigestNight;
    const jobs = json.rows.map((r) => r.job);
    expect(jobs).toEqual(['alpha/sync', 'beta/rotate']);
    const positions = jobs.map((job) => html.indexOf(job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('404 for a night with no file', async () => {
    const res = await appFor(runsDir).request('/digest/2026-01-09');
    expect(res.status).toBe(404);
  });

  it('renders "nothing ran" for an empty night', async () => {
    const res = await appFor(runsDir).request('/digest/2026-01-02');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('200 for a night with a bad line, valid rows still rendered', async () => {
    const res = await appFor(runsDir).request('/digest/2026-01-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('alpha/sync');
  });
});

describe('GET /api/digest/:night', () => {
  it('200 with DigestRow rows sorted by job', async () => {
    const res = await appFor(runsDir).request('/api/digest/2026-01-01');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.night).toBe('2026-01-01');
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/sync', 'beta/rotate']);

    const alpha = body.rows[0];
    expect(alpha.owner).toBe('rook');
    expect(alpha.runs).toBe(3);
    expect(alpha.retries).toBe(1);
    expect(alpha.fails).toBe(0);
    expect(alpha.lastStatus).toBe('ok');
    expect(alpha.lastError).toBeNull();
    expect(alpha.firstAt).toBe('2026-01-01T23:00:02+01:00');
    expect(alpha.lastAt).toBe('2026-01-01T23:45:02+01:00');

    const beta = body.rows[1];
    expect(beta.owner).toBeNull();
    expect(beta.fails).toBe(1);
    expect(beta.lastStatus).toBe('fail');
    expect(beta.lastError).toBe('disk full');
  });

  it('404 for a night with no file', async () => {
    const res = await appFor(runsDir).request('/api/digest/2026-01-09');
    expect(res.status).toBe(404);
  });

  it('200 with rows: [] for an empty night', async () => {
    const res = await appFor(runsDir).request('/api/digest/2026-01-02');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.rows).toEqual([]);
  });

  it('200 with badLines: 1 and the valid row present for a bad-line night', async () => {
    const res = await appFor(runsDir).request('/api/digest/2026-01-03');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toContain('alpha/sync');
  });
});
