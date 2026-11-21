export const CONFIG = {
  sheet: {
    scriptUrl:
      'https://script.google.com/macros/s/AKfycby4gUdPhXv2xsAqEnhiRXnCdj8Z1k4A-MB29TE3foFGf1PprR49FGIlmF-UizJzVYhN/exec',
    spreadsheetId: '1IIbTbdW2iXFpGfqyfWA1XspqtuNyXne0hloB9kRcCYE',
    tabName: 'Winter 2026-27 Nov-MAy',
  },
  weather: {
    userAgent: 'TOGuides/1.7.0 (https://github.com; guide@tromsooutdoor.no)',
    refreshIntervalMs: 30000,
  },
  links: {
    kattfjordeidetCameras: 'https://www.vegvesen.no/trafikk/webkamera',
    emergencyTel: 'tel:113',
    hjelp113AppUri: 'android-app://no.norskluftambulanse.hjelp113',
  },
  defaults: {
    guideInitials: '',
    guideFullName: '',
    contractType: 'full-time' as 'full-time' | 'part-time',
    defaultMountain: 'tverrfjellet',
  },
  app: {
    version: '1.7.0',
    name: 'TO Guides',
  },
} as const;