export interface ManualSection {
  id: string;
  title: string;
  summary: string;
  items: readonly string[];
}

export const GUIDE_MANUAL_SECTIONS: readonly ManualSection[] = [
  {
    id: 'setup',
    title: '1. First-Time Setup & iPhone / Web PWA',
    summary: 'Profile matching, Android app vs. iPhone Home Screen Web App.',
    items: [
      'Schedule Initials: Enter your exact initials as written in the Google Sheet tour cells (e.g. To, He, Si, Mh).',
      'First Name: Must match your column header in the staff roster columns (BQ–CZ).',
      'Full-Time (100%): Empty staff cell = Base / Workshop Duty; your initials in the staff column = Day Off.',
      'Part-Time (20%): Empty staff cell = Day Off.',
      'Default Hill Hike Mountain: Choose Tverrfjellet (524m) or Rundfjellet (472m) as your default peak.',
      'iPhone / Web Users (PWA): Open the web app in Safari, tap Share → Add to Home Screen, and launch it from your Home Screen icon to enable offline caching and 18:30 push notifications (iOS 16.4+). Background GPS tracking is Android-only.',
      'Android Users: Allow "While using the app" location access so 113 Emergency GPS coordinates work immediately.',
    ],
  },
  {
    id: 'schedule',
    title: '2. Schedule, Driver Shifts & All Trips',
    summary: 'Daily dispatch, blue driver highlights, clickable staff full names, and company overview.',
    items: [
      'Use the top toggle to switch between "My Schedule" (always shown first) and "All Trips" to see every booked company tour (including unassigned future yellow/booked trips), assigned guides, drivers, and vehicles.',
      'Guiding vs. Driving: When you are driving for another guide (e.g. "To Mh drives" or "Ls He/Mh drive"), the tour appears on your schedule with a blue frame and a DRIVER (or YOU DRIVE) badge showing who is guiding — and Post-Trip Report reminders are hidden. In All Trips, your guiding tours have an orange frame (YOUR TOUR) and driving tours have a blue frame (YOU DRIVE).',
      'Clickable Staff on Duty (All Trips): Tap the "Staff on Duty" card (Rental Center, Guides on Duty, and Minibus Drivers) to toggle between compact initials and Full Name (initials) chips. Tapping any company tour also displays full names for the assigned Guide and Driver.',
      'Multi-Vehicle Transport: Combined transport like "Taxi + Caravelle" or "Minibus + Caravelle" displays on tour cards and lists the tour under each vehicle in Vehicles Assigned.',
      'Status colors mirror the Google Sheet: Green = CONFIRMED, Yellow = BOOKED · UNCONFIRMED, Red = CLOSED. Strikethrough/cancelled tours are hidden.',
      'Daily Guide Notes (Col L) appear right below the toggle when present — tap "Read →" for full notes and comments. Use the top "iTicket" button to jump straight to the iTicket Manifests page.',
      'Tap the orange Refresh icon (or pull down) to sync anytime. Tap the center date to open the 6-week Calendar Picker (with Tour / Day Off / Base dots), or tap "Today" to jump back.',
      'Expand "Upcoming Schedule (30 Days)" for a quick list view, or "Browse All Company Trips" for offline route checklists and reference info.',
    ],
  },
  {
    id: 'tour-overview',
    title: '3. Tour Overview & Sheet Details',
    summary: 'Everything needed before, during, and after a tour.',
    items: [
      'Briefing Card shows clean tour title, time, Driver/Guide crew chips, coastal cruise ship name (from Col BB on HG tours), meeting point (14:15 / HG ship trips default to Prostneset), vehicle(s), and target "Back at car" time.',
      'Tap "Sheet Details · Raw Cell" (or any Note / Office Comments box) to inspect the full, selectable schedule cell text, original column header, cell notes, and comment threads.',
      'Auto-Pinned Contacts automatically display relevant Hurtigruten/Havila ship & reception numbers with one-tap Call buttons.',
      'Hill Hikes include a morning Mountain Picker comparing live Max summit wind during the tour window on Tverrfjellet vs. Rundfjellet.',
      'Tap any Yr / MET weather warning card below the weather box to read full descriptions, consequences, advice, or open Yr.no.',
      'Equipment Checklists are editable: tap "Edit / Kits" to switch kits, create custom kits, or add/remove items.',
      'Post-Trip Report sits at the bottom before/during the tour, and moves near the top once the tour ends until submitted (hidden on driver-only shifts). Reports save offline and auto-send when back online. If an accident occurred, use the "Accident / Incident Report Form" link right underneath.',
    ],
  },
  {
    id: 'tracking',
    title: '4. Trail & Gate Tracking (GPS · Android)',
    summary: 'Live pacing and turnaround gates for tracked routes.',
    items: [
      'Available on Android for Tverrfjellet, Rundfjellet, and Fatbike (Tromsøya North).',
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
    title: '6. Guest Roster, iTicket Import & Field Guide',
    summary: 'Offline check-in, manifest.xlsx import, 1-tap guest call, and wildlife photos.',
    items: [
      'iTicket Manifest Import: Tap "iTicket" to jump straight to Manifests, download manifest.xlsx (or copy guest cards), then tap "Manifest" in Roster to import locally on your phone (never uploaded). Multi-tour files let you pick the matching tour tab.',
      'Check-In & Calling Guests: Tick the circle on each guest card as they arrive, tap the blue Phone icon to call late/no-show guests directly, and expand any card to edit shoe/height/weight or medical/dietary notes.',
      'Sheet 1.6 Stays Headcount Truth: If the Roster count differs from Sheet 1.6 (e.g. moved bookings), an amber notice reminds you to verify and add moved guests manually.',
      'Sheet Notes Import: If the office listed guest names & sizes (including decimal weights/heights like 45,8 or 161,5) in sheet comments, tap the blue Import bar to populate your list in one tap. Registered counts pre-fill the Post-Trip Report.',
      'Field Guide: Offline Arctic wildlife and local talking points. Tap any photo to open a clean full-screen viewer (hides guide text) to show guests. Add custom photos or edit topics anytime.',
    ],
  },
  {
    id: 'notifications-emergency',
    title: '7. Notifications & Emergency 113',
    summary: 'Live 18:30 evening dispatch push (Android & iPhone PWA) and offline SOS tools.',
    items: [
      '18:30 Tomorrow Dispatch (Live Push): Sent directly from the live 1.6 schedule sheet in the evening to both Android phones and iPhone Home Screen PWAs (driver-only shifts are tagged [Driver]). Tap the notification to jump straight to tomorrow’s date and refresh.',
      'Enabling Push on iPhone / Web: Open the Home Screen app and tap the "Enable 18:30 Tomorrow Schedule Push" banner (or use the Push card in Settings).',
      'Post-Trip Report Reminder (Android): Fires 15 minutes after a guided tour ends if not yet submitted (skipped for driver-only shifts). Tapping it opens the exact finished tour’s Post-Trip Report form, even when you have multiple tours on the same day.',
      'Check Settings → bottom info card to confirm your 18:30 Dispatch Push status. Save Settings whenever you change your initials or contract type to re-sync push registration.',
      'Emergency · 113 (Red "+" button, top-right on every screen): Works 100% offline with live Decimal & DMS GPS coordinates (-32m Tromsø geoid offset), one-tap Call 113, Hjelp 113 shortcut, ASSIST accident steps, Accident / Incident Report Form link, and company/towing/taxi numbers.',
    ],
  },
];
