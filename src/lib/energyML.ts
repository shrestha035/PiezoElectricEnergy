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

const TOTAL_CAPACITANCE_UF = 500;

// E = 1/2 × C × V²
function estimateEnergyMJ(voltage: number) {
  const capacitanceF = TOTAL_CAPACITANCE_UF / 1_000_000;
  const energyJ = 0.5 * capacitanceF * voltage * voltage;
  return energyJ * 1000;
}

function average(values: number[]) {
  if (values.length === 0) return 0;

  return (
    values.reduce((sum, value) => sum + value, 0) /
    values.length
  );
}

function linearRegression(
  x: number[],
  y: number[]
) {
  const n = x.length;

  const sumX = x.reduce(
    (a, b) => a + b,
    0
  );

  const sumY = y.reduce(
    (a, b) => a + b,
    0
  );

  const sumXY = x.reduce(
    (acc, value, index) =>
      acc + value * y[index],
    0
  );

  const sumXX = x.reduce(
    (acc, value) =>
      acc + value * value,
    0
  );

  const denominator =
    n * sumXX - sumX * sumX;

  if (denominator === 0) {
    return {
      slope: 0,
      intercept: average(y),
    };
  }

  const slope =
    (n * sumXY -
      sumX * sumY) /
    denominator;

  const intercept =
    (sumY -
      slope * sumX) /
    n;

  return {
    slope,
    intercept,
  };
}

export function predictFutureEnergyFromReadings(
  readings: EnergyReadingForML[],
  targetDate: Date
): EnergyPrediction {
  const validReadings = readings.filter(
    (item) =>
      item.created_at &&
      Number.isFinite(
        Number(item.capacitor_voltage)
      ) &&
      Number.isFinite(
        Number(item.charge_percent)
      )
  );

  if (validReadings.length < 8) {
    return {
      predictedVoltage: 0,
      predictedCharge: 0,
      predictedEnergyMJ: 0,
      confidence: "Low",
      trainingRecords:
        validReadings.length,
      modelType:
        "Linear Regression",
      message:
        "Not enough Supabase records to train the ML model.",
    };
  }

  const targetHour =
    targetDate.getHours();

  const hours =
    validReadings.map((item) =>
      new Date(
        item.created_at
      ).getHours()
    );

  const voltages =
    validReadings.map((item) =>
      Number(
        item.capacitor_voltage || 0
      )
    );

  const charges =
    validReadings.map((item) =>
      Number(
        item.charge_percent || 0
      )
    );

  const voltageModel =
    linearRegression(
      hours,
      voltages
    );

  const chargeModel =
    linearRegression(
      hours,
      charges
    );

  let predictedVoltage =
    voltageModel.slope *
      targetHour +
    voltageModel.intercept;

  let predictedCharge =
    chargeModel.slope *
      targetHour +
    chargeModel.intercept;

  predictedVoltage = Math.max(
    0.8,
    Math.min(
      6.0,
      predictedVoltage
    )
  );

  predictedCharge = Math.max(
    5,
    Math.min(
      100,
      predictedCharge
    )
  );

  const predictedEnergyMJ =
    estimateEnergyMJ(
      predictedVoltage
    );

  let confidence:
    | "Low"
    | "Medium"
    | "High" = "Low";

  if (
    validReadings.length >=
    300
  ) {
    confidence = "High";
  } else if (
    validReadings.length >=
    80
  ) {
    confidence = "Medium";
  }

  return {
    predictedVoltage: Number(
      predictedVoltage.toFixed(2)
    ),

    predictedCharge: Number(
      predictedCharge.toFixed(1)
    ),

    predictedEnergyMJ: Number(
      predictedEnergyMJ.toFixed(4)
    ),

    confidence,

    trainingRecords:
      validReadings.length,

    modelType:
      "Linear Regression using Historical Supabase Records",

    message: `Linear Regression trained using ${validReadings.length} Supabase records.`,
  };
}