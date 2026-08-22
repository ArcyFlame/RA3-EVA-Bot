import { Language } from '../repositories/user.repository';

/**
 * Lightweight per-user i18n for the main user-facing screens. English is the
 * source of truth; Russian and Chinese translations cover the same keys.
 */
type Dictionary = Record<string, string>;

const en: Dictionary = {
  'personal.title': '🔔 Personal Settings',
  'personal.description': 'Toggle which notifications you receive via DM and pick your language.',
  'personal.matchDm': '🏆 Tournament Matches',
  'personal.clanDm': '👥 Clan Invites',
  'personal.language': '🌐 Language',
  'personal.languageHint': 'Pick a language from the menu below.',
  'common.enabled': '✅ Enabled',
  'common.disabled': '❌ Disabled',
  'profile.title': "'s Profile",
  'profile.shatabrick': 'Shatabrick (C&C Online)',
  'profile.ra3b': 'RA3BattleNet',
  'profile.rank': 'Rank',
  'profile.elo': 'Elo',
  'profile.noLink': 'No Shatabrick linked. Use `/link_shatabrick` to connect your profile.',
  'profile.ra3bNoLink': 'Not linked. Use `/link_ra3battlenet` to connect your RA3BattleNet persona.',
  'profile.notFound': 'Not found',
  'stats.live': 'RA3 Community Live Stats',
  'stats.recent': '🎮 Recent Matches & Factions',
  'stats.topPlayers': '🏆 Top 10 Players',
  'stats.hof': '🏅 Hall of Fame',
};

const ru: Dictionary = {
  'personal.title': '🔔 Личные настройки',
  'personal.description': 'Настройте DM-уведомления и выберите язык.',
  'personal.matchDm': '🏆 Матчи турниров',
  'personal.clanDm': '👥 Приглашения в кланы',
  'personal.language': '🌐 Язык',
  'personal.languageHint': 'Выберите язык в меню ниже.',
  'common.enabled': '✅ Включено',
  'common.disabled': '❌ Отключено',
  'profile.title': ' - профиль',
  'profile.shatabrick': 'Shatabrick (C&C Online)',
  'profile.ra3b': 'RA3BattleNet',
  'profile.rank': 'Звание',
  'profile.elo': 'Рейтинг',
  'profile.noLink': 'Shatabrick не привязан. Используйте `/link_shatabrick`.',
  'profile.ra3bNoLink': 'Не привязан. Используйте `/link_ra3battlenet`.',
  'profile.notFound': 'Не найдено',
  'stats.live': 'RA3 Community Live Stats',
  'stats.recent': '🎮 Последние матчи и фракции',
  'stats.topPlayers': '🏆 Топ-10 игроков',
  'stats.hof': '🏅 Зал славы',
};

const zh: Dictionary = {
  'personal.title': '🔔 个人设置',
  'personal.description': '设置私信通知并选择语言。',
  'personal.matchDm': '🏆 赛事对局',
  'personal.clanDm': '👥 战队邀请',
  'personal.language': '🌐 语言',
  'personal.languageHint': '请在下方菜单中选择语言。',
  'common.enabled': '✅ 已启用',
  'common.disabled': '❌ 已禁用',
  'profile.title': ' 的档案',
  'profile.shatabrick': 'Shatabrick（C&C Online）',
  'profile.ra3b': 'RA3BattleNet',
  'profile.rank': '段位',
  'profile.elo': '天梯分',
  'profile.noLink': '尚未绑定 Shatabrick。使用 `/link_shatabrick` 绑定。',
  'profile.ra3bNoLink': '尚未绑定。使用 `/link_ra3battlenet` 绑定 RA3BattleNet 角色。',
  'profile.notFound': '未找到',
  'stats.live': 'RA3 Community Live Stats',
  'stats.recent': '🎮 近期对局与阵营',
  'stats.topPlayers': '🏆 前 10 名玩家',
  'stats.hof': '🏅 名人堂',
};

const DICTIONARIES: Record<Language, Dictionary> = { en, ru, zh };

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  ru: 'Русский',
  zh: '中文',
};

/** Translate a key in the user's language, falling back to English. */
export function t(lang: Language, key: string): string {
  return DICTIONARIES[lang]?.[key] ?? en[key] ?? key;
}
