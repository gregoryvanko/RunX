// Indice de performance RunX (IPR) — « efficacité » d'une course : vitesse obtenue par battement cardiaque,
// corrigée du dénivelé et de la température. Plus il est élevé, meilleure est la performance.
//
//   IPR = 100 × vitesse équivalente plat (m/min) × facteur chaleur / FC moyenne (bpm)
//
// - Dénivelé : distance « kilomètre-effort » = distance + D+ / 100 (100 m de D+ ≈ 1 km à plat).
// - Température : la chaleur (au-delà de 12 °C) et le froid (sous 5 °C) font monter le cœur et coûtent
//   environ 0,4 % (resp. 0,2 %) de performance par °C : l'indice est relevé d'autant pour comparer
//   des courses faites dans des conditions différentes.
// - Si l'allure s'améliore mais que la FC monte plus vite, l'indice baisse : ce n'est pas un progrès.
// Repère : 5:00/km à plat, 15 °C, 150 bpm → IPR ≈ 135.
//
// Toute modification de la formule s'applique immédiatement à l'historique : l'indice est calculé à la lecture.

const FORMULA_VERSION = 1;
const ELEVATION_M_PER_FLAT_KM = 100;
const HEAT_THRESHOLD_C = 12;
const HEAT_COST_PER_C = 0.004;
const COLD_THRESHOLD_C = 5;
const COLD_COST_PER_C = 0.002;

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

function temperatureFactor(temperatureC) {
  if (temperatureC > HEAT_THRESHOLD_C) return 1 + (temperatureC - HEAT_THRESHOLD_C) * HEAT_COST_PER_C;
  if (temperatureC < COLD_THRESHOLD_C) return 1 + (COLD_THRESHOLD_C - temperatureC) * COLD_COST_PER_C;
  return 1;
}

// run : { distanceKm, durationSec, avgHeartRate, temperatureC, elevationGainM }
function computePerformance(run) {
  const { distanceKm, durationSec, avgHeartRate, temperatureC, elevationGainM } = run;
  const minutes = durationSec / 60;
  const effortKm = distanceKm + elevationGainM / ELEVATION_M_PER_FLAT_KM;
  const speedMPerMin = (effortKm * 1000) / minutes;
  const tempFactor = temperatureFactor(temperatureC);
  return {
    avgPaceSecPerKm: Math.round(durationSec / distanceKm),
    avgSpeedKmh: round(distanceKm / (durationSec / 3600), 2),
    effortKm: round(effortKm, 2),
    gradeAdjustedPaceSecPerKm: Math.round(durationSec / effortKm),
    temperatureFactor: round(tempFactor, 3),
    performanceIndex: round((100 * speedMPerMin * tempFactor) / avgHeartRate, 1),
    formulaVersion: FORMULA_VERSION,
  };
}

module.exports = { computePerformance, temperatureFactor, FORMULA_VERSION };
