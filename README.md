# Lab Management System (starter)

Static web app for booking lab software slots, reporting faults, and managing licences, assets and users.
Pages are hosted on GitHub Pages; data lives in a free Supabase project. The Apache Guacamole portal and
the lab software run on the lab server (GitHub cannot host those).

## What is here

| File | Purpose |
| --- | --- |
| `index.html` | Sign in and create account |
| `booking.html` | Book a software slot (seats never exceed the licence) |
| `helpdesk.html` | Report a fault and follow its status |
| `admin.html`, `assets/admin.js` | Software, assets, faults, usage, users, backups |
| `assets/app.js`, `assets/style.css` | Shared code and styles |
| `config.js` | Your Supabase address, key and Guacamole link |
| `schema.sql` | Database tables, security rules and the seat-limit check |

## Setup

1. **Supabase.** Create a free project at supabase.com. In the SQL editor, paste and run `schema.sql`.
2. **Config.** In Project settings > API copy the project URL and the `anon` public key into `config.js`.
   Set `GUACAMOLE_URL` and `LAB_NAME`. Never put the `service_role` key anywhere in this repository.
3. **GitHub.** Create a department organisation, then a repository in it. Upload these files to the main branch.
4. **Pages.** In the repository go to Settings > Pages, choose "Deploy from a branch", branch `main`, folder `/ (root)`.
   Your site appears at `https://<organisation>.github.io/<repository>/`.
5. **Allow your site in Supabase.** In Authentication > URL configuration set the Site URL to that address.
6. **First super admin.** Sign up on your site, then run in the Supabase SQL editor
   (replace the email):
   ```sql
   update profiles set role = 'super_admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
   Then make Mr Obeng a `lab_admin` from the Users tab.

## Notes

- GitHub Pages on a private repository needs a paid plan, so use a public repository. That is safe here
  because the repository holds no passwords or student records, only code.
- Students can only see their own bookings and fault reports; the database enforces this, not the page.
- The free Supabase tier can pause an inactive project and has storage limits. Export the data weekly
  (Table editor > Export) until the system moves to the lab server.
- Usage logs from Guacamole are not imported automatically yet. The Usage tab shows bookings for now.
- Not included yet: lecturer class bookings, expiry email alerts, a monitoring page for server load.
