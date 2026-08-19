import { useLocation } from 'react-router-dom';
import { HomePage } from './HomePage';
import { SettingsPage } from './SettingsPage';

export function App() {
  const location = useLocation();
  const isSettings = location.pathname.endsWith('/settings');
  return isSettings ? <SettingsPage /> : <HomePage />;
}
