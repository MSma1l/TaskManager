import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes';
import { I18nProvider } from '../shared/i18n/I18nProvider';
import LanguagePickerModal from '../shared/i18n/LanguagePickerModal';

export default function App() {
  return (
    <I18nProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
      <LanguagePickerModal />
    </I18nProvider>
  );
}
