import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

interface Props {
  symbolCode: string | null;
  size?: number;
}

export function WeatherIcon({ symbolCode = 'cloudy', size = 32 }: Props) {
  const s = symbolCode ? symbolCode.toLowerCase() : 'cloudy';

  if (s.includes('snow') || s.includes('sleet')) {
    return (
      <Svg width={size} height={size} viewBox="0 0 32 32">
        {/* Cloud */}
        <Path
          d="M8 20 A5 5 0 0 1 12 12 A6 6 0 0 1 22 12 A5 5 0 0 1 25 20 Z"
          fill="#94A3B8"
        />
        {/* Snowflakes */}
        <Circle cx="11" cy="25" r="1.5" fill="#38BDF8" />
        <Circle cx="16" cy="27" r="1.5" fill="#38BDF8" />
        <Circle cx="21" cy="25" r="1.5" fill="#38BDF8" />
      </Svg>
    );
  }

  if (s.includes('rain')) {
    return (
      <Svg width={size} height={size} viewBox="0 0 32 32">
        <Path
          d="M8 18 A5 5 0 0 1 12 10 A6 6 0 0 1 22 10 A5 5 0 0 1 25 18 Z"
          fill="#64748B"
        />
        <Line x1="11" y1="22" x2="9" y2="28" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
        <Line x1="16" y1="22" x2="14" y2="28" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
        <Line x1="21" y1="22" x2="19" y2="28" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
      </Svg>
    );
  }

  if (s.includes('clearsky') || s.includes('fair')) {
    if (s.includes('polartwilight')) {
      return (
        <Svg width={size} height={size} viewBox="0 0 32 32">
          {/* Half sun submerged below horizon */}
          <Circle cx="16" cy="20" r="9" fill="#F59E0B" opacity={0.6} />
          <Line x1="4" y1="20" x2="28" y2="20" stroke="#38BDF8" strokeWidth="2" />
        </Svg>
      );
    }
    return (
      <Svg width={size} height={size} viewBox="0 0 32 32">
        <Circle cx="16" cy="16" r="6" fill="#FBBF24" />
        <G stroke="#FBBF24" strokeWidth="2" strokeLinecap="round">
          <Line x1="16" y1="4" x2="16" y2="7" />
          <Line x1="16" y1="25" x2="16" y2="28" />
          <Line x1="4" y1="16" x2="7" y2="16" />
          <Line x1="25" y1="16" x2="28" y2="16" />
          <Line x1="7.5" y1="7.5" x2="9.6" y2="9.6" />
          <Line x1="22.4" y1="22.4" x2="24.5" y2="24.5" />
          <Line x1="7.5" y1="24.5" x2="9.6" y2="22.4" />
          <Line x1="22.4" y1="9.6" x2="24.5" y2="7.5" />
        </G>
      </Svg>
    );
  }

  if (s.includes('fog')) {
    return (
      <Svg width={size} height={size} viewBox="0 0 32 32">
        <Line x1="6" y1="12" x2="26" y2="12" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" />
        <Line x1="4" y1="17" x2="28" y2="17" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" />
        <Line x1="7" y1="22" x2="25" y2="22" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" />
      </Svg>
    );
  }

  // Default: Cloudy
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path
        d="M9 22 A5 5 0 0 1 12 14 A6.5 6.5 0 0 1 23 14 A5 5 0 0 1 26 22 Z"
        fill="#94A3B8"
      />
    </Svg>
  );
}