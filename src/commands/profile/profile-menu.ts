import { ActionRowBuilder, StringSelectMenuBuilder, User } from 'discord.js';
import { GameId } from '../../config/games';
import { Language } from '../../repositories/user.repository';
import { CNC_ONLINE, RA3_BATTLE_NET } from '../../utils/emojis';
import { OwnedSessions } from '../../utils/owned-sessions';
import { ProfilePlatform } from './profile.view';
export const profileSessions = new OwnedSessions<{
  ownerId: string;
  guildId?: string | null;
  target?: User;
  query?: string;
  game: GameId;
  lang: Language;
  initialPlatform: ProfilePlatform;
}>();
export function profileMenu(key: string, game: GameId, selected: ProfilePlatform) {
  const options = [
    { label: 'RA3BattleNet', value: 'ra3b', emoji: RA3_BATTLE_NET, default: selected === 'ra3b' },
  ];
  if (game === 'ra3')
    options.unshift({
      label: 'C&C Online - Shatabrick',
      value: 'cnc',
      emoji: CNC_ONLINE,
      default: selected === 'cnc',
    });
  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('profile_platform:' + key)
        .setPlaceholder('Select statistics platform')
        .addOptions(options),
    ),
  ];
}
