import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { Canvas, registerFont } from 'canvas';
import { existsSync } from 'fs';
import { join } from 'path';
import { GameId } from '../config/games';
import {
  GENEVO_FACTIONS,
  GenevoFactionDistribution,
  GenevoFactionGroup,
  genevoFactionTotal,
} from '../data/genevo-factions';
import { logger } from './logger';

// Stencil font. node-canvas only binds registerFont when it is called twice;
// "Red Alert" is the family that canvas resolves.
const fontPath = join(process.cwd(), 'fonts', 'RedAlert.ttf');
try {
  registerFont(fontPath, { family: 'Red Alert' });
  registerFont(fontPath, { family: 'Red Alert Extended' });
  logger.info('Red Alert font registered');
} catch (error) {
  logger.warn('Red Alert font not found - using fallback font', error);
}

const miedingerPath = join(process.cwd(), 'fonts', 'Miedinger-Book.otf');
if (existsSync(miedingerPath)) {
  try {
    registerFont(miedingerPath, { family: 'Miedinger Book' });
    logger.info('Open-source Miedinger Book font registered');
  } catch (error) {
    logger.warn('Miedinger Book font could not be registered - using fallback font', error);
  }
}

const RED_ALERT = '"Red Alert", sans-serif';
const MIEDINGER = '"Miedinger Book", Arial, sans-serif';

// Classic style (from the original Python bot): transparent figure, peach
// labels, gradient bars with value labels, dotted dark-red grid. Rendered at
// 2× size (with 2× fonts) so Discord's downscale stays crisp.
const width = 1800;
const height = 700;

const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width,
  height,
  backgroundColour: 'rgba(0,0,0,0)',
});

// Classic palette (from the original Python bot).
const COLOR_TEXT = '#FFDAB9';
const COLOR_GRID = 'rgba(139, 0, 0, 0.6)';
const COLOR_TITLE_RED = '#FF0F0F';
const COLOR_TITLE_BLUE = '#4682B4';
const COLOR_TITLE_GOLD = '#FFD700';

export type BarChartPalette = 'Reds_r' | 'Blues_r' | 'YlOrBr_r';

/** Display order: RA3 red/blue/gold; GenEvo blue/gold/green. */
export function statsChartPalettes(
  game: GameId,
): [BarChartPalette, BarChartPalette, BarChartPalette] {
  return game === 'genevo' ? ['Blues_r', 'YlOrBr_r', 'Reds_r'] : ['Reds_r', 'Blues_r', 'YlOrBr_r'];
}

export interface BarChartTheme {
  titleColor: string;
  deepColor: string;
  lightColor: string;
  textColor: string;
  gridColor: string;
  xGridColor: string;
  fontFamily: string;
}

/** Keeps RA3's classic red style and gives Generals Evolution a military palette. */
export function getBarChartTheme(game: GameId, palette: BarChartPalette): BarChartTheme {
  if (game === 'genevo') {
    const colors =
      palette === 'YlOrBr_r'
        ? { titleColor: '#D8B45B', deepColor: '#705621', lightColor: '#D9C27C' }
        : palette === 'Blues_r'
          ? { titleColor: '#60A5FA', deepColor: '#1D4ED8', lightColor: '#93C5FD' }
          : { titleColor: '#A7C957', deepColor: '#31572C', lightColor: '#90A955' };
    return {
      ...colors,
      textColor: '#EFE4C2',
      gridColor: 'rgba(104, 124, 70, 0.55)',
      xGridColor: 'rgba(83, 102, 55, 0.45)',
      fontFamily: MIEDINGER,
    };
  }

  const colors =
    palette === 'Blues_r'
      ? { titleColor: COLOR_TITLE_BLUE, deepColor: '#1E4E8C', lightColor: '#7EB3E0' }
      : palette === 'YlOrBr_r'
        ? { titleColor: COLOR_TITLE_GOLD, deepColor: '#C87810', lightColor: '#FFD873' }
        : { titleColor: COLOR_TITLE_RED, deepColor: '#8B1A1A', lightColor: '#FF6A5A' };
  return {
    ...colors,
    textColor: COLOR_TEXT,
    gridColor: COLOR_GRID,
    xGridColor: 'rgba(139, 0, 0, 0.5)',
    fontFamily: RED_ALERT,
  };
}

/** Draws each bar's value on top of it. */
function createValueLabelsPlugin(theme: BarChartTheme) {
  return {
    id: 'valueLabels',
    afterDatasetsDraw(chart: any) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      if (!meta || chart.options.plugins.valueLabels?.display === false) return;
      ctx.save();
      ctx.font = `bold 28px ${theme.fontFamily}`;
      ctx.fillStyle = theme.textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const values = (chart.data.datasets[0].data as Array<number | null>).filter(
        (value): value is number => typeof value === 'number',
      );
      const maxVal = Math.max(...values, 1);
      for (let i = 0; i < meta.data.length; i++) {
        const bar = meta.data[i];
        const value = chart.data.datasets[0].data[i];
        if (value == null || bar?.x == null) continue;
        ctx.fillText(String(value), bar.x, bar.y - maxVal * 0.015);
      }
      ctx.restore();
    },
  };
}

/**
 * Bar chart in the classic Python-bot style: dark red plot area on a
 * transparent figure (blends into Discord), peach stencil ticks, gradient
 * bars (light base → deep top) with value labels, dotted dark-red grid and
 * title-colored spines. Bars fill the plot densely.
 */
export async function generateBarChart(
  data: Array<number | null>,
  title: string,
  cmap: BarChartPalette = 'Reds_r',
  game: GameId = 'ra3',
): Promise<Buffer> {
  const labels = title.includes('24 Hours') ? generateHourLabels() : generateDayLabels();
  const numericData = data.filter((value): value is number => typeof value === 'number');
  const theme = getBarChartTheme(game, cmap);

  const configuration = {
    type: 'bar' as const,
    data: {
      labels,
      datasets: [
        {
          label: title,
          data,
          backgroundColor: (context: any) => {
            const { chart } = context;
            const { ctx } = chart;
            const meta = chart.getDatasetMeta(0);
            const firstBar = meta?.data?.[0];
            const barWidth = firstBar?.width || 20;
            const gradient = ctx.createLinearGradient(
              firstBar?.x - barWidth / 2 || 0,
              0,
              firstBar?.x + barWidth / 2 || 40,
              height,
            );
            // Diagonal gradient, like matplotlib's _gradient_image.
            gradient.addColorStop(0, theme.lightColor);
            gradient.addColorStop(1, theme.deepColor);
            return gradient;
          },
          borderColor: theme.deepColor,
          borderWidth: 0,
          categoryPercentage: 1,
          barPercentage: 0.92,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      layout: { padding: { top: 36, left: 8, right: 16 } },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: title,
          color: theme.titleColor,
          font: { size: 62, weight: 'bold' as const, family: theme.fontFamily },
          padding: { top: 12, bottom: 36 },
        },
        subtitle: { display: false },
        tooltip: { enabled: false },
        valueLabels: { display: true },
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(...numericData, 1) * 1.12,
          ticks: {
            color: theme.textColor,
            precision: 0,
            maxTicksLimit: 8,
            font: { size: 26, family: theme.fontFamily },
          },
          grid: { color: theme.gridColor, lineWidth: 1.2, borderDash: [4, 6] },
          border: { color: theme.titleColor, width: 3 },
        },
        x: {
          ticks: {
            color: theme.textColor,
            maxRotation: 45,
            minRotation: 45,
            autoSkip: true,
            maxTicksLimit: title.includes('24 Hours') ? 12 : 10,
            font: { size: 26, family: theme.fontFamily },
          },
          grid: { color: theme.xGridColor, lineWidth: 1, borderDash: [4, 6] },
          border: { color: theme.titleColor, width: 3 },
        },
      },
    },
    plugins: [createValueLabelsPlugin(theme)],
  };
  return chartJSNodeCanvas.renderToBuffer(configuration);
}

/**
 * GenEvo's 12-faction chart. Null values render as unavailable rather than as
 * invented zeroes, while the layout is ready for a future Shatabrick source.
 */
export async function generateGenevoFactionChartBuffer(
  data: GenevoFactionDistribution,
): Promise<Buffer> {
  const canvas = new Canvas(1800, 1200);
  const ctx = canvas.getContext('2d');
  const total = genevoFactionTotal(data);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#D8B45B';
  ctx.font = `60px ${MIEDINGER}`;
  ctx.fillText('Generals Evolution Factions', 900, 82);
  ctx.fillStyle = '#EFE4C2';
  ctx.font = `28px ${MIEDINGER}`;
  ctx.fillText(
    total > 0
      ? `${total} recorded faction selections`
      : 'Awaiting Shatabrick or another compatible faction statistics source',
    900,
    132,
  );

  const centerX = 570;
  const centerY = 650;
  const radius = 350;
  const innerRadius = 205;
  const values = GENEVO_FACTIONS.map((faction) => data[faction.name]);
  const denominator = total > 0 ? total : GENEVO_FACTIONS.length;
  let startAngle = -Math.PI / 2;
  for (let index = 0; index < GENEVO_FACTIONS.length; index++) {
    const faction = GENEVO_FACTIONS[index];
    const value = values[index];
    const wedgeValue = total > 0 ? (typeof value === 'number' ? value : 0) : 1;
    const angle = (wedgeValue / denominator) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + angle);
    ctx.arc(centerX, centerY, innerRadius, startAngle + angle, startAngle, true);
    ctx.closePath();
    ctx.globalAlpha = total > 0 ? 1 : 0.32;
    ctx.fillStyle = faction.color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 4;
    ctx.stroke();
    startAngle += angle;
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 64px ${MIEDINGER}`;
  ctx.fillText(total > 0 ? String(total) : '—', centerX, centerY - 8);
  ctx.fillStyle = '#9CA38E';
  ctx.font = `25px ${MIEDINGER}`;
  ctx.fillText(total > 0 ? 'TOTAL PICKS' : 'NO DATA YET', centerX, centerY + 40);

  const groups: GenevoFactionGroup[] = ['USA', 'China', 'GLA'];
  const legendX = 1030;
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex];
    const groupFactions = GENEVO_FACTIONS.filter((faction) => faction.group === group);
    const top = 225 + groupIndex * 305;
    ctx.textAlign = 'left';
    ctx.fillStyle = groupFactions[1].color;
    ctx.font = `bold 38px ${MIEDINGER}`;
    ctx.fillText(group, legendX, top);
    for (let row = 0; row < groupFactions.length; row++) {
      const faction = groupFactions[row];
      const value = data[faction.name];
      const y = top + 58 + row * 55;
      const label = faction.name === group ? 'Base Faction' : faction.name.slice(group.length + 3);
      ctx.fillStyle = faction.color;
      ctx.fillRect(legendX, y - 20, 26, 26);
      ctx.fillStyle = '#EFE4C2';
      ctx.font = `25px ${MIEDINGER}`;
      ctx.fillText(label, legendX + 45, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = typeof value === 'number' ? '#FFFFFF' : '#8B927F';
      ctx.fillText(
        typeof value === 'number' && total > 0
          ? `${value} (${((value / total) * 100).toFixed(1)}%)`
          : '—',
        1720,
        y,
      );
      ctx.textAlign = 'left';
    }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#9CA38E';
  ctx.font = `24px ${MIEDINGER}`;
  ctx.fillText(
    total > 0
      ? 'Counts update when a compatible statistics source reports selected generals.'
      : 'The circular layout is ready; unavailable values are shown as dashes.',
    900,
    1160,
  );
  return canvas.toBuffer('image/png');
}

/**
 * Faction pie: transparent donut with percentage labels and the total in the
 * center, drawn at 2× density.
 */
export async function generatePieChartBuffer(data: Record<string, number>): Promise<Buffer> {
  const labels = Object.keys(data);
  const values = Object.values(data);
  const colors = ['#3B82F6', '#EF4444', '#F59E0B'];
  const total = values.reduce((a, b) => a + b, 0);

  // 2× bitmap with a 2× context transform: draw in 800×600 coordinates.
  const canvas = new (await import('canvas')).Canvas(1600, 1200);
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  const centerX = 400;
  const centerY = 310;
  const radius = 195;
  const innerRadius = radius * 0.58; // donut ring (wedge width 0.42)
  const explode = 6; // slices slightly separated, like matplotlib explode=0.03
  const labelRadius = radius * 0.8;

  let startAngle = -Math.PI / 2;
  const midAngles: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const angle = total > 0 ? (values[i] / total) * Math.PI * 2 : (Math.PI * 2) / values.length;
    const midAngle = startAngle + angle / 2;
    midAngles.push(midAngle);

    // Slice center nudged outward (explode effect).
    const ox = centerX + Math.cos(midAngle) * explode;
    const oy = centerY + Math.sin(midAngle) * explode;
    ctx.beginPath();
    ctx.arc(ox, oy, radius, startAngle, startAngle + angle);
    ctx.arc(ox, oy, innerRadius, startAngle + angle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.stroke();
    startAngle += angle;
  }

  // Percentage labels (bold white, 1 decimal) on the ring.
  ctx.font = `bold 16px ${RED_ALERT}`;
  for (let i = 0; i < values.length; i++) {
    const pct = total > 0 ? (values[i] / total) * 100 : 0;
    const x = centerX + Math.cos(midAngles[i]) * labelRadius + Math.cos(midAngles[i]) * explode;
    const y = centerY + Math.sin(midAngles[i]) * labelRadius + Math.sin(midAngles[i]) * explode;
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${pct.toFixed(1)}%`, x, y);
  }

  // Center: total players.
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.font = `bold 34px ${RED_ALERT}`;
  ctx.fillText(total.toString(), centerX, centerY - 2);
  ctx.font = `12px ${RED_ALERT}`;
  ctx.fillStyle = '#9CA3AF';
  ctx.fillText('TOTAL PLAYERS', centerX, centerY + 26);

  // Title (white, like the old pie).
  ctx.fillStyle = 'white';
  ctx.font = `bold 28px ${RED_ALERT}`;
  ctx.fillText(
    'Faction Distribution',
    centerX - ctx.measureText('Faction Distribution').width / 2,
    50,
  );

  // Legend on the right.
  for (let i = 0; i < labels.length; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(630, 200 + i * 34, 15, 15);
    ctx.fillStyle = '#D1D5DB';
    ctx.font = `14px ${RED_ALERT}`;
    ctx.textAlign = 'left';
    ctx.fillText(labels[i], 652, 212 + i * 34);
  }

  return canvas.toBuffer('image/png');
}

// Helper functions for labels
function generateHourLabels(): string[] {
  const now = new Date();
  const labels: string[] = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getTime() - (23 - i) * 60 * 60 * 1000);
    const hour = d.getHours();
    if (hour === 0) labels.push('12 AM');
    else if (hour < 12) labels.push(`${hour} AM`);
    else if (hour === 12) labels.push('12 PM');
    else labels.push(`${hour - 12} PM`);
  }
  return labels;
}

function generateDayLabels(): string[] {
  const now = new Date();
  const labels: string[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - (29 - i) * 24 * 60 * 60 * 1000);
    labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  }
  return labels;
}
