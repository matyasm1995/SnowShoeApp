import { useCallback, useEffect, useRef, useState } from 'react';

import type { GeoPoint } from '../data/locations';
import { fetchForecast, type ForecastResult } from '../services/weatherService';

interface ForecastState {
  result: ForecastResult | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useForecast(point: GeoPoint): ForecastState {
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(() => {
    const current = ++requestId.current;
    setLoading(true);
    void fetchForecast(point)
      .then((forecast) => {
        if (current !== requestId.current) {
          return;
        }
        setResult(forecast);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (current !== requestId.current) {
          return;
        }
        setResult(null);
        setError(caught instanceof Error ? caught.message : 'Forecast unavailable.');
      })
      .finally(() => {
        if (current === requestId.current) {
          setLoading(false);
        }
      });
  }, [point.latitude, point.longitude, point.elevationMeters]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { result, loading, error, reload };
}
