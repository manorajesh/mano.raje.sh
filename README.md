# mano.raje.sh

![License](https://img.shields.io/badge/license-MIT-blue)

Personal website and microblog for myself

## Building

### Everything

```bash
docker compose up --build
```

This will build the frontend, backend, and database containers. The frontend container will be served on port 80 with nginx. The backend container will be served on port 8080 with Actix-web. The database is a sqlite database that is stored in the backend container.

> [!NOTE]  
> This will open the website to the public.

### Frontend

```bash
npm run build
```

This will build the frontend and place the output in the `dist` directory.

### Backend

```bash
cargo build --release
```

This will build the backend and place the output in the `target/release` directory.

## Development

### Frontend

```bash
npm run start
```

This will start the frontend in development mode. The frontend will be served on port `3000``.

### Backend

```bash
cargo run
```

This will start the backend in development mode. The backend will be served on port `8080`.
