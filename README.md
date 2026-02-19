# Frontend

## Run

```powershell
cd frontend
npm install
npm run dev
```

Default dev URL: `http://localhost:5173`

## Environment

Set `frontend/.env`.

For local desktop testing:

```env
VITE_SOCKET_URL=http://localhost:5000
VITE_PEER_HOST=localhost
VITE_PEER_PORT=5000
VITE_PEER_PATH=/peerjs/myapp
VITE_PEER_SECURE=false
VITE_REMOTE_CONTROL_TOKEN=your-shared-token
VITE_HOST_APP_DOWNLOAD_URL=https://github.com/prima-mayank/remote-agent/releases/latest/download/host-app-win.zip
# Optional if installer registers protocol:
# VITE_HOST_APP_PROTOCOL_URL=hostapp://launch
```

For iPhone/Safari testing, use an HTTPS tunnel URL for backend and set secure values in `.env`.
