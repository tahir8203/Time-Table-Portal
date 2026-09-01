# GES Timetable Portal

A browser-based school timetable portal with class/teacher views, weekday-specific lesson splits, auto-build, leave cover, strong black-and-white printing, JSON backups, and a private Firebase library for multiple timetables.

The original standalone file, `Timetable Office — GES 53_2-L Okara.html`, is intentionally kept as an offline backup. The hosted app starts from `index.html`.

## Run locally

1. Install Node.js 20.19 or newer.
2. Run `npm install`.
3. Run `npm run dev` and open the address shown.

Without Firebase settings, every existing offline timetable feature still works. The Cloud timetables page shows the remaining setup instructions.

## Connect Firebase

1. In the [Firebase console](https://console.firebase.google.com/), create a project and add a Web app.
2. In **Build → Authentication → Sign-in method**, enable **Google**.
3. In **Build → Firestore Database**, create a database.
4. Copy `.env.example` to `.env.local` and replace each value with the matching Firebase web-app configuration value.
5. Deploy the included private-user rules:

   ```text
   npx firebase-tools login
   npx firebase-tools use --add
   npx firebase-tools deploy --only firestore:rules
   ```

Each signed-in user can read and write only `users/{their uid}/timetables/*`.

## Publish through GitHub and Vercel

1. Create a **private** GitHub repository and push this folder. The project contains school names and timetable data. Do not commit `.env.local`; all environment files except `.env.example` are already ignored.
2. In [Vercel](https://vercel.com/new), import the GitHub repository. Vercel detects the Vite project automatically.
3. In the Vercel project’s **Settings → Environment Variables**, add the six `VITE_FIREBASE_*` values shown in `.env.example` for Production, Preview and Development as needed.
4. Deploy. Future pushes to the connected GitHub branch will deploy automatically.
5. Back in Firebase Authentication, add the final Vercel domain (for example `your-project.vercel.app`) under **Settings → Authorized domains** so Google sign-in is allowed there.

## Cloud workflow

- **Save as new** creates a separately named Firestore record.
- **Save changes** updates the timetable currently marked OPEN.
- **Open** restores any saved timetable later.
- **Duplicate** creates another version without changing the original.
- **New timetable from same school setup** keeps teachers, classes, subjects and timings, while clearing lessons, leave and cover.
- JSON data files remain the recommended independent offline backup.
