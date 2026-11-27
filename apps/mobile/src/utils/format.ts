// Formatage français des valeurs affichées (charte : virgule décimale, espace insécable avant l'unité).

const NBSP = " ";

const decimal = (value: number, digits: number) =>
  value
    .toFixed(digits)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

/** Puissance : en kW avec deux décimales à partir de 1 000 W, sinon en W entiers. */
/** Puissance à lire à voix haute : unités en toutes lettres (« 2,66 kilowatts »). */
export function speakPower(watts: number): string {
  if (Math.abs(watts) >= 1000) return `${decimal(watts / 1000, 2)} kilowatts`;
  const w = Math.round(watts);
  return `${w} ${Math.abs(w) > 1 ? "watts" : "watt"}`;
}

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

/** Taille d'un groupe de l'empreinte, et nombre de groupes par ligne (4 lignes pour SHA-256). */
const FINGERPRINT_GROUP = 4;
export const FINGERPRINT_GROUPS_PER_LINE = 4;

/**
 * Empreinte d'une clé découpée en groupes de 4 caractères hexadécimaux en minuscules, comme sur
 * le moniteur série de l'objet (D027) : `3fa9 4c0e 7b21 …`.
 */
export function fingerprintGroups(fingerprint: string): string[] {
  return fingerprint.toLowerCase().match(new RegExp(`.{1,${FINGERPRINT_GROUP}}`, "g")) ?? [];
}

/** Lignes de l'empreinte, 4 groupes par ligne. */
export function fingerprintLines(fingerprint: string): string[] {
  const groups = fingerprintGroups(fingerprint);
  const lines: string[] = [];
  for (let i = 0; i < groups.length; i += FINGERPRINT_GROUPS_PER_LINE) {
    lines.push(groups.slice(i, i + FINGERPRINT_GROUPS_PER_LINE).join(" "));
  }
  return lines;
}

/**
 * Empreinte lue à voix haute : chaque caractère séparé, une pause entre les groupes, pour que le
 * lecteur d'écran l'épelle au lieu de la lire comme un mot.
 */
export function speakFingerprint(fingerprint: string): string {
  return fingerprintGroups(fingerprint)
    .map((group) => group.split("").join(" "))
    .join(", ");
}
