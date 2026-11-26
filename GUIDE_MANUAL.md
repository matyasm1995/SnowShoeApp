# TO Guides — New Guide Manual & Feature Overview

Welcome to **TO Guides**, the offline-first field app built for **Tromsø Outdoor** commercial guides (available on **Android** and as an **iPhone / Web PWA**).  
Once synced, your schedule, checklists, emergency numbers, guest roster, and field guide work **100% offline** in the mountains and fjords.

---

## 1. First-Time Setup & iPhone / Web PWA

When you open the app for the first time, **Arctic Guide Setup** asks for four things:

1. **Schedule Initials** — Your exact initials as written in the Google Sheet tour cells (e.g., `To`, `He`, `Si`, `Mh`).
2. **First Name** — Your name as shown in the staff roster header columns (`BQ–CZ`).
3. **Contract Type** — Determines how days without tours are shown:
   - **Full-Time (100%):** Empty staff cell = *Base / Workshop Duty*; your initials in the staff column = *Day Off*.
   - **Part-Time (20%):** Empty cell = *Day Off*.
4. **Default Hill Hike Mountain** — Choose **Tverrfjellet (524m)** or **Rundfjellet (472m)** as your default starting peak.

- **Android:** Allow **"While using the app"** location access so **113 Emergency SOS** GPS coordinates are immediately ready if needed.
- **iPhone / Web PWA (`to-guides.pages.dev`):** Open in Safari, tap **Share → Add to Home Screen**, and launch from the Home Screen icon to unlock offline caching and **18:30 push notifications** (requires iOS 16.4+). *(Background GPS tracking is Android-only.)*

*(You can update any profile setting later in the **Settings** tab.)*

---

## 2. Main Navigation

The bottom bar has five tabs, plus a **red `+` Emergency button** in the top-right corner of every screen:

| Tab | Purpose |
| --- | --- |
| **Schedule** | Daily dispatch, guiding & driving shifts, clickable Staff on Duty full names, calendar picker, weather summary, and 30-day overview |
| **Weather** | 9-day MET Norway forecast, wind-chill, wind compass, avalanche & bridge alerts, custom points |
| **Roster** | Offline guest check-in, iTicket `manifest.xlsx` / paste import, 1-tap Call, and Sheet comment import |
| **Guide** | Offline wildlife & Arctic talking points with full-screen guest photo viewer |
| **Settings** | Guide profile, contract type, default mountain, Web Push setup, app updates, and warning preview toggle |
| **Red `+` (Top Right)** | **Emergency · 113** screen (works anytime, offline) |

---

## 3. Schedule Tab (Daily Dispatch)

### Syncing & Date Navigation
- **Auto-Sync:** Syncs automatically when stale (>30 minutes) whenever you open or return to the app.
- **Manual Sync & iTicket:** Tap the orange **Refresh** button (or pull down) for the latest sheet data, or tap **iTicket** to jump straight to the **iTicket Manifests** page.
- **Date Arrows & 6-Week Calendar Picker:** Use `<` / `>` to step day-by-day, tap the center date to open the **6-week Calendar Picker** (with color-coded dots for Tour, Day Off, and Base), or tap **Today** to jump back.

### Notices, Guide Notes & Reminders
- **Guide Notes (Col L):** Daily operational notes from the sheet appear directly below the schedule toggle—tap **Read →** for full text and comments.
- **Manager Noticeboard:** Appears at the top when office notices are active (`Critical`, `Warning`, or `Info`). Tap to read full text or dismiss non-critical notices.
- **Post-Trip Report Reminder:** An amber banner appears after a guided tour ends if you haven't submitted its report yet (automatically hidden for driver-only shifts). Tap **Fill Report →** to submit right away.

### My Schedule vs. All Trips
- Use the top toggle (**My Schedule** | **All Trips**) right below the date bar—**My Schedule** is always shown first.
- Switch to **All Trips** on any date to view every active company tour (including unassigned future yellow/booked trips), separate **Guides** and **Driver** pills, **Vehicles Assigned** (including multi-vehicle trips), and the **Staff on Duty** card (**Rental Center**, **Guides on Duty**, and **Minibus Drivers**).
- **Clickable Staff on Duty (Full Names):** Tap the **Staff on Duty** card to expand compact initials into **Full Name (`initials`)** chips (learned automatically from Sheet `1.6`), and tap again to collapse. Tapping any company tour also displays full names for its Guide(s) and Driver(s).

### Guiding Shifts vs. Driver Shifts
- **Driver Shifts (`To Mh drives`, `Le, He drives`, `Ls He/Mh drive`):**
  - Still appear on your **My Schedule** so you never miss a pickup/drop-off.
  - Highlighted with a **blue frame** and a **`DRIVER`** (or **`DRIVER · He/Mh`**) badge on **My Schedule**, and a **blue frame + `YOU DRIVE`** badge in **All Trips** (while tours you guide have an **orange frame + `YOUR TOUR`** badge).
  - Shows who is guiding (`Guide: Kt`), and **suppresses Post-Trip Report reminders** since the guide submits the report.
- **Guiding Shifts with a Driver:** Display **`Driver: Mh`** (or `Driver: He/Mh`) right on your tour card and briefing.

### Today's Tours & Status
Each assigned tour card shows:
- **Time & Type:** `TOUR` or `CHARTER` + start–end time.
- **Status Badge:**
  - `CONFIRMED` (Green cell)
  - `BOOKED · UNCONFIRMED` (Yellow cell)
  - `CLOSED` (Red cell)
  - Cancelled/strikethrough tours are automatically hidden.
- **Ship & Multi-Vehicle Badges:** Hurtigruten/Havila ship name (extracted from Column `BB` on HG tours) and all assigned vehicles (`Taxi + Caravelle`, `Minibus + Caravelle`, `Caravelle #2/#3/#4`, `Minibus`, `Taxi`, etc.).
- **Pax Count & Icons:** Expected guest count, report status, and a comment icon if office notes/comments exist.

**On 0-tour days** (or when combined with a tour), the **Duty Status** card automatically checks **Rental Center** (Column `C`), **Guides on Duty** (Column `AP`), and your staff column (`BQ–CZ`).

### Weather Conditions Card & Overview
- Shows the peak (`Max`) wind and forecast for your tour's location and time window (or **Charlottenlund** on 0-tour days). Tap it to jump directly to the full forecast.
- Expand **Upcoming Schedule (30 Days)** for a day-by-day list (driver shifts tagged `[Driver]`), or **Browse All Company Trips** for offline route checklists and reference info.

---

## 4. Tour Overview (Tap Any Tour Card)

1. **Tour Briefing Card:**
   - Clean tour title, time, **Driver / Guide** chips, coastal cruise ship name, **meeting point** (afternoon `14:15` / `HG` ship trips default to `Prostneset`), assigned vehicle(s), and **Back at car** target time.
   - **Sheet Details · Raw Cell:** Tap to open the **Sheet Details** modal with selectable full text of the raw schedule cell, original column header, cell note, and all office comments/replies—nothing from the sheet is ever hidden.
2. **Auto-Pinned Tour Contacts:**
   - Automatically surfaces relevant ship or dock phone numbers (e.g., Hurtigruten/Havila ship & reception) with one-tap **Call** buttons.
3. **Hill Hike Mountain Picker (Hill Hikes only):**
   - Switch between **Tverrfjellet (524m)** and **Rundfjellet (472m)** with live `Max` summit wind during the tour window and drive time (`45m` vs `30m`).
4. **Tour Window Weather & Safety Warnings:**
   - Tap **Tour Window Weather** for the full forecast (shows Bottom & Top temp and `max` window wind).
   - Directly below the weather box, view **NVE Varsom Avalanche** (Region `3011` Tromsø), **clickable Yr / MET Weather Warnings** (with full multi-day start/end dates; tap for full description, consequences, advice, or to open Yr.no), and **Kvaløya Bridge Gust Alerts** (`≥ 20 m/s`).
5. **Trail Tracking & Equipment Checklist:**
   - Tap **Open Trail & Gate Tracking** (Android; available on Tverrfjellet, Rundfjellet, and Fatbike) to start GPS pacing.
   - Check off gear before departure. Tap **Edit / Kits** to switch kits, create custom kits, or add/remove items.
6. **Post-Trip Report & Accident Form:**
   - **Post-Trip Report** sits at the bottom before/during the tour, and automatically moves near the top once the tour ends until submitted *(hidden on driver-only shifts)*. Pre-filled with date, your name, trip type, attended pax (uses your Roster count if entered), and Hill Hike mountain. Saves offline and **auto-syncs** when back online.
   - **Accident / Incident Report Form:** Direct link right underneath Post-Trip Report if an accident or incident occurred during the trip.

---

## 5. Trail & Gate Tracking (GPS Pacing · Android)

Available on **Android** for **Tverrfjellet**, **Rundfjellet**, and **Fatbike (Tromsøya North)**:

- **Start Tracking:** Requests background GPS permission ("Allow all the time") when first started so tracking continues while your phone is locked in your pocket.
- **Floating Bubble:** When tracking is active and you switch to another tab, a floating pill stays on screen showing live altitude/progress—tap it to return to Tracking.
- **Zero at Car:** Tap **Zero at Car** at the trailhead to calibrate barometric/GPS altitude to the known trailhead elevation.
- **Checkpoints & Turnaround Gates:**
  - Gates trigger automatically by elevation/distance (or tap any gate to mark/unmark manually).
  - Shows **ON PACE**, **BEHIND (+Xm)**, **REACHED**, or **TURN AROUND NOW** so you always return to the car on time.

---

## 6. Weather Tab

- **Top Location Pills:**
  - **Tverrfjellet** (Bottom 105m + Top 524m, avalanche & bridge alerts)
  - **Rundfjellet** (Bottom 10m + Top 472m, avalanche & bridge alerts)
  - **Coffee Hike** (Malangen / Tove's Tradisjonsmat)
  - **Charlottenlund** (Ski, Fatbike, Easy Snowshoe & Campfire)
  - **Kvaløya Bridge** (Sandnessundbrua Fv862 deck at 41m)
  - **`+ Add` (Custom Weather Points):** Add any scouting spot by **Name**, **Use Current GPS**, or **Quick Paste** (coordinates or a Google Maps link) + optional elevation. Long-press a custom pill or use **Edit** to update or delete it.
- **9-Day Forecast Timeline:**
  - Hourly steps (`1h`) for the first ~48 hours, followed by `6H` outlook steps up to 9 days ahead.
  - Automatically scrolls to your selected tour's time window (highlighted with `TOUR`). Tap any hour card to inspect conditions at that time.
- **Felt Wind-Chill & Exposure Risk:** Air temperature vs. wind-chill felt temperature with color-coded exposure guidance.
- **Wind Compass, Daylight & Freezing Level:** Wind speed/gusts/direction, Tromsø civil dawn/sunrise/sunset/dusk countdown, and estimated `0°C` freezing elevation.

---

## 7. Roster Tab (Offline Check-In & iTicket Import)

- **Tour Selector:** Switch dates or select between multiple tours on the same day.
- **iTicket Manifest Import (`Manifest` button):**
  - Tap **iTicket** to jump straight to the iTicket Manifests page and download `manifest.xlsx` (or copy the guest cards).
  - Tap **Manifest** in Roster to pick `manifest.xlsx` or paste copied guest cards. Multi-tour Excel files automatically highlight the tab matching your active tour time.
  - Everything is parsed **100% locally on your phone** (no passwords stored, no guest data uploaded).
- **Check-In & 1-Tap Call:**
  - Tap the circle on any guest row to check them in (tracks live `✓ checked / total` count).
  - Tap the blue **Phone** button to dial late/no-show guests directly.
  - **Sheet 1.6 Headcount Truth:** If your Roster total differs from Sheet `1.6` (e.g., moved bookings not reflected in iTicket), an amber warning reminds you to check and add moved guests manually.
- **Import from Sheet Notes/Comments:** If the office listed guest names & sizes (including decimal weights/heights like `45,8` or `161,5`) in sheet comments, tap the blue **Import from Sheet notes** bar to populate your list in one tap.
- **Add / Edit Guests:** Record lead name, party size, phone, booking ref, shoe size, height, weight, and medical/dietary notes. Your total registered guest count automatically pre-fills the **Post-Trip Report**.

---

## 8. Field Guide Tab (Offline Talking Points)

- **Built-in Arctic Cards:** Photos and concise talking points for wildlife and local topics.
- **Guest Photo Lightbox:** Tap any photo to show it full-screen to guests—all guide notes are hidden so guests only see the picture.
- **Customize:** Tap **Gallery** or **Camera** to add your own photos, tap **Edit** to customize talking points, or tap **New Topic** to add your own animals/topics.

---

## 9. Notifications (Android & iPhone PWA)

- **Tomorrow's Schedule (18:30 Live Push):** Sent directly from the live `1.6` Google Sheet in the evening to both **Android** and **iPhone Home Screen PWAs** (driver-only shifts are tagged `[Driver]`) with a `synced HH:MM` timestamp. Tapping the notification opens **tomorrow’s schedule** directly and syncs the latest data.
- **Enabling Push on iPhone / Web:** Add the web app to your Home Screen first, open it from the Home Screen icon, and tap **Enable 18:30 Tomorrow Schedule Push** (on the Schedule banner or in **Settings**).
- **Post-Trip Report Reminder (Android):** Fires 15 minutes after a guided tour ends if the report hasn't been submitted yet *(skipped for driver-only shifts)*. Tapping the notification opens the **exact finished tour's Post-Trip Report** form, even when you have multiple tours on the same day.
- Check the bottom of **Settings** anytime to confirm your live 18:30 Push status (`Active (Live Server)` on Android or `Active (Web Push)` on iPhone/Web).

---

## 10. Emergency · 113 (Red `+` Button)

Accessible from the top-right corner of every screen, even offline:
- **Live GPS Coordinates:** Shows both **Decimal Degrees** and **Degrees-Minutes-Seconds (DMS)**, **Altitude** (corrected with Tromsø's `-32m` geoid offset), and GPS accuracy (`±m`).
- **Active Area / Tour:** Shown when on an active tour or tracking session so you can read your location name immediately to dispatchers.
- **One-Tap Actions:** **Call 113** (Norwegian Medical Emergency) and **Open Official Hjelp 113 App**.
- **ASSIST Protocol:** Quick reference steps for managing an accident in the field.
- **Accident / Incident Report Form:** Direct link below ASSIST to submit the official report after an incident.
- **Key Offline Numbers:** Company emergency, office, towing, and taxi contacts ready to dial without internet.
