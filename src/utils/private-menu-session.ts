import { randomBytes } from 'node:crypto';
import {
  AnySelectMenuInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
  ModalSubmitInteraction,
} from 'discord.js';

export type MenuInteraction = ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction;
export interface PrivateMenu<T> {
  id: string;
  ownerId: string;
  guildId: string;
  expires: number;
  busy: boolean;
  value: T;
}

/** Short-lived, actor/server-bound state. Confirmation consumes the session before any write. */
export class PrivateMenuSessions<T> {
  private sessions = new Map<string, PrivateMenu<T>>();

  create(interaction: ChatInputCommandInteraction, value: T): PrivateMenu<T> {
    this.sweep();
    if (!interaction.guildId) throw new Error('Open this menu inside a server.');
    if (this.sessions.size >= 1000) throw new Error('Too many open menus. Please try again later.');
    const session = {
      id: randomBytes(12).toString('hex'),
      ownerId: interaction.user.id,
      guildId: interaction.guildId,
      expires: Date.now() + 15 * 60_000,
      busy: false,
      value,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async resolve(interaction: MenuInteraction): Promise<PrivateMenu<T> | null> {
    this.sweep();
    const id = interaction.customId.split(':')[2];
    const session = this.sessions.get(id);
    if (
      !session ||
      session.busy ||
      session.ownerId !== interaction.user.id ||
      session.guildId !== interaction.guildId ||
      (!interaction.isModalSubmit() && !interaction.message.flags.has(MessageFlags.Ephemeral))
    ) {
      await interaction.reply({
        content: 'This menu expired or belongs to someone else. Run the command again.',
        ephemeral: true,
      });
      return null;
    }
    session.busy = true;
    return session;
  }

  consume(session: PrivateMenu<T>) {
    this.sessions.delete(session.id);
  }

  private sweep() {
    for (const [id, session] of this.sessions) {
      if (session.expires <= Date.now()) this.sessions.delete(id);
    }
  }
}
