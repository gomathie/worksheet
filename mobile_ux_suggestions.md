# Mobile UX Improvement Suggestions

Based on a review of the mobile screenshots and current implementation, the application is highly functional but feels a bit dense on smaller screens. Here are several actionable suggestions to elevate the mobile user experience to feel more modern and "app-like":

### 1. Transform Data Tables into Cards on Mobile (COMPLETED)
**The Issue:** Pages like the Dashboard (Per-Person summary), Reports, and Recent Entries use `overflow-x: auto` to handle wide tables. While this works technically, horizontal scrolling forces users to lose context (e.g., scrolling right to see "Total Due" hides the "Employee Name").
**The Fix:** Used CSS media queries to convert tables to a stacked "card" layout on mobile. Injected a `MutationObserver` in `main.ts` to automatically map `<thead>` headers to `data-label` attributes on `<td>` cells for pure CSS responsive layouts across all 30+ tables in the app.

### 2. Replace the `<select>` Menu with a Drawer or Bottom Bar (PENDING)
**The Issue:** The main navigation relies on a `<select>` dropdown. While reliable, it lacks visual hierarchy and feels like a legacy web pattern.
**The Fix:** 
- Implement a **Slide-out Drawer** (hamburger menu) for all navigation links.
- Alternatively, for the most used routes (e.g., Time Entry, Tasks, Dashboard, Alerts), implement a **Bottom Navigation Bar** that stays fixed to the bottom of the screen.

### 3. Prevent Mobile Content Overflow (COMPLETED)
**The Issue:** On the Monthly Report page, multiple action buttons ("Summary CSV", "Daily CSV", "Print/Save", "Lock Month") wrap onto multiple lines, creating a cluttered top header and taking up valuable vertical space.
**The Fix:** 
- Added shared shrink constraints for panels, form controls, buttons, and flex/grid children so long content cannot force the page beyond the viewport.
- Made mobile table-card labels and values wrap safely, including action groups and values previously marked as non-wrapping.
- Made the month input use a full row on small screens and reduced the masthead type at phone widths.
- Updated the table label observer so asynchronously loaded rows also receive their mobile labels.
- Collapsed dense report/export toolbars into compact **Actions** menus on phones while preserving the inline desktop toolbars.
- Stacked responsive table-card labels above their values and kept time-entry, QAP/Classification, and installation inputs vertical through tablet widths.

### 4. Use Floating Action Buttons (FABs) (PENDING)
**The Issue:** On the Tasks and Time Entry pages, the large "New Task" or "Log Time" forms sit at the top of the page. On a phone, this pushes the actual list of tasks/entries completely below the fold.
**The Fix:** Hide the form by default on mobile and provide a prominent Floating Action Button (a large `+` icon fixed to the bottom right of the screen). Tapping it would open the form in a modal or slide-up panel, keeping the focus squarely on the content until the user is ready to create something new.

### 5. Streamline List Actions with Swipe Gestures (PENDING)
**The Issue:** Every item in the Tasks, Absences, or Approvals lists features inline buttons (e.g., "Edit", "Delete", "Approve", "Reject"). These crowd the limited mobile viewport.
**The Fix:** Consider implementing swipe actions (e.g., swipe right to approve, swipe left to delete) for list items. This cleans up the UI significantly while making rapid triage (like approving multiple leaves or expenses) much faster for managers.

### 6. Interactive Form Enhancements (PENDING)
**The Issue:** Standard HTML date and time inputs can sometimes trigger clunky native pickers depending on the OS.
**The Fix:** 
- Ensure `inputmode="numeric"` or `type="tel"` is used for fields like "Hours" to trigger the numpad keyboard automatically on iOS/Android.
- Ensure tap targets (checkboxes, radios) have at least a `44px` minimum height/width for comfortable tapping, padding out the custom checklist and role-selector inputs.
