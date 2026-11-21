import { useCallback, useEffect, useRef, useState } from 'react';

import type { WeatherPoint } from '../data/weatherSpots';
import { fetchForecast, type ForecastResult } from '../services/weatherService';

interface DualForecastState {
  bottom: ForecastResult | null;
  top: ForecastResult | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useDualForecast(
  bottomPoint: WeatherPoint,
  topPoint: WeatherPoint | null
): DualForecastState {
  const [bottom, setBottom] = useState<ForecastResult | null>(null);
  const [top, setTop] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(() => {
    const currentId = ++requestId.current;
    setLoading(true);

    const tasks: [Promise<ForecastResult>, Promise<ForecastResult | null>] = [
      fetchForecast(bottomPoint),
      topPoint ? fetchForecast(topPoint) : Promise.resolve(null),
    ];

    void Promise.allSettled(tasks)
      .then(([bottomRes, topRes]) => {
        if (currentId !== requestId.current) return;

        if (bottomRes.status === 'fulfilled') {
          setBottom(bottomRes.value);
          setError(null);
        } else {
          setBottom(null);
          const msg =
            bottomRes.reason instanceof Error
              ? bottomRes.reason.message
              : 'Forecast unavailable.';
          setError(msg);
        }

        if (topRes.status === 'fulfilled') {
          setTop(topRes.value);
        } else {
          setTop(null);
        }
      })
      .finally(() => {
        if (currentId === requestId.current) {
          setLoading(false);
        }
      });
  }, [
    bottomPoint.latitude,
    bottomPoint.longitude,
    bottomPoint.elevationMeters,
    topPoint?.latitude,
    topPoint?.longitude,
    topPoint?.elevationMeters,
  ]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { bottom, top, loading, error, reload };
}