# **App Name**: AviaTrack

## Core Features:

- Project Intake: Capture project details including WBS, GL, Delivery Method (CMAR, DB, DBB), and IT Disciplines.
- Phase Snapshots: Record cost estimates at 30%, 60%, 90%, and 100% CD. 'Lock' creates an immutable record.
- The Hulk Ledger: Compare '100% CD Baseline' vs. 'Committed POs' vs. 'Actual Invoices' in a data table.
- Dependency Sync: Use date-picker for 'GC Wall Close Date'; flag overlapping 'IT Mobilization' dates.
- Change Order Module: Add cost and description for spends exceeding the 100% baseline via form.
- Goods Received (GR): Capture a timestamp upon toggling 'Start Work', setting a 30-day payment deadline.
- Document Storage: Store invoices and test plans in Firebase Storage.

## Style Guidelines:

- Light Mode Background: White (#FFFFFF) for a clean interface.
- Dark Mode Background: Dark Blue (#142E88) for reduced eye strain in low light; Text #FFFFFF
- Accent Colors: Primary #1EA7F4 (Sky Blue), Secondary #885BCE (Violet), Action #CE29CE (Magenta).
- Titles/Headings Font: 'Bakbak One' (sans-serif) for a bold, professional look. Note: currently only Google Fonts are supported.
- Body Text and Data Tables Font: 'Montserrat' (sans-serif) for clear readability. Note: currently only Google Fonts are supported.
- Maintain consistent layout and component positioning throughout the application for ease of use.