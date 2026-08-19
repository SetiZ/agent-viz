import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { Box, Button, Flex, Loader, Typography } from '@strapi/design-system';
import { listQueries } from '../api/client';
import type { SavedQuery } from '../api/types';
import { pluginId } from '../pluginId';

export function HomepageWidget() {
  const navigate = useNavigate();
  const { formatMessage } = useIntl();
  const [queries, setQueries] = useState<SavedQuery[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listQueries()
      .then((data) => {
        if (!cancelled) setQueries(data.filter((query) => query.isPinned));
      })
      .catch(() => {
        if (!cancelled) setQueries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Flex justifyContent="center" padding={6}>
        <Loader small />
      </Flex>
    );
  }

  if (queries.length === 0) {
    return (
      <Flex direction="column" gap={2} alignItems="flex-start" padding={2}>
        <Typography variant="pi" textColor="neutral600">
          {formatMessage({
            id: `${pluginId}.widget.empty`,
            defaultMessage: 'Pin a saved answer from the plugin to run it here.',
          })}
        </Typography>
        <Link to={`/plugins/${pluginId}`}>
          {formatMessage({ id: `${pluginId}.widget.open`, defaultMessage: 'Open Ask your data' })}
        </Link>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap={2} alignItems="stretch" padding={2}>
      {queries.map((query) => (
        <Box key={query.id}>
          <Button
            variant="secondary"
            size="S"
            width="100%"
            onClick={() =>
              navigate(
                `/plugins/${pluginId}?question=${encodeURIComponent(
                  query.question
                )}&savedQueryId=${query.id}`
              )
            }
          >
            {query.title}
          </Button>
        </Box>
      ))}
    </Flex>
  );
}
