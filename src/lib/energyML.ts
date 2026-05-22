export type EnergyReadingForML = {
  id?: number | string;
  capacitor_voltage?: number | null;
  charge_percent?: number | null;
  adc_value?: number | null;
  status?: string | null;
  created_at: string;
};

export type EnergyPrediction = {
  predictedVoltage: number;
  predictedCharge: number;
  predictedEnergyMJ: number;
  confidence: "Low" | "Medium" | "High";
  trainingRecords: number;
  modelType: string;
  message: string;
};

// You are using 5 capacitors of 100uF.
// Total capacitance = 500uF.
const TOTAL_CAPACITANCE_UF = 500;

// Energy formula: E = 1/2 × C × V²
function estimateEnergyMJ(voltage: number) {
  const capacitanceF = TOTAL_CAPACITANCE_UF / 1_000_000;
  const energyJ = 0.5 * capacitanceF * voltage * voltage;
  return energyJ * 1000;
}

function getTimeFeatures(date: Date) {
  const hour = date.getHours();
  const day = date.getDay();

  const hourSin = Math.sin((2 * Math.PI * hour) / 24);
  const hourCos = Math.cos((2 * Math.PI * hour) / 24);

  const daySin = Math.sin((2 * Math.PI * day) / 7);
  const dayCos = Math.cos((2 * Math.PI * day) / 7);

  return [1, hourSin, hourCos, daySin, dayCos];
}

function normalizeMatrix(X: number[][]) {
  const featureCount = X[0].length;
  const means = new Array(featureCount).fill(0);
  const stds = new Array(featureCount).fill(1);

  for (let j = 1; j < featureCount; j++) {
    means[j] = X.reduce((sum, row) => sum + row[j], 0) / X.length;

    const variance =
      X.reduce((sum, row) => sum + Math.pow(row[j] - means[j], 2), 0) /
      X.length;

    stds[j] = Math.sqrt(variance) || 1;
  }

  const normalizedX = X.map((row) =>
    row.map((value, index) => {
      if (index === 0) return 1;
      return (value - means[index]) / stds[index];
    })
  );

  return { normalizedX, means, stds };
}

function trainLinearRegression(
  X: number[][],
  y: number[],
  learningRate = 0.03,
  epochs = 2000
) {
  const { normalizedX, means, stds } = normalizeMatrix(X);
  const featureCount = normalizedX[0].length;
  const weights = new Array(featureCount).fill(0);

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradients = new Array(featureCount).fill(0);

    for (let i = 0; i < normalizedX.length; i++) {
      const prediction = normalizedX[i].reduce(
        (sum, value, index) => sum + value * weights[index],
        0
      );

      const error = prediction - y[i];

      for (let j = 0; j < featureCount; j++) {
        gradients[j] += error * normalizedX[i][j];
      }
    }

    for (let j = 0; j < featureCount; j++) {
      weights[j] -= (learningRate * gradients[j]) / normalizedX.length;

      if (!Number.isFinite(weights[j])) {
        weights[j] = 0;
      }
    }
  }

  return { weights, means, stds };
}

function predict(
  features: number[],
  model: {
    weights: number[];
    means: number[];
    stds: number[];
  }
) {
  const normalizedFeatures = features.map((value, index) => {
    if (index === 0) return 1;
    return (value - model.means[index]) / model.stds[index];
  });

  return normalizedFeatures.reduce(
    (sum, value, index) => sum + value * model.weights[index],
    0
  );
}

export function predictFutureEnergyFromReadings(
  readings: EnergyReadingForML[],
  targetDate: Date
): EnergyPrediction {
  const validReadings = readings.filter((item) => {
    return (
      item.created_at &&
      Number.isFinite(Number(item.capacitor_voltage)) &&
      Number.isFinite(Number(item.charge_percent))
    );
  });

  if (validReadings.length < 8) {
    return {
      predictedVoltage: 0,
      predictedCharge: 0,
      predictedEnergyMJ: 0,
      confidence: "Low",
      trainingRecords: validReadings.length,
      modelType: "Multiple Linear Regression",
      message: "Not enough Supabase records to train the AI/ML model.",
    };
  }

  const X = validReadings.map((item) =>
    getTimeFeatures(new Date(item.created_at))
  );

  const yVoltage = validReadings.map((item) =>
    Number(item.capacitor_voltage || 0)
  );

  const yCharge = validReadings.map((item) =>
    Number(item.charge_percent || 0)
  );

  const voltageModel = trainLinearRegression(X, yVoltage);
  const chargeModel = trainLinearRegression(X, yCharge);

  const futureFeatures = getTimeFeatures(targetDate);

  const predictedVoltageRaw = predict(futureFeatures, voltageModel);
  const predictedChargeRaw = predict(futureFeatures, chargeModel);

  const predictedVoltage = Math.max(0, Math.min(3.3, predictedVoltageRaw));
  const predictedCharge = Math.max(0, Math.min(100, predictedChargeRaw));
  const predictedEnergyMJ = estimateEnergyMJ(predictedVoltage);

  let confidence: "Low" | "Medium" | "High" = "Low";

  if (validReadings.length >= 50) {
    confidence = "High";
  } else if (validReadings.length >= 20) {
    confidence = "Medium";
  }

  return {
    predictedVoltage: Number(predictedVoltage.toFixed(2)),
    predictedCharge: Number(predictedCharge.toFixed(1)),
    predictedEnergyMJ: Number(predictedEnergyMJ.toFixed(4)),
    confidence,
    trainingRecords: validReadings.length,
    modelType: "Multiple Linear Regression with Time Features",
    message: `AI prediction generated using ${validReadings.length} past Supabase records.`,
  };
}
