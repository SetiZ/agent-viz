import type { Block, SourceMetadata } from '../spec';
import { BarChartBlock } from './blocks/BarChartBlock';
import { ErrorBlock } from './blocks/ErrorBlock';
import { KpiBlock } from './blocks/KpiBlock';
import { LineChartBlock } from './blocks/LineChartBlock';
import { PieChartBlock } from './blocks/PieChartBlock';
import { TableBlock } from './blocks/TableBlock';
import { TextBlock } from './blocks/TextBlock';
import { SourcesFooter } from './SourcesFooter';

export interface BlockRendererProps {
  blocks: Block[];
  sources?: SourceMetadata[];
  showSources?: boolean;
}

export function BlockRenderer({ blocks, sources, showSources = true }: BlockRendererProps) {
  return (
    <div data-testid="block-renderer">
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
      {showSources && sources && sources.length > 0 && <SourcesFooter sources={sources} />}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'text':
      return <TextBlock block={block} />;
    case 'kpi':
      return <KpiBlock block={block} />;
    case 'table':
      return <TableBlock block={block} />;
    case 'bar_chart':
      return <BarChartBlock block={block} />;
    case 'line_chart':
      return <LineChartBlock block={block} />;
    case 'pie_chart':
      return <PieChartBlock block={block} />;
    case 'error':
      return <ErrorBlock block={block} />;
  }
}
