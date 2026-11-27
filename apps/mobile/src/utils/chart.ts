// Fonctions pures du graphique de courbe : graduations, heure de la bulle, point le plus proche.

/** Période affichée par un graphique (identique à `Period` de `src/api/hooks.ts`). */
export type ChartPeriod = "1h" | "24h" | "7d";

const WEEKDAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

const pad = (n: number) => String(n).padStart(2, "0");

const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Graduation de l'axe du temps : `14:35` (1 h), `14 h` (24 h), `lun. 23` (7 j). */
export function formatAxisTime(time: number | string | Date, period: ChartPeriod): string {
  const d = new Date(time);
  if (period === "1h") return clock(d);
  if (period === "24h") return `${d.getHours()} h`;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
}

/** Heure complète de la bulle : `14:35` (1 h, 24 h) ou `lun. 23 · 14:35` (7 j). */
export function formatTooltipTime(time: number | string | Date, period: ChartPeriod): string {
  const d = new Date(time);
  if (period === "7d") return `${WEEKDAYS[d.getDay()]} ${d.getDate()} · ${clock(d)}`;
  return clock(d);
}

/** Indice de l'instant le plus proche de `target` (instants en ms), ou -1 si la liste est vide. */
export function nearestPointIndex(times: number[], target: number): number {
  let best = -1;
  let bestGap = Infinity;
  times.forEach((t, i) => {
    const gap = Math.abs(t - target);
    if (gap < bestGap) {
      best = i;
      bestGap = gap;
    }
  });
  return best;
}

/** Instant (ms) correspondant à une abscisse de la zone de tracé, bornée à la zone. */
export function timeAtPosition(
  x: number,
  plotLeft: number,
  plotWidth: number,
  t0: number,
  t1: number,
): number {
  if (plotWidth <= 0) return t0;
  const ratio = Math.min(1, Math.max(0, (x - plotLeft) / plotWidth));
  return t0 + ratio * (t1 - t0);
}

/** Bord gauche d'une bulle centrée sur `x`, maintenue dans le graphique. */
export function bubbleLeft(x: number, bubbleWidth: number, containerWidth: number): number {
  return Math.max(0, Math.min(x - bubbleWidth / 2, containerWidth - bubbleWidth));
}

/** Le geste est-il plutôt vertical (défilement de l'écran) ? Seuil en pixels avant de décider. */
export function isVerticalGesture(dx: number, dy: number, threshold = 8): boolean {
  return Math.abs(dy) > threshold && Math.abs(dy) > Math.abs(dx);
}

/** Texte affiché à la place d'un graphique sans mesure. */
export function emptyChartMessage(period: ChartPeriod): string {
  if (period === "1h") return "Aucune mesure sur la dernière heure";
  if (period === "24h") return "Aucune mesure sur les dernières 24 heures";
  return "Aucune mesure sur les 7 derniers jours";
}
