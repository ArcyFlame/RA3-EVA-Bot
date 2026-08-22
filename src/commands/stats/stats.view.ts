import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  escapeMarkdown,
} from 'discord.js';
import { RA3Stats } from '../../services/ra3-stats.service';
import {
  CNC_ONLINE,
  RA3_BATTLE_NET,
  ICON_POWER,
  GOLD_CUP,
  FACTION_ALLIED,
  FACTION_SOVIET,
  FACTION_EMPIRE,
  FACTION_RANDOM,
} from '../../utils/emojis';
import { masterRepository } from '../../repositories/master.repository';
import { sanitizeInput } from '../../utils/sanitize';

export type StatsPage = 0 | 1 | 2 | 3;
export type StatsMode = '1v1' | '2v2' | '3v3' | '4v4';
export const STATS_MODES: StatsMode[] = ['1v1', '2v2', '3v3', '4v4'];
export const STATS_PAGES = 4;

export class StatsView {
  private _stats: RA3Stats;
  private page: StatsPage = 0;
  private mode: StatsMode = '1v1';
  private recentMatchCount = 5;
  /** RA3BattleNet sections render only for RA3 servers (KW/GenEvo: C&C Online only). */
  private showRa3b = true;

  constructor(stats: RA3Stats) {
    this._stats = stats;
  }

  updateStats(stats: RA3Stats) {
    this._stats = stats;
  }

  getEmbed(): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(0x2a0a0a)
      .setFooter({ text: 'RA3 Community Stats • Updated every 5 minutes' })
      .setTimestamp();

    if (this.page === 0) {
      embed.setTitle('RA3 Community Live Stats');
      const seasonName = this._stats.ra3b_season
        ? this._stats.ra3b_season.englishName || this._stats.ra3b_season.chineseName
        : undefined;
      // One source at a time: KW/GenEvo servers (RA3BattleNet off) count
      // C&C Online players only, never the combined figure.
      embed.setDescription(
        `${ICON_POWER} **Online Now:** ${this.showRa3b ? this._stats.online_now : this._stats.cnc_online}\n` +
          (this.showRa3b ? `**Peak 24h:** ${this._stats.peak_24h}\n` : '') +
          `\n${CNC_ONLINE} **C&C Online:** ${this._stats.cnc_online} players | Active games: ${this._stats.cnc_active_games}` +
          (this.showRa3b
            ? `\n${RA3_BATTLE_NET} **RA3BattleNet:** ${this._stats.ra3battle_online} players | Active games: ${this._stats.ra3battle_active_games}`
            : '') +
          (seasonName ? `\n\n📅 **Current Season:** ${seasonName}` : ''),
      );
    } else if (this.page === 1) {
      embed.setTitle('🎮 Recent Matches & Factions');
      const cncMatches =
        this._stats.cnc_recent_matches
          .slice(0, this.recentMatchCount)
          .map((m) => `${this._formatPlayers(m.players)} · *${m.map}*`)
          .join('\n') || 'No active games';
      const ra3bMatches =
        this._stats.ra3battle_recent_matches
          .slice(0, this.recentMatchCount)
          .map((m) => `${this._formatPlayers(m.players)} · *${m.map}*`)
          .join('\n') || 'No active games';
      embed.addFields(
        { name: `${CNC_ONLINE} C&C Online`, value: cncMatches, inline: false },
        ...(this.showRa3b
          ? [{ name: `${RA3_BATTLE_NET} RA3BattleNet`, value: ra3bMatches, inline: false }]
          : []),
        {
          name: '🗺️ Most Played Maps (Top 10)',
          value: this._stats.top_maps
            .slice(0, 10)
            .map(([name, count]) => `• **${name}** (${count} games)`)
            .join('\n'),
          inline: false,
        },
        // Faction data comes from the RA3BattleNet API (Shatabrick's will be
        // merged once published) — so the section only exists for RA3 servers.
        // The API reports game COUNTS per faction; percentages are computed.
        ...(this.showRa3b
          ? [
              {
                name: '🎌 Faction Popularity (RA3BattleNet)',
                value: (() => {
                  const f = this._stats.faction_distribution;
                  const fTotal = f.Allies + f.Soviets + f.Empire;
                  if (fTotal <= 0) return 'No faction data right now.';
                  const pct = (n: number) => Math.round((n / fTotal) * 100);
                  return [
                    `${FACTION_ALLIED} Allies: ${pct(f.Allies)}%`,
                    `${FACTION_SOVIET} Soviets: ${pct(f.Soviets)}%`,
                    `${FACTION_EMPIRE} Empire: ${pct(f.Empire)}%`,
                  ].join('\n');
                })(),
                inline: false,
              },
            ]
          : []),
      );
    } else if (this.page === 2) {
      embed.setTitle(`🏆 Top 10 Players - ${this.mode.toUpperCase()}`);
      const cncLb = this._stats.cnc_ladders[this.mode] || [];
      const ra3bLb = this._stats.ra3b_ladders[this.mode] || [];
      embed.addFields(
        {
          name: `${CNC_ONLINE} C&C Online Top 10`,
          value: cncLb.length
            ? cncLb
                .slice(0, 10)
                .map(
                  ([name, elo, faction], i) =>
                    `**${i + 1}** ${this._factionEmoji(faction)} \`${elo}\` ${name}`,
                )
                .join('\n')
            : 'No public ladder API for C&C Online.\nRanks live on Shatabrick.',
          inline: false,
        },
        ...(this.showRa3b
          ? [
              {
                name: `${RA3_BATTLE_NET} RA3BattleNet Top 10`,
                value: ra3bLb.length
                  ? ra3bLb
                      .slice(0, 10)
                      .map(
                        (p, i) =>
                          `**${i + 1}** ${this._factionEmoji(p.primaryFaction)} \`${p.elo}\` ${p.personaName}`,
                      )
                      .join('\n')
                  : this.mode === '4v4'
                    ? 'RA3BattleNet has no 4v4 ladder.'
                    : 'No data yet.',
                inline: false,
              },
            ]
          : []),
      );
    } else if (this.page === 3) {
      embed.setTitle(`${GOLD_CUP} Tournament Wins & Masters`);
      const wins =
        Object.entries(this._stats.tournament_wins)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([p, w], i) => `**${i + 1}** ${p} - ${w} wins`)
          .join('\n') || 'No data';
      embed.addFields(
        { name: `Tournament Wins (Top 10)`, value: wins, inline: false },
        {
          name: '🏅 Hall of Fame',
          value: this._getMastersText() || 'No masters recorded yet.',
          inline: false,
        },
      );
    }
    embed.setFooter({
      text: `Updates every 10 min • Last refresh: ${new Date().toLocaleTimeString()} UTC`,
    });
    embed.setThumbnail(
      'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/17480/header.jpg',
    );
    return embed;
  }

  private _factionEmoji(faction: string): string {
    const f = faction.toLowerCase();
    if (f.includes('allied')) return FACTION_ALLIED;
    if (f.includes('soviet')) return FACTION_SOVIET;
    if (f.includes('empire')) return FACTION_EMPIRE;
    return FACTION_RANDOM;
  }

  private _formatPlayers(players: string): string {
    return players
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => `**${escapeMarkdown(name)}**`)
      .join(' vs ');
  }

  private _getMastersText(): string {
    const rows = masterRepository.getAll();
    if (rows.length === 0) return '';
    let currentYear = 0;
    let text = '';
    let firstYear = true;
    for (const r of rows) {
      if (r.year !== currentYear) {
        if (currentYear !== 0) text += '\n';
        currentYear = r.year;
        text += firstYear ? `\u200b\n**${r.year}**\n` : `**${r.year}**\n`;
        firstYear = false;
      }
      const patchStr = r.patch
        ? r.patch.toLowerCase().startsWith('patch')
          ? ` (${r.patch})`
          : ` (Patch ${r.patch})`
        : '';
      text += `• ${sanitizeInput(r.name, 50)}${patchStr}\n`;
    }
    return text.slice(0, 1024);
  }

  getComponents(): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

    // Navigation row. The current page + mode are encoded in the customId so
    // navigation is stateless — no DB row needed for ephemeral replies.
    // Wrap-around: Previous on page 0 loops to the last page and vice versa.
    const modeIdx = STATS_MODES.indexOf(this.mode);
    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`stats_nav_prev_${this.page}_${modeIdx}`)
        .setLabel('◀ Previous')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`stats_nav_refresh_${this.page}_${modeIdx}`)
        .setLabel('⟳ Refresh')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`stats_nav_next_${this.page}_${modeIdx}`)
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary),
    );
    rows.push(navRow);

    // Mode selector (only on leaderboard page – page 2)
    if (this.page === 2) {
      const modeRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('stats_mode')
          .setPlaceholder('Select game mode')
          .addOptions(
            ...STATS_MODES.map(
              (m) =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(m)
                  .setValue(m)
                  .setDefault(this.mode === m),
            ),
          ),
      );
      rows.push(modeRow);
    }
    return rows;
  }

  setPage(page: StatsPage) {
    this.page = page;
  }
  setMode(mode: StatsMode) {
    this.mode = mode;
  }
  setRecentMatchCount(count: number) {
    this.recentMatchCount = Math.min(10, Math.max(2, Math.floor(count)));
  }
  setShowRa3b(show: boolean) {
    this.showRa3b = show;
  }
  getPage() {
    return this.page;
  }
  getMode() {
    return this.mode;
  }
}
