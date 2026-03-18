export interface TelemetryReading {
  id: number;
  poleId: string;
  timestamp: string;
  energyWatts: number;
  pedestrianCount: number;
  vehicleCount: number;
  cyclistCount: number;
  ambientLightLux: number;
  temperatureC: number;
  humidityPct: number;
  airQualityAqi: number;
  noiseDb: number;
  lightLevelPct: number;
  anomalyFlag: boolean;
  anomalyDescription?: string;
}

export interface TelemetryUpdate {
  simulationTime: string;
  readings: TelemetryReading[];
}
