import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { Layouts, useNotification } from '@strapi/admin/strapi-admin';
import { Box, Button, Field, Flex, Typography } from '@strapi/design-system';
import { getSettings, listTools, updateSettings } from '../api/client';
import { MASKED_SECRET, type VizSettings } from '../api/types';
import { pluginId } from '../pluginId';

const SECRET_FIELDS = ['adminToken', 'llmApiKey'] as const;

export function SettingsPage() {
  const { toggleNotification } = useNotification();
  const { formatMessage } = useIntl();
  const [form, setForm] = useState<Partial<VizSettings>>({});
  const [tools, setTools] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [settings, toolNames] = await Promise.all([getSettings(), listTools()]);
        if (!active) return;
        setForm(settings);
        setTools(toolNames);
      } catch {
        // settings panel still renders with empty form
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setField = useCallback((key: keyof VizSettings, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await updateSettings(form);
      const settings = await getSettings();
      setForm(settings);
      setTools(await listTools());
      toggleNotification({
        type: 'success',
        message: formatMessage({
          id: `${pluginId}.settings.saved`,
          defaultMessage: 'Settings saved',
        }),
      });
    } catch {
      toggleNotification({
        type: 'warning',
        message: formatMessage({
          id: `${pluginId}.settings.error`,
          defaultMessage: 'Failed to save settings',
        }),
      });
    } finally {
      setSaving(false);
    }
  }, [form, toggleNotification, formatMessage]);

  return (
    <Layouts.Root>
      <Layouts.Header
        title={formatMessage({ id: `${pluginId}.settings.title`, defaultMessage: 'Settings' })}
        subtitle={formatMessage({
          id: `${pluginId}.settings.subtitle`,
          defaultMessage:
            'Configure the MCP endpoint and the LLM provider used to answer questions.',
        })}
        primaryAction={
          <Button loading={saving} disabled={loading} onClick={() => void save()}>
            {formatMessage({ id: `${pluginId}.settings.save`, defaultMessage: 'Save' })}
          </Button>
        }
      />
      <Layouts.Content>
        <Box background="neutral0" borderColor="neutral150" hasRadius padding={6}>
          <Flex direction="column" alignItems="stretch" gap={4}>
            {[
              {
                key: 'mcpUrl',
                labelId: `${pluginId}.settings.mcpUrl`,
                labelDefault: 'MCP URL',
                hintId: `${pluginId}.settings.mcpUrlHint`,
                hintDefault: 'Strapi MCP endpoint, e.g. http://localhost:1337/mcp',
              },
              {
                key: 'adminToken',
                labelId: `${pluginId}.settings.adminToken`,
                labelDefault: 'MCP admin token',
                hintId: `${pluginId}.settings.adminTokenHint`,
                hintDefault: 'Read-only admin API token (stored secret)',
              },
              {
                key: 'llmBaseUrl',
                labelId: `${pluginId}.settings.llmBaseUrl`,
                labelDefault: 'LLM base URL',
                hintId: `${pluginId}.settings.llmBaseUrlHint`,
                hintDefault: 'OpenAI-compatible /chat/completions base URL',
              },
              {
                key: 'llmApiKey',
                labelId: `${pluginId}.settings.llmApiKey`,
                labelDefault: 'LLM API key',
                hintId: `${pluginId}.settings.llmApiKeyHint`,
                hintDefault: 'Provider API key (stored secret)',
              },
              {
                key: 'llmModel',
                labelId: `${pluginId}.settings.llmModel`,
                labelDefault: 'LLM model',
                hintId: `${pluginId}.settings.llmModelHint`,
                hintDefault: 'e.g. gpt-4o-mini',
              },
            ].map(({ key, labelId, labelDefault, hintId, hintDefault }) => (
              <Field.Root
                key={key}
                name={key}
                hint={formatMessage({ id: hintId, defaultMessage: hintDefault })}
              >
                <Field.Label>
                  {formatMessage({ id: labelId, defaultMessage: labelDefault })}
                </Field.Label>
                <Field.Input
                  name={key}
                  value={form[key as keyof VizSettings] ?? ''}
                  placeholder={
                    (SECRET_FIELDS as readonly string[]).includes(key) &&
                    form[key as keyof VizSettings] === MASKED_SECRET
                      ? formatMessage({
                          id: `${pluginId}.settings.keepSecret`,
                          defaultMessage: 'Leaving blank keeps the stored value',
                        })
                      : undefined
                  }
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setField(key as keyof VizSettings, event.target.value)
                  }
                />
                <Field.Hint />
              </Field.Root>
            ))}
            <Box>
              <Typography variant="sigma" textColor="neutral600">
                {formatMessage({
                  id: `${pluginId}.settings.tools`,
                  defaultMessage: 'Available tools',
                })}
              </Typography>
              <Typography variant="pi" textColor="neutral600">
                {tools.length > 0
                  ? tools.join(', ')
                  : loading
                    ? formatMessage({
                        id: `${pluginId}.settings.toolsLoading`,
                        defaultMessage: 'Loading…',
                      })
                    : formatMessage({
                        id: `${pluginId}.settings.toolsNone`,
                        defaultMessage: 'None',
                      })}
              </Typography>
            </Box>
          </Flex>
        </Box>
      </Layouts.Content>
    </Layouts.Root>
  );
}
