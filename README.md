# Frontend

## Run

```powershell
cd frontend
npm install
npm run dev
```

Default dev URL: `http://localhost:5173`

## Environment

See `frontend/.env.example` for all variables.

For local desktop testing:

```env
VITE_SOCKET_URL=http://localhost:5000
VITE_PEER_HOST=localhost
VITE_PEER_PORT=5000
VITE_PEER_PATH=/peerjs/myapp
VITE_PEER_SECURE=false
```

For iPhone/Safari testing, use an HTTPS tunnel URL for backend and set secure values in `.env`.
