import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { registerFont } from 'canvas';
import { join } from 'path';
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

const RED_ALERT = '"Red Alert", sans-serif';

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

export function chartTrackingNote(startedAt?: string): string {
  if (!startedAt) return 'Collecting real data; missing periods are left blank.';
  const parsed = new Date(startedAt.includes('T') ? startedAt : `${startedAt.replace(' ', 'T')}Z`);
  const date = Number.isNaN(parsed.getTime()) ? startedAt : parsed.toISOString().slice(0, 10);
  return `Tracking since ${date}; missing periods are left blank.`;
}

/** Draws each bar's value on top of it. */
const valueLabelsPlugin = {
  id: 'valueLabels',
  afterDatasetsDraw(chart: any) {
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    if (!meta || chart.options.plugins.valueLabels?.display === false) return;
    ctx.save();
    ctx.font = `bold 28px ${RED_ALERT}`;
    ctx.fillStyle = COLOR_TEXT;
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

const trackingNotePlugin = {
  id: 'trackingNote',
  afterDraw(chart: any, _args: unknown, options: { text?: string }) {
    if (!options.text) return;
    const { ctx, width: chartWidth } = chart;
    ctx.save();
    ctx.font = '22px sans-serif';
    ctx.fillStyle = COLOR_TEXT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(options.text, chartWidth / 2, 140);
    ctx.restore();
  },
};

/**
 * Bar chart in the classic Python-bot style: dark red plot area on a
 * transparent figure (blends into Discord), peach stencil ticks, gradient
 * bars (light base → deep top) with value labels, dotted dark-red grid and
 * title-colored spines. Bars fill the plot densely.
 */
export async function generateBarChart(
  data: Array<number | null>,
  title: string,
  cmap: 'Reds_r' | 'Blues_r' | 'YlOrBr_r' = 'Reds_r',
  trackingNote?: string,
): Promise<Buffer> {
  const labels = title.includes('24 Hours') ? generateHourLabels() : generateDayLabels();
  const numericData = data.filter((value): value is number => typeof value === 'number');

  let titleColor = COLOR_TITLE_RED;
  let deepColor = '#8B1A1A'; // top of the bar gradient
  let lightColor = '#FF6A5A'; // base of the bar gradient
  if (cmap === 'Blues_r') {
    titleColor = COLOR_TITLE_BLUE;
    deepColor = '#1E4E8C';
    lightColor = '#7EB3E0';
  } else if (cmap === 'YlOrBr_r') {
    titleColor = COLOR_TITLE_GOLD;
    deepColor = '#C87810';
    lightColor = '#FFD873';
  }

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
            gradient.addColorStop(0, lightColor);
            gradient.addColorStop(1, deepColor);
            return gradient;
          },
          borderColor: deepColor,
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
          color: titleColor,
          font: { size: 62, weight: 'bold' as const, family: RED_ALERT },
          padding: { top: 12, bottom: 36 },
        },
        subtitle: { display: false },
        trackingNote: { text: trackingNote },
        tooltip: { enabled: false },
        valueLabels: { display: true },
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(...numericData, 1) * 1.12,
          ticks: {
            color: COLOR_TEXT,
            precision: 0,
            maxTicksLimit: 8,
            font: { size: 26, family: RED_ALERT },
          },
          grid: { color: COLOR_GRID, lineWidth: 1.2, borderDash: [4, 6] },
          border: { color: titleColor, width: 3 },
        },
        x: {
          ticks: {
            color: COLOR_TEXT,
            maxRotation: 45,
            minRotation: 45,
            autoSkip: true,
            maxTicksLimit: title.includes('24 Hours') ? 12 : 10,
            font: { size: 26, family: RED_ALERT },
          },
          grid: { color: 'rgba(139, 0, 0, 0.5)', lineWidth: 1, borderDash: [4, 6] },
          border: { color: titleColor, width: 3 },
        },
      },
    },
    plugins: [trackingNotePlugin, valueLabelsPlugin],
  };
  return chartJSNodeCanvas.renderToBuffer(configuration);
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
    const angle = total > 0 ? (values[i] / total) * Math.PI * 2 : Math.PI * 2 / values.length;
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
