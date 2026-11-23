// Formatage français des valeurs affichées (charte : virgule décimale, espace insécable avant l'unité).

const NBSP = " ";

const decimal = (value: number, digits: number) =>
  value
    .toFixed(digits)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

/** Puissance : en kW avec deux décimales à partir de 1 000 W, sinon en W entiers. */
export function formatPower(watts: number): string {
  if (Math.abs(watts) >= 1000) return `${decimal(watts / 1000, 2)}${NBSP}kW`;
  return `${Math.round(watts)}${NBSP}W`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}${NBSP}%`;
}

export function formatTemperature(celsius: number): string {
  return `${Math.round(celsius)}${NBSP}°C`;
}

export function formatIrradiance(wm2: number): string {
  return `${Math.round(wm2)}${NBSP}W/m²`;
}

export function formatEnergy(wh: number): string {
  return `${decimal(wh, 0)}${NBSP}Wh`;
}

/** Ancienneté relative : « il y a 4 s », « il y a 12 min », « il y a 2 h ». */
export function formatAge(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `il y a ${seconds}${NBSP}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `il y a ${minutes}${NBSP}min`;
  return `il y a ${Math.round(minutes / 60)}${NBSP}h`;
}

const MONTHS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

const pad = (n: number) => String(n).padStart(2, "0");

/** Date absolue courte : « 20 nov., 10:16 ». */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Heure seule : « 10:16 ». */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
