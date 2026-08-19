import { useIntl } from 'react-intl';
import { Box, Flex, IconButton, Typography } from '@strapi/design-system';
import { Magic, Pin, Trash } from '@strapi/icons';
import type { SavedQuery } from '../api/types';
import { pluginId } from '../pluginId';

export interface SavedQueriesPanelProps {
  queries: SavedQuery[];
  loading: boolean;
  onRun: (query: SavedQuery) => void;
  onTogglePin: (query: SavedQuery) => void;
  onDelete: (query: SavedQuery) => void;
}

export function SavedQueriesPanel({
  queries,
  loading,
  onRun,
  onTogglePin,
  onDelete,
}: SavedQueriesPanelProps) {
  const { formatMessage } = useIntl();
  return (
    <Box>
      <Typography variant="sigma" textColor="neutral600">
        {formatMessage({ id: `${pluginId}.saved.title`, defaultMessage: 'Saved queries' })}
      </Typography>
      <Box paddingTop={2}>
        {loading && (
          <Typography variant="pi">
            {formatMessage({ id: `${pluginId}.saved.loading`, defaultMessage: 'Loading…' })}
          </Typography>
        )}
        {!loading && queries.length === 0 && (
          <Typography variant="pi" textColor="neutral600">
            {formatMessage({
              id: `${pluginId}.saved.empty`,
              defaultMessage: 'No saved queries yet. Run a question, then save it.',
            })}
          </Typography>
        )}
        {queries.map((query) => (
          <Box
            key={query.id}
            padding={3}
            marginBottom={2}
            background="neutral0"
            borderColor="neutral150"
            hasRadius
          >
            <Flex alignItems="center" justifyContent="space-between" gap={2}>
              <Box>
                <Typography variant="pi" fontWeight="bold">
                  {query.title}
                </Typography>
                <Typography variant="pi" textColor="neutral600" ellipsis>
                  {query.question}
                </Typography>
              </Box>
              <Flex gap={1}>
                <IconButton
                  label={
                    query.isPinned
                      ? formatMessage({ id: `${pluginId}.saved.unpin`, defaultMessage: 'Unpin' })
                      : formatMessage({ id: `${pluginId}.saved.pin`, defaultMessage: 'Pin' })
                  }
                  onClick={() => onTogglePin(query)}
                  variant={query.isPinned ? 'default' : 'ghost'}
                >
                  <Pin fill={query.isPinned ? 'primary600' : undefined} />
                </IconButton>
                <IconButton
                  label={formatMessage({ id: `${pluginId}.saved.run`, defaultMessage: 'Run' })}
                  onClick={() => onRun(query)}
                >
                  <Magic />
                </IconButton>
                <IconButton
                  label={formatMessage({
                    id: `${pluginId}.saved.delete`,
                    defaultMessage: 'Delete',
                  })}
                  onClick={() => onDelete(query)}
                >
                  <Trash />
                </IconButton>
              </Flex>
            </Flex>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
