"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { fetchUserMe, updateUserProfile } from "@/lib/api";
import {
  DEFAULT_TIMEZONE,
  detectDeviceTimezone,
  effectiveTimezone,
  setActiveDisplayTimezone,
} from "@/lib/timezone";

type TimezoneContextType = {
  timezone: string;
  manualTimezone: string;
  timezoneAuto: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};

const TimezoneContext = createContext<TimezoneContextType | undefined>(undefined);

export function TimezoneProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [manualTimezone, setManualTimezone] = useState(DEFAULT_TIMEZONE);
  const [timezoneAuto, setTimezoneAuto] = useState(true);
  const [detected, setDetected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const deviceTimezone = useMemo(() => detectDeviceTimezone(), []);

  const timezone = effectiveTimezone(
    { timezone: manualTimezone, timezone_auto: timezoneAuto, timezone_detected: detected },
    deviceTimezone
  );
  setActiveDisplayTimezone(timezone);

  const refresh = async () => {
    if (status !== "authenticated") {
      setManualTimezone(DEFAULT_TIMEZONE);
      setTimezoneAuto(true);
      setDetected(deviceTimezone);
      setActiveDisplayTimezone(deviceTimezone);
      return;
    }
    setLoading(true);
    try {
      const me = await fetchUserMe();
      const manual = me.timezone || DEFAULT_TIMEZONE;
      const auto = Boolean(me.timezone_auto);
      setManualTimezone(manual);
      setTimezoneAuto(auto);
      setDetected(me.timezone_detected ?? null);
      const next = effectiveTimezone(me, deviceTimezone);
      setActiveDisplayTimezone(next);
      if (auto && me.timezone_detected !== deviceTimezone) {
        const updated = await updateUserProfile({ timezone_detected: deviceTimezone });
        setDetected(updated.timezone_detected ?? deviceTimezone);
      }
    } catch {
      setActiveDisplayTimezone(deviceTimezone);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, deviceTimezone]);

  return (
    <TimezoneContext.Provider
      value={{ timezone, manualTimezone, timezoneAuto, loading, refresh }}
    >
      {children}
    </TimezoneContext.Provider>
  );
}

export function useDisplayTimezone() {
  const context = useContext(TimezoneContext);
  if (!context) {
    return {
      timezone: detectDeviceTimezone(),
      manualTimezone: DEFAULT_TIMEZONE,
      timezoneAuto: true,
      loading: false,
      refresh: async () => {},
    };
  }
  return context;
}
