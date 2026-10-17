# Family Fest Ticket Desk

Ticket sales sheet for the two counters at Family Fest & Expo (Eventmaniapk).

- Live site: https://family-fest-tickets.vercel.app
- Database: Upstash Redis, connected in Vercel → Storage
- Optional PIN: set `DESK_PIN` in Vercel → Settings → Environment Variables, then redeploy

Every sale is saved on the laptop first, then uploaded. Removing a sale only hides it; nothing is deleted from the database.
