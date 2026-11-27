import type { PanelStatus, PanelSummary } from "@solar/contracts";

/** Mètres par degré de latitude (sphère, précision suffisante à l'échelle d'un parc). */
const METERS_PER_DEGREE = 111_320;
/** Étendue minimale de la scène (m) : un parc d'un seul panneau reste lisible. */
const MIN_EXTENT_M = 10;

export interface ScenePanel {
  id: string;
  code: string;
  status: PanelStatus;
  /** Est (m), depuis le centre du parc. */
  x: number;
  /** Sud (m), depuis le centre du parc (axe z de three.js, vers la caméra). */
  z: number;
}

export interface ParkScene {
  panels: ScenePanel[];
  /** Demi-largeur de la scène (m), pour placer la caméra et le sol. */
  extent: number;
}

/**
 * Scène 3D du parc (bonus #58, D013) : chaque panneau positionné est placé en mètres autour du
 * centre du parc, à partir de sa latitude et de sa longitude. Les panneaux non positionnés n'y
 * figurent pas (ils sont dans la liste « à positionner »).
 */
export function parkScene(panels: PanelSummary[]): ParkScene {
  const placed = panels.filter((p) => p.latitude !== null && p.longitude !== null);
  if (placed.length === 0) return { panels: [], extent: MIN_EXTENT_M };
  const lat0 = placed.reduce((sum, p) => sum + p.latitude!, 0) / placed.length;
  const lng0 = placed.reduce((sum, p) => sum + p.longitude!, 0) / placed.length;
  const metersPerLng = METERS_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180);
  const scene = placed.map((p) => ({
    id: p.id,
    code: p.code,
    status: p.status,
    x: (p.longitude! - lng0) * metersPerLng,
    z: -(p.latitude! - lat0) * METERS_PER_DEGREE,
  }));
  const extent = Math.max(
    MIN_EXTENT_M,
    ...scene.map((p) => Math.max(Math.abs(p.x), Math.abs(p.z)) + 3),
  );
  return { panels: scene, extent };
}
