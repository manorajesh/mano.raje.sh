# mano.raje.sh

Personal website and microblog for myself

## Building

```bash
docker compose up --build
```

This will build the frontend, backend, and database containers. The frontend container will be served on port 80 with nginx. The backend container will be served on port 8080 with Actix-web. The database container will be served on port 5432 with Postgres.

The database will automatically create a db from the .env file if it does not exist. Make sure to set the `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` environment variables in the .env file.
