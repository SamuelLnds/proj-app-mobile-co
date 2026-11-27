import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { LineChart } from "../src/components";
import { ThemeProvider } from "../src/theme";
import {
  bubbleLeft,
  emptyChartMessage,
  formatAxisTime,
  formatTooltipTime,
  isVerticalGesture,
  nearestPointIndex,
  timeAtPosition,
} from "../src/utils/chart";

// Lundi 23 novembre 2026, 14 h 35 (heure locale : les tests ne dépendent pas du fuseau).
const MONDAY = new Date(2026, 10, 23, 14, 35);

describe("graduations de l'axe du temps", () => {
  it("affiche HH:MM sur 1 h", () => {
    expect(formatAxisTime(MONDAY, "1h")).toBe("14:35");
    expect(formatAxisTime(new Date(2026, 10, 23, 9, 5), "1h")).toBe("09:05");
  });

  it("affiche HH h sur 24 h", () => {
    expect(formatAxisTime(MONDAY, "24h")).toBe("14 h");
    expect(formatAxisTime(new Date(2026, 10, 23, 0, 0), "24h")).toBe("0 h");
  });

  it("affiche le jour abrégé et la date sur 7 jours", () => {
    expect(formatAxisTime(MONDAY, "7d")).toBe("lun. 23");
    expect(formatAxisTime(new Date(2026, 10, 29, 8, 0), "7d")).toBe("dim. 29");
  });

  it("accepte un instant ISO ou en millisecondes", () => {
    expect(formatAxisTime(MONDAY.toISOString(), "7d")).toBe("lun. 23");
    expect(formatAxisTime(MONDAY.getTime(), "1h")).toBe("14:35");
  });

  it("donne l'heure complète de la bulle", () => {
    expect(formatTooltipTime(MONDAY, "1h")).toBe("14:35");
    expect(formatTooltipTime(MONDAY, "24h")).toBe("14:35");
    expect(formatTooltipTime(MONDAY, "7d")).toBe("lun. 23 · 14:35");
  });

  it("annonce l'absence de mesure selon la période", () => {
    expect(emptyChartMessage("1h")).toBe("Aucune mesure sur la dernière heure");
    expect(emptyChartMessage("24h")).toBe("Aucune mesure sur les dernières 24 heures");
    expect(emptyChartMessage("7d")).toBe("Aucune mesure sur les 7 derniers jours");
  });
});

describe("recherche du point le plus proche", () => {
  const times = [0, 100, 200, 300];

  it("renvoie l'indice de l'instant le plus proche", () => {
    expect(nearestPointIndex(times, 10)).toBe(0);
    expect(nearestPointIndex(times, 160)).toBe(2);
    expect(nearestPointIndex(times, 290)).toBe(3);
  });

  it("se borne aux extrémités", () => {
    expect(nearestPointIndex(times, -500)).toBe(0);
    expect(nearestPointIndex(times, 9000)).toBe(3);
  });

  it("renvoie -1 sans point", () => {
    expect(nearestPointIndex([], 5)).toBe(-1);
  });

  it("convertit une abscisse en instant, bornée à la zone de tracé", () => {
    expect(timeAtPosition(44, 44, 200, 1000, 2000)).toBe(1000);
    expect(timeAtPosition(144, 44, 200, 1000, 2000)).toBe(1500);
    expect(timeAtPosition(500, 44, 200, 1000, 2000)).toBe(2000);
    expect(timeAtPosition(0, 44, 200, 1000, 2000)).toBe(1000);
  });
});

describe("bulle et geste", () => {
  it("garde la bulle dans les bords du graphique", () => {
    expect(bubbleLeft(5, 100, 300)).toBe(0);
    expect(bubbleLeft(150, 100, 300)).toBe(100);
    expect(bubbleLeft(295, 100, 300)).toBe(200);
  });

  it("distingue un geste vertical d'un geste horizontal", () => {
    expect(isVerticalGesture(2, 20)).toBe(true);
    expect(isVerticalGesture(30, 20)).toBe(false);
    expect(isVerticalGesture(0, 3)).toBe(false);
  });
});

describe("LineChart", () => {
  const series = [0, 1, 2, 3, 4].map((i) => ({
    time: new Date(2026, 10, 23, 10 + i, 0).toISOString(),
    value: 100 * (i + 1),
  }));
  const expected = series.map((p) => ({ time: p.time, value: p.value + 50 }));

  const touch = (locationX: number, pageX = locationX, pageY = 40) => ({
    nativeEvent: { locationX, pageX, pageY, touches: [], changedTouches: [] },
  });

  async function renderChart(withExpected = true) {
    await render(
      <ThemeProvider>
        <LineChart
          series={series}
          expected={withExpected ? expected : undefined}
          formatValue={(v) => `${v} W`}
          accessibilityLabel="Production"
          period="7d"
        />
      </ThemeProvider>,
    );
    await fireEvent(screen.getByLabelText("Production"), "layout", {
      nativeEvent: { layout: { width: 344, height: 150 } },
    });
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("affiche l'heure, la valeur réelle et la valeur attendue au toucher", async () => {
    await renderChart();
    // Zone de tracé : de 44 à 344 px ; 344 px = dernier point.
    await fireEvent(screen.getByTestId("chart-touch-area"), "responderGrant", touch(340));
    expect(screen.getByTestId("chart-bubble")).toBeTruthy();
    expect(screen.getByText("lun. 23 · 14:00")).toBeTruthy();
    expect(screen.getByText("Réelle : 500 W")).toBeTruthy();
    expect(screen.getByText("Attendue : 550 W")).toBeTruthy();
  });

  it("suit le doigt pendant le glissement", async () => {
    await renderChart();
    const area = screen.getByTestId("chart-touch-area");
    await fireEvent(area, "responderGrant", touch(340));
    await fireEvent(area, "responderMove", touch(44, 44));
    expect(screen.getByText("Réelle : 100 W")).toBeTruthy();
  });

  it("n'affiche pas la valeur attendue sans courbe attendue", async () => {
    await renderChart(false);
    await fireEvent(screen.getByTestId("chart-touch-area"), "responderGrant", touch(100));
    expect(screen.queryByText(/Attendue/)).toBeNull();
  });

  it("retire la sélection peu après le relâchement", async () => {
    await renderChart();
    const area = screen.getByTestId("chart-touch-area");
    await fireEvent(area, "responderGrant", touch(100));
    await fireEvent(area, "responderRelease", touch(100));
    expect(screen.getByTestId("chart-bubble")).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.queryByTestId("chart-bubble")).toBeNull();
  });

  it("abandonne la lecture quand le geste est vertical", async () => {
    await renderChart();
    const area = screen.getByTestId("chart-touch-area");
    await fireEvent(area, "responderGrant", touch(100, 100, 40));
    await fireEvent(area, "responderMove", touch(102, 102, 80));
    expect(screen.queryByTestId("chart-bubble")).toBeNull();
  });
});
