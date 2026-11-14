export const CONFIG = {
    sheet: {
      scriptUrl:
        'https://script.google.com/macros/s/AKfycby4gUdPhXv2xsAqEnhiRXnCdj8Z1k4A-MB29TE3foFGf1PprR49FGIlmF-UizJzVYhN/exec',
      spreadsheetId: '1ZS4anhB3ptUXfUcEnF_R1_OhfHHVJuxYfKtR4dzFx6k',
      tabName: 'Winter2627',
    },
    weather: {
      userAgent: 'TromsoSnowshoeGuide/1.0 (https://github.com; arcticguide@nordicoutdoor.no)',
      refreshIntervalMs: 30000,
    },
    links: {
      kattfjordeidetCameras: 'https://www.vegvesen.no/trafikk/webkamera',
      emergencyTel: 'tel:113',
      hjelp113AppUri: 'android-app://no.norskluftambulanse.hjelp113',
    },
    defaults: {
      guideInitials: 'Mh',
      guideFullName: 'Michal',
      contractType: 'full-time' as 'full-time' | 'part-time',
      defaultMountain: 'tverrfjellet',
    },
    app: {
      version: '1.3.0',
      name: 'Arctic Snowshoe Guide',
    },
  } as const;