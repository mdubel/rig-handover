// Plan morning-digest § 1. The contract every part of § 2 starts against: one row per job for a
// night in runs/<night>.jsonl. The page and the JSON both render these rows, so they can't disagree.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, once it has parsed into this shape.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

export type DigestRow = {
  job: string;
  // From the job's last line. null renders as `—`.
  owner: string | null;
  // Lines for this job, whatever their status.
  runs: number;
  retries: number;
  fails: number;
  lastStatus: RunStatus;
  // Error of the last line, null when it has none.
  lastError: string | null;
  // `at` of the first and last line, exactly as in the log (offset kept, never converted).
  firstAt: string;
  lastAt: string;
};

export type DigestNight = {
  night: string;
  // Sorted by job.
  rows: DigestRow[];
  // Lines that didn't parse, or parsed but aren't a RunLine. Counted, never thrown.
  badLines: number;
};

// null when the night isn't YYYY-MM-DD or runs/<night>.jsonl doesn't exist (routes: 404).
// An empty file is a night with no rows.
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
