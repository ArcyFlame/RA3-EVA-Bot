import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { RA3Bot } from '../../bot';
import { testConfiguredChannels } from '../../utils/channel-test';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';

export const data = new SlashCommandBuilder()
  .setName('test_channels')
  .setDescription('Check whether the bot can post in every configured channel');

export async function execute(_bot: RA3Bot, interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'This command can only be used inside a server.', ephemeral: true });
    return;
  }
  const denial = denyUnlessAdmin(await resolveMember(interaction));
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  await interaction.editReply({ embeds: [await testConfiguredChannels(interaction.guild)] });
}
