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
    iticketPortal: 'https://portal.iticket.com/en/index.html?573',
    accidentReportForm:
      'https://docs.google.com/forms/d/e/1FAIpQLScAKL9majYzvd6hO7ibOroVSO69fG-oP1VYgztVkoMFvM4u2Q/viewform',
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
    expoProjectId: '32601f54-1560-4dec-b95d-5b658b010900',
  },
  firebaseWeb: {
    apiKey: 'AIzaSyAwcLI8bXYJXPYX_JuNWW0OhqtGCF-AJbY',
    authDomain: 'to-guides.firebaseapp.com',
    projectId: 'to-guides',
    storageBucket: 'to-guides.firebasestorage.app',
    messagingSenderId: '244643604138',
    appId: '1:244643604138:web:28041bb5a12ae9a29f52d3',
    vapidKey:
      'BOQdcZiQlk3NbvsvEGFCy2TqcNeFYbJalXy2K6leEkk1tGal3b2DD5lRL-ZqvoVnWDNb1qCF_oyab6VyC_fN_e0',
  },
} as const;