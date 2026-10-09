import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectDatabase } from '../../src/database/connection';
import { guildRepository } from '../../src/repositories/guild.repository';
import { execute } from '../../src/interactions/selectMenus/setup-game.select';
import { requireAdminInteraction } from '../../src/utils/admin-interaction';
import { guildBrandingService } from '../../src/services/guild-branding.service';
vi.mock('../../src/utils/admin-interaction', () => ({ requireAdminInteraction: vi.fn() }));
vi.mock('../../src/services/guild-branding.service', () => ({
  guildBrandingService: { apply: vi.fn() },
}));
beforeAll(connectDatabase);
beforeEach(() => vi.clearAllMocks());
let sequence = 0;
function fixture() {
  const id = `setup-branding-${++sequence}`;
  guildRepository.upsert(id, { game: 'ra3' });
  const interaction: any = {
    guild: { id },
    guildId: id,
    values: ['genevo'],
    reply: vi.fn(),
    deferReply: vi.fn(),
    editReply: vi.fn(),
  };
  return interaction;
}
describe('game setup and bot appearance', () => {
  it('checks staff authorization before saving a game or changing artwork', async () => {
    const interaction = fixture();
    vi.mocked(requireAdminInteraction).mockResolvedValue(false);
    await execute(null as never, interaction);
    expect(guildRepository.findByDiscordId(interaction.guildId)?.game).toBe('ra3');
    expect(guildBrandingService.apply).not.toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });
  it('defers privately before the profile request, then confirms the saved setup', async () => {
    const interaction = fixture();
    vi.mocked(requireAdminInteraction).mockResolvedValue(true);
    vi.mocked(guildBrandingService.apply).mockImplementation(async () => {
      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      return true;
    });
    await execute(null as never, interaction);
    expect(guildRepository.findByDiscordId(interaction.guildId)?.game).toBe('genevo');
    expect(interaction.editReply.mock.calls[0][0].content).toContain('GenEvo avatar and banner');
  });
  it('keeps a saved game usable when Discord refuses the optional profile upload', async () => {
    const interaction = fixture();
    vi.mocked(requireAdminInteraction).mockResolvedValue(true);
    vi.mocked(guildBrandingService.apply).mockResolvedValue(false);
    await execute(null as never, interaction);
    expect(guildRepository.findByDiscordId(interaction.guildId)?.game).toBe('genevo');
    expect(interaction.editReply.mock.calls[0][0].content).toContain('could not be updated');
  });
});
