export type PiezoReading = {
  id?: number;
  voltage: number;
  energy_mj?: number;
  footstep_count?: number;
  status?: string;
  created_at: string;
};

export type EnergyPrediction = {
  predictedEnergy: number;
  confidence: "Low" | "Medium" | "High";
  trainingRecords: number;
  modelType: string;
  message: string;
};

function sigmoidSafe(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1e6, Math.min(1e6, value));
}

function getFeatures(date: Date, voltage: number, footstepCount: number) {
  const hour = date.getHours();
  const day = date.getDay();

  const hourSin = Math.sin((2 * Math.PI * hour) / 24);
  const hourCos = Math.cos((2 * Math.PI * hour) / 24);

  const daySin = Math.sin((2 * Math.PI * day) / 7);
  const dayCos = Math.cos((2 * Math.PI * day) / 7);

  return [
    1,
    hourSin,
    hourCos,
    daySin,
    dayCos,
    voltage,
    footstepCount,
  ];
}

function estimateFutureInputs(readings: PiezoReading[], targetDate: Date) {
  const targetHour = targetDate.getHours();

  const sameHourReadings = readings.filter((item) => {
    const date = new Date(item.created_at);
    return date.getHours() === targetHour;
  });

  const usefulReadings =
    sameHourReadings.length > 0 ? sameHourReadings : readings;

  const avgVoltage =
    usefulReadings.reduce((sum, item) => sum + Number(item.voltage || 0), 0) /
    usefulReadings.length;

  const avgFootsteps =
    usefulReadings.reduce(
      (sum, item) => sum + Number(item.footstep_count || 1),
      0
    ) / usefulReadings.length;

  return {
    voltage: avgVoltage || 0,
    footstepCount: avgFootsteps || 1,
  };
}

function trainGradientDescent(
  X: number[][],
  y: number[],
  learningRate = 0.01,
  epochs = 2500
) {
  const featureCount = X[0].length;
  const weights = new Array(featureCount).fill(0);

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
      weights[j] = sigmoidSafe(weights[j]);
    }
  }

  return {
    weights,
    means,
    stds,
  };
}

function predictWithModel(
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

  const prediction = normalizedFeatures.reduce(
    (sum, value, index) => sum + value * model.weights[index],
    0
  );

  return Math.max(0, prediction);
}

export function predictFutureEnergy(
  readings: PiezoReading[],
  targetDate: Date
): EnergyPrediction {
  const validReadings = readings.filter(
    (item) =>
      item.created_at &&
      Number.isFinite(Number(item.voltage)) &&
      Number.isFinite(Number(item.energy_mj))
  );

  if (validReadings.length < 8) {
    return {
      predictedEnergy: 0,
      confidence: "Low",
      trainingRecords: validReadings.length,
      modelType: "Multiple Linear Regression",
      message: "Not enough historical data to train the ML model.",
    };
  }

  const X = validReadings.map((item) =>
    getFeatures(
      new Date(item.created_at),
      Number(item.voltage || 0),
      Number(item.footstep_count || 1)
    )
  );

  const y = validReadings.map((item) => Number(item.energy_mj || 0));

  const model = trainGradientDescent(X, y);

  const estimatedInputs = estimateFutureInputs(validReadings, targetDate);

  const futureFeatures = getFeatures(
    targetDate,
    estimatedInputs.voltage,
    estimatedInputs.footstepCount
  );

  const predictedEnergy = predictWithModel(futureFeatures, model);

  let confidence: "Low" | "Medium" | "High" = "Low";

  if (validReadings.length >= 50) {
    confidence = "High";
  } else if (validReadings.length >= 20) {
    confidence = "Medium";
  }

  return {
    predictedEnergy: Number(predictedEnergy.toFixed(3)),
    confidence,
    trainingRecords: validReadings.length,
    modelType: "Multiple Linear Regression with Time Features",
    message: `Prediction generated using ${validReadings.length} past Supabase records.`,
  };
}
