import type { DigestNight, DigestRow } from '../digest/types.js';

const dash = '—';

function warnReasons(r: DigestRow): string[] {
  const why: string[] = [];
  if (r.retries >= 3) why.push(`${r.retries} retries`);
  if (r.fails > 0) why.push(`${r.fails} fails`);
  if (r.lastStatus === 'fail' && r.fails === 0) why.push('last run failed');
  return why;
}

export function Digest({ digest }: { digest: DigestNight }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>fails</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((r) => {
              const why = warnReasons(r);
              return (
                <tr class={why.length > 0 ? 'warn' : undefined}>
                  <td>{why.length > 0 ? `! ${r.job} (${why.join(', ')})` : r.job}</td>
                  <td>{r.owner ?? dash}</td>
                  <td>{r.runs}</td>
                  <td>{r.retries}</td>
                  <td>{r.fails}</td>
                  <td>{r.lastStatus}</td>
                  <td>{r.lastError ?? dash}</td>
                  <td>{r.firstAt}</td>
                  <td>{r.lastAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {digest.badLines > 0 && <p class="warn">{digest.badLines} line(s) didn't parse</p>}
    </>
  );
}
