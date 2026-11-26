# Architecture rules

- Store registration availability in a singleton database setting and enforce it with an Auth creation trigger; client controls alone cannot prevent direct signups.
- Keep the registration switch on Pending Requests and mount it only for admins; the write function independently verifies the caller's stored admin role.