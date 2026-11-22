# TO Guides — New Guide Manual & Feature Overview

Welcome to **TO Guides**, the offline-first Android field app built for **Tromsø Outdoor** commercial guides.  
Once synced, your schedule, checklists, emergency numbers, guest scratchpad, and field guide work **100% offline** in the mountains and fjords.

---

## 1. First-Time Setup

When you open the app for the first time, **Arctic Guide Setup** asks for four things:

1. **Schedule Initials** — Your exact initials as written in the Google Sheet tour cells (e.g., `To`, `He`, `Si`, `Mh`).
2. **First Name** — Your name as shown in the staff roster header columns (`BQ–CZ`).
3. **Contract Type** — Determines how days without tours are shown:
   - **Full-Time (100%):** Empty staff cell = *Base / Workshop Duty*; your initials in the staff column = *Day Off*.
   - **Part-Time (20%):** Empty cell = *Day Off*.
4. **Default Hill Hike Mountain** — Choose **Tverrfjellet (524m)** or **Rundfjellet (472m)** as your default starting peak.

When prompted, allow **"While using the app"** location access so **113 Emergency SOS** GPS coordinates are immediately ready if needed.

*(You can update any of these later in the **Settings** tab.)*

---

## 2. Main Navigation

The bottom bar has five tabs, plus a **red `+` Emergency button** in the top-right corner of every screen:

| Tab | Purpose |
| --- | --- |
| **Schedule** | Daily dispatch, tour cards, duty status, manager notices, weather summary, and 30-day overview |
| **Weather** | 9-day MET Norway forecast, wind-chill, wind compass, avalanche & bridge alerts, custom points |
| **Roster** | Tour guest scratchpad (import from office comments or add guests manually) |
| **Guide** | Offline wildlife & Arctic talking points with full-screen guest photo viewer |
| **Settings** | Guide profile, contract type, default mountain, and warning preview toggle |
| **Red `+` (Top Right)** | **Emergency · 113** screen (works anytime, offline) |

---

## 3. Schedule Tab (Daily Dispatch)

### Syncing & Date Navigation
- **Auto-Sync:** Syncs automatically when stale (>30 minutes) and runs quiet background syncs during the day/afternoon.
- **Manual Sync:** Tap the orange **Refresh** button (or pull down to refresh) whenever you want the latest sheet data.
- **Date Arrows (`<` / `>`):** Browse past or future days. Tap the date in the center (`TAP FOR TODAY`) to jump back to today.

### Notices & Reminders
- **Manager Noticeboard:** Appears at the top when office notices are active (`Critical`, `Warning`, or `Info`). Tap to read full text or dismiss non-critical notices.
- **Post-Trip Report Reminder:** An amber banner appears after a tour ends if you haven't submitted its report yet. Tap **Fill Report →** to submit right away.

### My Schedule vs. All Trips
- Use the top toggle (**My Schedule** | **All Trips**) right below the date bar—**My Schedule** is always shown first.
- Switch to **All Trips** on any date to view every active company tour, assigned guide(s), vehicle overview (`Caravelle #2/#3/#4`, `Minibus`, `Taxi`), Rental Center (`Col C`), and Guides on Duty (`Col AP`). Tap any company tour to inspect its raw sheet details.

### Today's Tours & Status
Each assigned tour card shows:
- **Time & Type:** `TOUR` or `CHARTER` + start–end time.
- **Status Badge:**
  - `CONFIRMED` (Green cell)
  - `BOOKED · UNCONFIRMED` (Yellow cell)
  - `CLOSED` (Red cell)
  - Cancelled/strikethrough tours are automatically hidden.
- **Ship & Vehicle Badges:** Hurtigruten/Havila ship name (if applicable) and assigned vehicle (`Caravelle #2/#3/#4`, `Minibus`, `Taxi`, etc.).
- **Pax Count & Icons:** Expected guest count, report status, and a comment icon if office notes/comments exist.

**On 0-tour days** (or when combined with a tour), the **Duty Status** card automatically checks:
- **Rental Center** (Column `C`) and **Guides on Duty** (Column `AP`), as well as your staff column (`BQ–CZ`).
- Displays whether you are on **Rental Center**, **Guiding — No Tour Assigned**, **Base / Workshop Duty**, or **Day Off**.

### Weather Conditions Card
Shows the forecast for your tour's location and time window (or **Charlottenlund** on 0-tour days). Tap it to jump directly to the full forecast for that location and time slot.

### Overview & Company Trips
- **Upcoming Schedule (30 Days):** Expand to see a quick day-by-day list of tours, Rental Center shifts, and days off. Tap any row to jump to that date.
- **Browse All Company Trips:** Reference mode for all company routes (equipment checklists, return rules, and trail info) even when not scheduled on them.

---

## 4. Tour Overview (Tap Any Tour Card)

1. **Tour Briefing Card:**
   - Tour title, time, ship name, **meeting point** (afternoon `14:15` / `HG` ship trips default to `Prostneset`), assigned vehicle, and **Back at car** target time.
   - **Sheet Details · Raw Cell:** Tap to open the **Sheet Details** modal with selectable full text of the raw schedule cell, cell note, and all office comments/replies—nothing from the sheet is ever hidden.
2. **Auto-Pinned Tour Contacts:**
   - Automatically surfaces relevant ship or dock phone numbers (e.g., Hurtigruten/Havila ship & reception) with one-tap **Call** buttons.
3. **Hill Hike Mountain Picker (Hill Hikes only):**
   - Switch between **Tverrfjellet (524m)** and **Rundfjellet (472m)** with live summit wind and drive time (`45m` vs `30m`).
4. **Tour Window Weather & Safety Warnings:**
   - Tap **Tour Window Weather** for the full forecast.
   - Directly below the weather box, view **NVE Varsom Avalanche** (Region `3011` Tromsø), **clickable Yr / MET Weather Warnings** (tap for full description, consequences, advice, or to open Yr.no), and **Kvaløya Bridge Gust Alerts** (`≥ 20 m/s`).
5. **Trail Tracking & Equipment Checklist:**
   - Tap **Open Trail & Gate Tracking** (available on tracked routes like Tverrfjellet, Rundfjellet, and Fatbike) to start GPS pacing.
   - Check off gear before departure. Tap **Edit / Kits** to switch kits, create custom kits, or add/remove items.
6. **Post-Trip Report:**
   - Sits at the bottom before/during the tour, and automatically moves near the top once the tour ends until submitted.
   - Pre-filled with date, your name, trip type, attended pax (uses your Roster count if entered), and Hill Hike mountain. Saves offline and **auto-syncs** when back online.

---

## 5. Trail & Gate Tracking (GPS Pacing)

Available on **Tverrfjellet**, **Rundfjellet**, and **Fatbike (Tromsøya North)**:

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

## 7. Roster Tab (Guest Scratchpad)

- **Tour Selector:** Switch dates or select between multiple tours on the same day.
- **Import from Comments:** If the office listed guest names/sizes in the sheet comments or notes, tap **Import** to populate your list in one tap.
- **Add / Edit Guests:** Record lead name, party size, shoe size, height, weight, and medical/dietary notes (highlighted with an amber badge).
- Your total registered guest count automatically pre-fills the **Post-Trip Report**.

---

## 8. Field Guide Tab (Offline Talking Points)

- **Built-in Arctic Cards:** Photos and concise talking points for wildlife and local topics.
- **Guest Photo Lightbox:** Tap any photo to show it full-screen to guests—all guide notes are hidden so guests only see the picture.
- **Customize:** Tap **Gallery** or **Camera** to add your own photos, tap **Edit** to customize talking points, or tap **New Topic** to add your own animals/topics.

---

## 9. Notifications

- **Tomorrow's Schedule (18:30):** Daily summary of tomorrow's tours (or Day Off / Rental Center / Base Duty) with a `synced HH:MM` timestamp. Background sync refreshes the schedule in the afternoon so late sheet changes are caught; if a change arrives after 18:30, you'll receive an **Updated** notice.
- **Post-Trip Report Reminder:** Fires 15 minutes after a scheduled tour ends if the report hasn't been submitted yet.

---

## 10. Emergency · 113 (Red `+` Button)

Accessible from the top-right corner of every screen, even offline:
- **Live GPS Coordinates:** Shows both **Decimal Degrees** and **Degrees-Minutes-Seconds (DMS)**, **Altitude** (corrected with Tromsø's `-32m` geoid offset), and GPS accuracy (`±m`).
- **Active Area / Tour:** Shown when on an active tour or tracking session so you can read your location name immediately to dispatchers.
- **One-Tap Actions:** **Call 113** (Norwegian Medical Emergency) and **Open Official Hjelp 113 App**.
- **ASSIST Protocol:** Quick reference steps for managing an accident in the field.
- **Key Offline Numbers:** Company emergency, office, towing, and taxi contacts ready to dial without internet.
