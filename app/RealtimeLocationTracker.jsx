'use client'; // make sure Next.js treats this as client-side

import React, { useEffect, useRef, useState } from 'react';

export default function RealtimeLocationTracker() {
  const [isClient, setIsClient] = useState(false); // client-only flag
  const [wsUrl, setWsUrl] = useState('');
  const [room, setRoom] = useState('default-room');
  const [status, setStatus] = useState('disconnected');
  const [error, setError] = useState(null);

  const [selfId] = useState(() => `${Date.now()}-${Math.floor(Math.random() * 10000)}`);
  const wsRef = useRef(null);
  const watchIdRef = useRef(null);

  const [selfLocation, setSelfLocation] = useState(null);
  const [peers, setPeers] = useState({});


  const haversine = (lat1, lon1, lat2, lon2) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  console.log(distanceKm*1000+" distance in meters");
  return distanceKm ;//* 1000;  convert to meters
};


  // Client-only setup
  useEffect(() => {
    setIsClient(true);
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      setWsUrl(`${protocol}://backend-l8nu.onrender.com`);
    }
  }, []);

  const connect = () => {
    if (!isClient) return; // safety check
    if (wsRef.current) wsRef.current.close();
    setError(null);
    setStatus('connecting');

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        ws.send(JSON.stringify({ type: 'join', room, id: selfId }));
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'location' && msg.id !== selfId && msg.room === room) {
            setPeers((prev) => ({
              ...prev,
              [msg.id]: { lat: msg.lat, lon: msg.lon, ts: msg.ts, lastSeen: Date.now() },
            }));
          }
          if (msg.type === 'leave' && msg.id) {
            setPeers((prev) => {
              const copy = { ...prev };
              delete copy[msg.id];
              return copy;
            });
          }
        } catch (e) {
          console.warn('Bad WS msg', e);
        }
      };

      ws.onerror = () => {
        setError('WebSocket error');
        setStatus('error');
      };
      ws.onclose = () => {
        setStatus('disconnected');
        wsRef.current = null;
      };
    } catch (e) {
      setError(String(e));
      setStatus('error');
    }
  };

  const disconnect = () => {
    if (!isClient) return;
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'leave', room, id: selfId }));
      } catch {}
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
    setPeers({});
  };

  const sendLocation = (coords) => {
    setSelfLocation(coords);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: 'location', room, id: selfId, lat: coords.lat, lon: coords.lon, ts: Date.now() })
      );
    }
  };

  const startWatch = () => {
    if (!isClient) return;
    if (!('geolocation' in navigator)) {
      setError('Geolocation not supported');
      return;
    }
    if (watchIdRef.current) return;

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        sendLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setError(null);
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    watchIdRef.current = id;
  };

  const stopWatch = () => {
    if (!isClient) return;
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopWatch();
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setPeers((prev) => {
        const copy = { ...prev };
        Object.keys(copy).forEach((id) => {
          if (now - (copy[id].lastSeen || 0) > 30000) delete copy[id];
        });
        return copy;
      });
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const distanceToPeer = (p) => {
    if (!selfLocation || !p) return null;
    const temp= haversine(selfLocation.lat, selfLocation.lon, p.lat, p.lon);
    return temp;
  };

  const statusColor = {
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500',
    disconnected: 'bg-gray-400',
    error: 'bg-red-500',
  }[status];

  if (!isClient) return null; // don't render anything on server

  return (
    <div className="p-6 max-w-3xl mx-auto bg-white rounded-2xl shadow-lg space-y-6 text-black">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        📍 Realtime Location Tracker
      </h2>

      <div className="grid md:grid-cols-3 gap-3">
        <input
          value={wsUrl}
          onChange={(e) => setWsUrl(e.target.value)}
          className="col-span-2 border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 text-black"
          placeholder="ws://localhost:8080"
        />
        <input
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          className="border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 text-black"
          placeholder="Room ID"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={connect} className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700">
          Connect
        </button>
        <button onClick={disconnect} className="px-4 py-2 rounded-lg bg-gray-400 text-white hover:bg-gray-500">
          Disconnect
        </button>
        <button onClick={startWatch} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
          Start Sharing
        </button>
        <button onClick={stopWatch} className="px-4 py-2 rounded-lg bg-yellow-500 text-white hover:bg-yellow-600">
          Stop Sharing
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Connection card */}
        <div className="p-4 border rounded-lg shadow-sm space-y-2">
          <h3 className="font-semibold flex items-center gap-2">
            {status === 'connected' ? <>🛜</> : <>🛜 off</>} Connection
          </h3>
          <p className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${statusColor}`}></span>
            <strong>{status}</strong>
          </p>
          {error && <p className="text-sm text-red-600">⚠ {error}</p>}
          <p className="text-sm">Your ID: <code>{selfId}</code></p>
          {selfLocation ? (
            <p className="text-sm">📍 {selfLocation.lat.toFixed(5)}, {selfLocation.lon.toFixed(5)}</p>
          ) : (
            <p className="text-sm text-gray-500">Location not yet available</p>
          )}
        </div>

        {/* Peers card */}
        <div className="p-4 border rounded-lg shadow-sm space-y-2">
          <h3 className="font-semibold flex items-center gap-2">👥Peers ({Object.keys(peers).length})</h3>
          {Object.keys(peers).length === 0 ? (
            <p className="text-sm text-gray-500">No peers connected</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {Object.entries(peers).map(([id, p]) => {
                const dist = distanceToPeer(p);
                const isClose = dist !== null && dist <= 5;
                return (
                  <li key={id} className="py-3">
                    {isClose ? (
                      <div className="p-3 border rounded-lg bg-green-50 shadow-sm">
                        <div className="font-semibold">👤 User Profile</div>
                        <p className="font-mono text-xs">ID: {id}</p>
                        <p>Name: John Doe</p>
                        <p>Status: Active</p>
                        <p>Email: john@example.com</p>
                        <div className="mt-1 text-xs text-gray-500">
                          Distance: {(dist * 1000).toFixed(1)} m · Seen{' '}
                          {new Date(p.ts).toLocaleTimeString()}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 border rounded-lg shadow-sm animate-pulse space-y-2">
                        <div className="h-4 bg-gray-300 rounded w-1/2"></div>
                        <div className="h-4 bg-gray-300 rounded w-2/3"></div>
                        <div className="h-4 bg-gray-300 rounded w-1/3"></div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        💡 Tip: Open on two devices, connect to the same room, and move them closer than 10m to reveal peer profile data.
      </p>
    </div>
  );
}
