import type { PluginDefinition } from '@strapi/admin/strapi-admin';
import { PuzzlePiece } from '@strapi/icons';
import { pluginId, pluginName } from './pluginId';
import PluginIcon from './components/PluginIcon';

const plugin: PluginDefinition = {
  register(app) {
    app.addMenuLink({
      to: `/plugins/${pluginId}`,
      icon: PluginIcon,
      intlLabel: {
        id: `${pluginId}.plugin.name`,
        defaultMessage: pluginName,
      },
      permissions: [],
      Component: async () => {
        const { App } = await import('./pages/App');
        return { default: App };
      },
    });

    app.registerPlugin({
      id: pluginId,
      name: pluginName,
    });

    app.widgets.register({
      id: 'homepage',
      pluginId,
      icon: PuzzlePiece,
      title: {
        id: `${pluginId}.widget.title`,
        defaultMessage: 'Ask your data',
      },
      component: async () => {
        const { HomepageWidget } = await import('./components/HomepageWidget');
        return HomepageWidget;
      },
      link: {
        label: {
          id: `${pluginId}.widget.link`,
          defaultMessage: 'Open Ask your data',
        },
        href: `/plugins/${pluginId}`,
      },
    });
  },
  async registerTrads({ locales }: { locales: string[] }) {
    return Promise.all(
      locales.map((locale) =>
        import(`./translations/${locale}.json`)
          .then(({ default: data }) => ({ data, locale }))
          .catch(() => ({ data: {}, locale }))
      )
    );
  },
};

export default plugin;
