import { Events, Guild, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { RA3Bot } from '../bot';
import { guildRepository } from '../repositories/guild.repository';
import { logger } from '../utils/logger';

export const name = Events.GuildCreate;
export const once = false;

export async function execute(_bot: RA3Bot, guild: Guild): Promise<void> {
  guildRepository.upsert(guild.id, { discordId: guild.id });
  logger.info(`Bot added to guild ${guild.name} (${guild.id})`);

  const guildData = guildRepository.findByDiscordId(guild.id);
  if (guildData?.welcomeEnabled === 0) {
    logger.info(`Welcome message disabled for guild ${guild.id}, skipping.`);
    return;
  }

  // First-time onboarding: DM the server owner a get-started guide the first
  // time the bot joins (no admin role and no channels configured yet).
  const configured =
    !!guildData?.adminRoleId ||
    !!guildData?.clanChannelId ||
    !!guildData?.tournamentEventsChannelId ||
    !!guildData?.twitchChannelId;

  try {
    const owner = await guild.fetchOwner();
    if (configured) {
      const embed = new EmbedBuilder()
        .setTitle('Thanks for adding me!')
        .setDescription(
          'Run `/bot_setup` to review this server\u2019s configuration, or `/help` to browse everything the bot can do.',
        )
        .setColor(0x5865f2);
      await owner.send({ embeds: [embed] });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🛠️ Welcome - let\u2019s set up your RA3 server!')
      .setDescription(
        `Thanks for adding me to **${guild.name}**! Three quick steps and everything is running:`,
      )
      .setColor(0x5865f2)
      .addFields(
        {
          name: '1. Run the setup wizard',
          value: 'Use `/bot_setup` on your server to set the admin role, channels and features.',
        },
        {
          name: '2. Enable features',
          value: 'Clans, tournaments, stream notifications, lobby tracker, stats panel - flip them on in `/toggle`.',
        },
        {
          name: '3. Bind channels',
          value: 'In `/bot_setup` → Notification Channels, pick where tournaments, news and streams should post.',
        },
        {
          name: 'Need help?',
          value: '`/help` lists every command, and `/setup` shows players how to play RA3 online.',
        },
      );
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('C&C Online')
        .setStyle(ButtonStyle.Link)
        .setURL('https://cnc-online.net/en/download/'),
      new ButtonBuilder()
        .setLabel('RA3BattleNet')
        .setStyle(ButtonStyle.Link)
        .setURL('https://ra3battle.net'),
    );
    await owner.send({ embeds: [embed], components: [row] });
  } catch (error) {
    logger.warn(`Could not deliver welcome DM for guild ${guild.id}:`, error);
  }
}
