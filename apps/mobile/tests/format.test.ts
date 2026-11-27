import { formatAge, formatPercent, formatPower } from "../src/utils/format";

const NBSP = " ";

describe("formatage français", () => {
  it("affiche les puissances en W puis en kW avec virgule", () => {
    expect(formatPower(420)).toBe(`420${NBSP}W`);
    expect(formatPower(3150.5)).toBe(`3,15${NBSP}kW`);
  });

  it("arrondit les pourcentages", () => {
    expect(formatPercent(63.4)).toBe(`63${NBSP}%`);
  });

  it("exprime l'ancienneté en secondes, minutes ou heures", () => {
    const now = new Date("2026-11-20T10:16:00Z");
    expect(formatAge("2026-11-20T10:15:56Z", now)).toBe(`il y a 4${NBSP}s`);
    expect(formatAge("2026-11-20T10:04:00Z", now)).toBe(`il y a 12${NBSP}min`);
  });
});
