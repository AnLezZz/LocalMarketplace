# Localo Test Accounts

> **Note on Port:** The Localo Next.js application runs on **`http://localhost:3100`** (because port `3000` is reserved by OrbStack on this machine).

All test accounts below are pre-seeded in the Convex development database and ready to sign in at:
👉 **[http://localhost:3100/signin](http://localhost:3100/signin)**

---

## 🔑 Primary Demo Accounts (Easy Password: `password123`)

| Role | Email | Password | Direct Dashboard URL | Features to Test |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | `admin@localhub.nz` | `password123` | [http://localhost:3100/admin](http://localhost:3100/admin) | **Localo Admin Dashboard**: Platform overview stats, 4 KPI cards (Providers, Bookings, Rating, Pending), recent bookings stream, and provider applications review queue (Approve/Reject). |
| **Provider** | `provider@localhub.nz` | `password123` | [http://localhost:3100/provider](http://localhost:3100/provider) | **Localo Business Dashboard**: Alex Morgan (Gardening & Lawn Care), 4 KPI cards, incoming requests table (Accept/Decline), and interactive **Weekly Calendar** schedule. |
| **Customer** | `customer@localhub.nz` | `password123` | [http://localhost:3100/bookings](http://localhost:3100/bookings) | **Customer Portal**: Browse local pros, request bookings, and manage customer bookings under My Bookings. |

---

## 🛠️ Automated E2E Test Accounts

These accounts are used by the test runner and Playwright scripts:

| Role | Email | Password | Notes |
| :--- | :--- | :--- | :--- |
| **Admin (E2E)** | `e2e-admin@example.nz` | `ANwskk0hrcsmWdPcaXfJ4wOe` | Automated admin test account |
| **Provider (E2E)** | `e2e-owner@example.nz` | `ANwskk0hrcsmWdPcaXfJ4wOe` | Owns "E2E Test Provider (delete me)" listing |
| **Customer (E2E)** | `e2e-cust@example.nz` | `ANwskk0hrcsmWdPcaXfJ4wOe` | Automated customer booking account |
| **Applicant (E2E)** | `e2e-ui-applicant@example.nz` | `eWltB2J0cqovcx3ZaOBtkolQ` | Provider profile in pending review state |

---

## 💡 How to Create a New Account or Elevate Role

1. Go to **[http://localhost:3100/signin](http://localhost:3100/signin)** and switch to **Create account**.
2. Enter your Name, Email, and an 8+ character password.
3. To promote any email to **Admin**, run from the terminal:
   ```bash
   npx convex run users:grantAdmin '{"email":"your-email@example.nz"}'
   ```
4. To register as a **Provider**, visit [http://localhost:3100/provider/register](http://localhost:3100/provider/register).
