import type { SourceMetadata } from '../spec';

export function SourcesFooter({ sources }: { sources: SourceMetadata[] }) {
  return (
    <footer data-testid="sources-footer">
      {sources.map((source, index) => (
        <details key={index} data-testid="source">
          <summary>
            {source.contentType.label ?? source.contentType.uid} · {source.tool} ·{' '}
            {source.recordsReturned} of {source.recordsMatching} records
            {source.truncated ? ' (truncated)' : ''}
          </summary>
          <ul>
            <li>Permission: {source.permission}</li>
            <li>
              User: {source.user.id} ({source.user.roles.join(', ')})
            </li>
            {source.dateRange && (
              <li>
                Range: {source.dateRange.start ?? '\u2026'} {'\u2192'}{' '}
                {source.dateRange.end ?? '\u2026'} ({source.dateRange.granularity ?? 'none'})
              </li>
            )}
            <li>
              Filters: <code>{JSON.stringify(source.filters)}</code>
            </li>
          </ul>
        </details>
      ))}
    </footer>
  );
}
