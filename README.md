# mano.raje.sh

Personal website and microblog for myself

## Building

```bash
docker compose up --build
```

This will build the frontend, backend, and database containers. The frontend container will be served on port 80 with nginx. The backend container will be served on port 8080 with Actix-web. The database is a sqlite database that is stored in the backend container.
