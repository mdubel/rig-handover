// Plan morning-digest § 1. Reads runs/<night>.jsonl into one DigestRow per job. Read-only: never
// writes to runsDir. Line content never throws; a line that isn't a RunLine is counted in badLines.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunLine, RunStatus } from './types.js';

// Also the only thing that reaches the path: no separators, no `..`.
const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
// ISO 8601 date-time with its offset (or Z). Checked, then kept exactly as written.
const AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  const text = readLog(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const byJob = new Map<string, JobLines>();
  let badLines = 0;
  for (const raw of text.replace(/^﻿/, '').split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseRunLine(raw);
    if (line === null) {
      badLines += 1;
      continue;
    }
    const acc = byJob.get(line.job) ?? { first: line, last: line, runs: 0, retries: 0, fails: 0 };
    acc.last = line;
    acc.runs += 1;
    if (line.status === 'retry') acc.retries += 1;
    if (line.status === 'fail') acc.fails += 1;
    byJob.set(line.job, acc);
  }

  const rows = [...byJob.entries()].map(([job, acc]) => toRow(job, acc)).sort(byJobName);
  return { night, rows, badLines };
};

type JobLines = { first: RunLine; last: RunLine; runs: number; retries: number; fails: number };

function toRow(job: string, { first, last, runs, retries, fails }: JobLines): DigestRow {
  return {
    job,
    owner: last.owner,
    runs,
    retries,
    fails,
    lastStatus: last.status,
    lastError: last.error ?? null,
    firstAt: first.at,
    lastAt: last.at,
  };
}

// Plain code-unit compare, not locale: the same order everywhere the rows are rendered.
function byJobName(a: DigestRow, b: DigestRow): number {
  return a.job < b.job ? -1 : a.job > b.job ? 1 : 0;
}

// null when the file (or runsDir) doesn't exist. Other I/O errors aren't line content: they throw.
function readLog(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (isRecord(err) && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null;
    throw err;
  }
}

// The edge: one raw line in, a RunLine or null out. Unknown extra keys are ignored.
function parseRunLine(raw: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;

  const { at, job, status, owner } = value;
  if (typeof at !== 'string' || !AT.test(at) || Number.isNaN(Date.parse(at))) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;

  if (!Object.hasOwn(value, 'error')) return { at, job, status, owner };
  const { error } = value;
  if (typeof error !== 'string') return null;
  return { at, job, status, owner, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStatus(value: unknown): value is RunStatus {
  return STATUSES.some((s) => s === value);
}
