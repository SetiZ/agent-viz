import type { TextBlock as TextBlockType } from '../../spec';

export function TextBlock({ block }: { block: TextBlockType }) {
  return <p data-testid="text-block">{block.text}</p>;
}
