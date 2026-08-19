import type { TableBlock as TableBlockType } from '../../spec';

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

export function TableBlock({ block }: { block: TableBlockType }) {
  const { title, columns, rows } = block;
  return (
    <div data-testid="table">
      {title && <h3>{title}</h3>}
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} data-testid="table-row">
              {columns.map((column) => (
                <td key={column.key} data-column={column.key}>
                  {renderCell(row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
