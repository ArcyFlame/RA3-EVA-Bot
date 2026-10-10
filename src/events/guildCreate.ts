import {
  Events,
  Guild,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { RA3Bot } from '../bot';
import { guildRepository } from '../repositories/guild.repository';
import { logger } from '../utils/logger';
import { db } from '../database/sqlite';
import {
  serviceCredentials,
  SERVICE_FIELDS,
  ServiceId,
} from '../services/service-credentials.service';

export const name = Events.GuildCreate;
export const once = false;

export async function execute(_bot: RA3Bot, guild: Guild): Promise<void> {
  const firstJoin = !guildRepository.findByDiscordId(guild.id);
  guildRepository.upsert(guild.id, { discordId: guild.id });
  logger.info(`Bot added to guild ${guild.name} (${guild.id})`);

  const guildData = guildRepository.findByDiscordId(guild.id);
  if (guildData?.welcomeEnabled === 0 && !firstJoin) {
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
    const onboardingKey = `onboarding_sent:${guild.id}`;
    if (db.prepare('SELECT 1 FROM app_settings WHERE key=?').get(onboardingKey)) return;
    db.prepare('INSERT INTO app_settings(key,value) VALUES(?,?)').run(onboardingKey, '1');
    await serviceCredentials.checkAll().catch(() => undefined);
    const owner = await guild.fetchOwner();
    if (configured) {
      const embed = new EmbedBuilder()
        .setTitle('Thanks for adding me!')
        .setDescription(
          'Run `/bot setup` to review this server\u2019s configuration, or `/help` to browse everything the bot can do.',
        )
        .setColor(0x5865f2);
      await owner.send({ embeds: [embed] });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🛠️ Welcome - set up your community bot')
      .setDescription(
        `Thanks for adding me to **${guild.name}**! This guide is sent only to the server owner. Run /bot setup inside the server for a private configuration menu.`,
      )
      .setColor(0x5865f2)
      .addFields(
        {
          name: '1. Run the setup wizard',
          value: 'Use `/bot setup` on your server to set the admin role, channels and features.',
        },
        {
          name: '2. Enable features',
          value:
            'Clans, tournaments, stream notifications, lobby tracker, stats panel - flip them on in `/toggle`.',
        },
        {
          name: '3. Bind channels',
          value:
            'In `/bot setup` → Notification Channels, pick where tournaments, news and streams should post.',
        },
        {
          name: '4. Optional service connections',
          value:
            'Use /api to check connections. The bot owner can add shared keys later; missing or invalid keys do not stop public news, stats, replays or the rest of the bot.\n' +
            (Object.keys(SERVICE_FIELDS) as ServiceId[])
              .map((service) => `${service}: ${serviceCredentials.status(service)}`)
              .join('\n'),
        },
        {
          name: '5. Customize the bot profile',
          value:
            'Use /bot profile or Bot Server Profile in the wizard to change the nickname, description, avatar and banner for this server. Upload an image or use a direct image link.',
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
