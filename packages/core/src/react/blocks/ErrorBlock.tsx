import type { ErrorBlock as ErrorBlockType } from '../../spec';

export function ErrorBlock({ block }: { block: ErrorBlockType }) {
  return (
    <div data-testid="error-block" role="alert">
      <strong>{block.code}</strong> {block.message}
    </div>
  );
}
