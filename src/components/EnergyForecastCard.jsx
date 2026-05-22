import { useEffect, useState } from "react";
import { Brain, TrendingUp, Battery, Zap } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { predictFutureEnergyFromReadings } from "../lib/energyML";

export default function EnergyForecastCard() {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [targetHour, setTargetHour] = useState(1);

  useEffect(() => {
    loadPrediction();
  }, [targetHour]);

  async function loadPrediction() {
    setLoading(true);

    const { data, error } = await supabase
      .from("energy_readings")
      .select("id, capacitor_voltage, charge_percent, adc_value, status, created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("Supabase AI forecast error:", error);
      setPrediction(null);
      setLoading(false);
      return;
    }

    const futureTime = new Date();
    futureTime.setHours(futureTime.getHours() + targetHour);

    const result = predictFutureEnergyFromReadings(data || [], futureTime);

    setPrediction(result);
    setLoading(false);
  }

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Brain size={20} color="#8B5CF6" />
            <h2 className="text-xl font-semibold text-slate-900">
              AI Energy Forecast
            </h2>
          </div>

          <p className="mt-1 text-sm text-slate-500">
            ML prediction using past Supabase energy readings
          </p>
        </div>

        <span className="rounded-full bg-gradient-to-r from-purple-500 to-blue-500 px-2 py-1 text-[10px] font-semibold text-white">
          AI/ML
        </span>
      </div>

      <div className="mb-4">
        <label className="text-sm font-medium text-slate-700">
          Predict after
        </label>

        <select
          className="mt-2 w-full rounded-lg border border-slate-200 p-2 text-sm outline-none focus:border-blue-500"
          value={targetHour}
          onChange={(e) => setTargetHour(Number(e.target.value))}
        >
          <option value={1}>Next 1 hour</option>
          <option value={2}>Next 2 hours</option>
          <option value={6}>Next 6 hours</option>
          <option value={12}>Next 12 hours</option>
          <option value={24}>Next 24 hours</option>
        </select>
      </div>

      {loading ? (
        <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          Training AI/ML model from Supabase records...
        </div>
      ) : prediction ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-purple-100 bg-gradient-to-r from-purple-50 to-blue-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Predicted Energy
            </p>

            <p className="mt-1 text-3xl font-bold text-slate-900">
              {prediction.predictedEnergyMJ} mJ
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Estimated stored energy for selected future time
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Zap size={14} color="#2563EB" />
                Voltage
              </div>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {prediction.predictedVoltage} V
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Battery size={14} color="#10B981" />
                Charge
              </div>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {prediction.predictedCharge}%
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <TrendingUp size={14} color="#8B5CF6" />
                Confidence
              </div>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {prediction.confidence}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Model
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {prediction.modelType}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Training Records
            </p>
            <p className="mt-1 text-sm text-slate-700">
              {prediction.message}
            </p>
          </div>
        </div>
      ) : (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-500">
          Prediction unavailable. Check Supabase connection and table data.
        </p>
      )}
    </div>
  );
}
