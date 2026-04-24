import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import i18n, { LANG_STORAGE_KEY, type SupportedLanguage } from '@/i18n';

interface LanguageToggleProps {
  className?: string;
}

const NEXT_LANG: Record<SupportedLanguage, SupportedLanguage> = {
  'zh-CN': 'en',
  en: 'zh-CN',
};

function resolveCurrent(lang: string | undefined): SupportedLanguage {
  if (!lang) return 'zh-CN';
  if (lang.startsWith('en')) return 'en';
  return 'zh-CN';
}

export default function LanguageToggle({ className }: LanguageToggleProps) {
  const { t, i18n: i18nInstance } = useTranslation();
  const current = resolveCurrent(i18nInstance.language);
  const next = NEXT_LANG[current];
  const currentBadge = current === 'zh-CN'
    ? t('header.languageChineseLabel')
    : t('header.languageEnglishLabel');

  const handleClick = () => {
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // ignore: privacy mode / quota — i18n.changeLanguage will still set
    }
    void i18n.changeLanguage(next).finally(() => {
      window.location.reload();
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid="button-language-toggle"
      aria-label={t('header.language')}
      title={t('header.language')}
      className={
        className ??
        'game-header__sticker-icon game-header__sticker-icon--language'
      }
    >
      <Languages />
      <span className="game-header__sticker-icon__num game-header__sticker-icon__num--small">
        {currentBadge}
      </span>
    </button>
  );
}
