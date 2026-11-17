import Svg, { Circle, G, Line, Path } from 'react-native-svg';

interface Props {
  symbolCode: string | null;
  size?: number;
}

type Celestial = 'day' | 'night' | 'polartwilight';

function parseSymbol(symbolCode: string | null): {
  base: string;
  celestial: Celestial;
} {
  const s = (symbolCode ?? 'cloudy').toLowerCase();
  let celestial: Celestial = 'day';
  if (s.endsWith('_night')) celestial = 'night';
  else if (s.endsWith('_polartwilight')) celestial = 'polartwilight';

  const base = s.replace(/_(day|night|polartwilight)$/, '');
  return { base, celestial };
}

function SunGlyph({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const rayIn = r + 2;
  const rayOut = r + 4.5;
  const d = r + 3.2;
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} fill="#FBBF24" />
      <G stroke="#FBBF24" strokeWidth="1.8" strokeLinecap="round">
        <Line x1={cx} y1={cy - rayOut} x2={cx} y2={cy - rayIn} />
        <Line x1={cx} y1={cy + rayIn} x2={cx} y2={cy + rayOut} />
        <Line x1={cx - rayOut} y1={cy} x2={cx - rayIn} y2={cy} />
        <Line x1={cx + rayIn} y1={cy} x2={cx + rayOut} y2={cy} />
        <Line x1={cx - d} y1={cy - d} x2={cx - d + 1.6} y2={cy - d + 1.6} />
        <Line x1={cx + d - 1.6} y1={cy + d - 1.6} x2={cx + d} y2={cy + d} />
        <Line x1={cx - d} y1={cy + d} x2={cx - d + 1.6} y2={cy + d - 1.6} />
        <Line x1={cx + d - 1.6} y1={cy - d + 1.6} x2={cx + d} y2={cy - d} />
      </G>
    </G>
  );
}

function MoonGlyph({ cx, cy, scale = 1 }: { cx: number; cy: number; scale?: number }) {
  return (
    <G transform={`translate(${cx - 14 * scale}, ${cy - 16 * scale}) scale(${scale})`}>
      <Path
        d="M 17 7 A 9 9 0 1 0 17 25 A 5 9 0 0 1 17 7 Z"
        fill="#FDE68A"
      />
      <Circle cx="22" cy="10" r="1.1" fill="#FEF3C7" />
      <Circle cx="24.5" cy="15.5" r="0.9" fill="#FEF3C7" />
    </G>
  );
}

function PolarTwilightGlyph({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <G>
        <Path
          d="M 13 13 A 5.5 5.5 0 0 1 24 13 Z"
          fill="#FB923C"
          opacity={0.9}
        />
        <Line x1="11" y1="13.5" x2="26" y2="13.5" stroke="#38BDF8" strokeWidth="1.5" strokeLinecap="round" />
      </G>
    );
  }
  return (
    <G>
      <Path d="M 7 21 A 9 9 0 0 1 25 21 Z" fill="#FB923C" opacity={0.85} />
      <Path d="M 10 21 A 6 6 0 0 1 22 21 Z" fill="#FDE047" opacity={0.7} />
      <Line x1="4" y1="21" x2="28" y2="21" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
      <Line x1="8" y1="25" x2="24" y2="25" stroke="#6366F1" strokeWidth="1.6" strokeLinecap="round" />
    </G>
  );
}

export function WeatherIcon({ symbolCode = 'cloudy', size = 32 }: Props) {
  const { base, celestial } = parseSymbol(symbolCode);

  const hasThunder = base.includes('thunder');
  const hasSnow = base.includes('snow');
  const hasSleet = base.includes('sleet');
  const hasRain = base.includes('rain');
  const hasShower = base.includes('showers');
  const isPartly = base.includes('partlycloudy') || base.includes('fair');
  const isClear = base === 'clearsky';
  const isFog = base === 'fog';

  // Pure clear sky
  if (isClear) {
    return (
      <Svg width={size} height={size} viewBox="0 0 32 32">
        {celestial === 'night' ? (
          <MoonGlyph cx={15} cy={16} scale={1} />
        ) : celestial === 'polartwilight' ? (
          <PolarTwilightGlyph />
        ) : (
          <SunGlyph cx={16} cy={16} r={6} />
        )}
      </Svg>
    );
  }

  // Fog
  if (isFog) {
    return (
      <Svg width={size} height={size} viewBox="0 0 32 32">
        <Line x1="6" y1="11" x2="26" y2="11" stroke="#94A3B8" strokeWidth="2.4" strokeLinecap="round" />
        <Line x1="4" y1="16" x2="28" y2="16" stroke="#CBD5E1" strokeWidth="2.4" strokeLinecap="round" />
        <Line x1="7" y1="21" x2="25" y2="21" stroke="#94A3B8" strokeWidth="2.4" strokeLinecap="round" />
      </Svg>
    );
  }

  const showCelestial = isPartly || hasShower;
  const cloudColor = base.includes('heavy') ? '#64748B' : '#94A3B8';

  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      {showCelestial ? (
        celestial === 'night' ? (
          <MoonGlyph cx={21} cy={10} scale={0.62} />
        ) : celestial === 'polartwilight' ? (
          <PolarTwilightGlyph compact />
        ) : (
          <SunGlyph cx={21} cy={10} r={4.2} />
        )
      ) : null}

      {/* Cloud */}
      <Path
        d="M 7.5 20.5 A 4.5 4.5 0 0 1 11 12.5 A 6 6 0 0 1 22 12.5 A 4.5 4.5 0 0 1 24.5 20.5 Z"
        fill={cloudColor}
      />

      {/* Thunder bolt */}
      {hasThunder ? (
        <Path
          d="M 17 19 L 13.5 25 L 16.5 25 L 15 30 L 19.5 23.5 L 16.5 23.5 Z"
          fill="#FBBF24"
        />
      ) : null}

      {/* Sleet = raindrop + snowflake */}
      {hasSleet ? (
        <G>
          <Line x1="11" y1="22.5" x2="9.5" y2="27.5" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
          <Circle cx="16.5" cy="25.5" r="1.7" fill="#E0F2FE" />
          <Line x1="21.5" y1="22.5" x2="20" y2="27.5" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
        </G>
      ) : hasSnow ? (
        <G>
          <Circle cx="11" cy="24.5" r="1.6" fill="#E0F2FE" />
          <Circle cx="16" cy="27" r="1.6" fill="#38BDF8" />
          <Circle cx="21" cy="24.5" r="1.6" fill="#E0F2FE" />
        </G>
      ) : hasRain ? (
        <G stroke="#38BDF8" strokeWidth="2" strokeLinecap="round">
          <Line x1="11" y1="22.5" x2="9.5" y2="28" />
          <Line x1="16" y1="22.5" x2="14.5" y2="28" />
          <Line x1="21" y1="22.5" x2="19.5" y2="28" />
        </G>
      ) : null}
    </Svg>
  );
}