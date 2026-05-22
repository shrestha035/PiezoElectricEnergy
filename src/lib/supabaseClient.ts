import { createClient } from "@supabase/supabase-js";

export type EnergyReading = {
  id: number | string;
  created_at: string;
  device_id: string | null;
  adc_value: number | null;
  pin_voltage: number | null;
  capacitor_voltage: number | null;
  charge_percent: number | null;
  status: string | null;
  led_status: string | null;
};

const SUPABASE_URL = "https://eejaidvdflrxgzdpochm.supabase.co";
const SUPABASE_KEY = "sb_publishable_bHTMRV4Lj5NStx6rtSC6cA_BHRbTo4V";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});
