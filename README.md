# CPMIS Administrator Portal

Frontend-only administrator portal for a Construction Project Management Information System.

This build has no database or authentication. The portals share one demonstration store for the life of the dev server. Restarting the server restores the sample records.

## Run

```bash
npm install
npm run dev
```

- Administrator: http://localhost:3000/admin
- Project manager: http://localhost:3001/pm
- Site engineer: http://localhost:3002/se
- Quantity surveyor: http://localhost:3003/qs

If one of those ports is already taken, that portal moves up by 10 (3000, then 3010, then 3020) until it finds a free port. The URL it actually bound is printed when the server starts. Cross-portal links follow those bound ports.
