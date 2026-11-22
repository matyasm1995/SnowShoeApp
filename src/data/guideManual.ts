export interface ManualSection {
  id: string;
  title: string;
  summary: string;
  items: readonly string[];
}

export const GUIDE_MANUAL_SECTIONS: readonly ManualSection[] = [
  {
    id: 'setup',
    title: '1. First-Time Setup & Profile',
    summary: 'How the app matches your schedule and days off.',
    items: [
      'Schedule Initials: Enter your exact initials as written in the Google Sheet tour cells (e.g. To, He, Si, Mh).',
      'First Name: Must match your column header in the staff roster columns (BQ–CZ).',
      'Full-Time (100%): Empty staff cell = Base / Workshop Duty; your initials in the staff column = Day Off.',
      'Part-Time (20%): Empty staff cell = Day Off.',
      'Default Hill Hike Mountain: Choose Tverrfjellet (524m) or Rundfjellet (472m) as your default peak.',
      'Allow "While using the app" location access so 113 Emergency GPS coordinates work immediately.',
    ],
  },
  {
    id: 'schedule',
    title: '2. Schedule & All Trips View',
    summary: 'Daily dispatch, status colors, duty checks, and company overview.',
    items: [
      'Use the top toggle to switch between "My Schedule" (always shown first) and "All Trips" to see every company tour, assigned guide, and vehicle for the selected day.',
      'Status colors mirror the Google Sheet: Green = CONFIRMED, Yellow = BOOKED · UNCONFIRMED, Red = CLOSED. Strikethrough/cancelled tours are hidden.',
      'On 0-tour days, the app checks Column C (Rental Center) and Column AP (Guides on Duty) before falling back to your staff column.',
      'Tap the orange Refresh icon (or pull down) to sync anytime. Use < and > arrows to check past or future days, or tap the date to jump back to Today.',
      'Expand "Upcoming Schedule (30 Days)" for a quick month view, or "Browse All Company Trips" for offline route checklists and reference info.',
    ],
  },
  {
    id: 'tour-overview',
    title: '3. Tour Overview & Sheet Details',
    summary: 'Everything needed before, during, and after a tour.',
    items: [
      'Briefing Card shows time, ship name, meeting point (14:15 / HG ship trips default to Prostneset), vehicle, and target "Back at car" time.',
      'Tap "Sheet Details · Raw Cell" (or any Note / Office Comments box) to inspect the full, selectable schedule cell text, cell notes, and comment threads.',
      'Auto-Pinned Contacts automatically display relevant Hurtigruten/Havila ship & reception numbers with one-tap Call buttons.',
      'Hill Hikes include a morning Mountain Picker comparing live summit wind on Tverrfjellet vs. Rundfjellet.',
      'Tap any Yr / MET weather warning card below the weather box to read full descriptions, consequences, advice, or open Yr.no.',
      'Equipment Checklists are editable: tap "Edit / Kits" to switch kits, create custom kits, or add/remove items.',
      'Post-Trip Report sits at the bottom before/during the tour, and moves near the top once the tour ends until submitted. Reports save offline and auto-send when back online.',
    ],
  },
  {
    id: 'tracking',
    title: '4. Trail & Gate Tracking (GPS)',
    summary: 'Live pacing and turnaround gates for tracked routes.',
    items: [
      'Available on Tverrfjellet, Rundfjellet, and Fatbike (Tromsøya North).',
      'Tap "Start Tracking" at the trailhead. Background GPS ("Allow all the time") is only requested when you start tracking so it works with your screen locked.',
      'Tap "Zero at Car" at parking to calibrate GPS elevation to the exact trailhead height.',
      'Gates trigger automatically by altitude/distance (or tap any gate to toggle manually) and warn ON PACE, BEHIND, or TURN AROUND NOW.',
      'A floating bubble stays visible if you switch tabs during an active track—tap it to jump straight back.',
    ],
  },
  {
    id: 'weather',
    title: '5. Weather & Custom Points',
    summary: '9-day MET Norway forecasts, wind-chill, and scouting points.',
    items: [
      'Top pills cover the 5 main operating locations: Tverrfjellet, Rundfjellet, Coffee Hike, Charlottenlund (all ski/fatbike/snowshoe trips), and Kvaløya Bridge.',
      'Tap "+ Add" to save custom weather spots using your current GPS or by pasting coordinates / a Google Maps link. Long-press a custom pill (or tap Edit) to update or delete it.',
      'The scrollable timeline covers 9 days: hourly (1h) for the first ~48 hours, then 6H outlook blocks up to 9 days ahead.',
      'Includes felt wind-chill risk, wind compass (speed, gusts, direction), Tromsø daylight/twilight countdown, 0°C freezing elevation, Varsom avalanche level, and Sandnessundbrua ≥20 m/s gust alerts.',
    ],
  },
  {
    id: 'roster-guide',
    title: '6. Guest Roster & Field Guide',
    summary: 'Offline guest tracking and full-screen wildlife photos.',
    items: [
      'Roster: Tap "Import" to pull guest names/sizes mentioned in office comments, or add guests manually with party size, shoe/height/weight, and medical/dietary notes.',
      'Registered guest counts automatically pre-fill the Post-Trip Report attended pax.',
      'Field Guide: Offline Arctic wildlife and local talking points. Tap any photo to open a clean full-screen viewer (hides guide text) to show guests.',
      'Customize the Field Guide anytime by adding photos from Camera/Gallery, editing bullet points, or creating new topics.',
    ],
  },
  {
    id: 'notifications-emergency',
    title: '7. Notifications & Emergency 113',
    summary: 'Evening dispatch alerts and offline SOS tools.',
    items: [
      '18:30 Tomorrow Dispatch: Summarizes tomorrow’s tours or duty status with a sync timestamp. Quiet background sync refreshes the sheet in the afternoon; if late edits arrive after 18:30, an Updated notice is sent.',
      'Post-Trip Report Reminder: Fires 15 minutes after a tour ends if not yet submitted.',
      'Tip for Android: Set TO Guides battery usage to "Unrestricted" in Android App Info for the most reliable afternoon background syncs.',
      'Emergency · 113 (Red "+" button, top-right on every screen): Works 100% offline with live Decimal & DMS GPS coordinates (-32m Tromsø geoid offset), one-tap Call 113, Hjelp 113 shortcut, ASSIST accident steps, and company/towing/taxi numbers.',
    ],
  },
];
