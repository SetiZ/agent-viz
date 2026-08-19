import type { Core } from '@strapi/strapi';
import { registerPermissions } from './permissions';

const register = ({ strapi }: { strapi: Core.Strapi }) => {
  void registerPermissions({ strapi });
};

export default register;
