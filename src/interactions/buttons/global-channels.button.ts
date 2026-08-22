import { ButtonInteraction, Message } from 'discord.js';
import { RA3Bot } from '../../bot';
import { GuildChannelsWizardView, wizardViews } from '../../commands/notifications/views';
import { denyUnlessAdmin } from '../../utils/permissions';
import { resolveMember } from '../../utils/members';

export const customId = 'global_channels';

export async function execute(_bot: RA3Bot, interaction: ButtonInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'Server only.', ephemeral: true });
    return;
  }
  const member = await resolveMember(interaction);
  const denial = denyUnlessAdmin(member);
  if (denial) {
    await interaction.reply({ content: denial, ephemeral: true });
    return;
  }

  const view = new GuildChannelsWizardView(interaction.guild, interaction.user.id);
  const reply = await interaction.reply({
    embeds: [view.buildEmbed()],
    components: view.getComponents(),
    fetchReply: true,
    // Ephemeral: only the admin who opened it can see/press these buttons.
    ephemeral: true,
  });
  view.setOriginalMessage(reply as Message);
  wizardViews.set(reply.id, view);

  setTimeout(
    () => {
      wizardViews.delete(reply.id);
    },
    10 * 60 * 1000,
  );
}
