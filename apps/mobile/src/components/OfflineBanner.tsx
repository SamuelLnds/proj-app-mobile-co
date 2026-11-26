import { useConnectivity, useLastSync } from "../api";
import { formatDateTime } from "../utils/format";
import { Banner } from "./primitives";

/**
 * Bandeau « Hors ligne » (#37) : visible seulement sans réseau, avec la date des données
 * affichées (dernière réponse du serveur ou copie locale).
 */
export function OfflineBanner({ text }: { text?: string }) {
  const { online } = useConnectivity();
  const lastSync = useLastSync();
  if (online) return null;
  const date = lastSync ? `Données du ${formatDateTime(lastSync)}.` : "Aucune donnée enregistrée.";
  return <Banner tone="nodata" title="Hors ligne" text={text ? `${date} ${text}` : date} />;
}
