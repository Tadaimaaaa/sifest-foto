import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { PhotoboothSession } from '../lib/session-manager';

export interface CountdownData {
  photoIndex: number;
  duration: number;
  remaining: number;
}

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [session, setSession] = useState<PhotoboothSession | null>(null);
  const [countdown, setCountdown] = useState<CountdownData | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<{ [index: number]: string }>({});
  
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('session:created', (data) => {
      setSession(data.session);
      setSessionError(null);
      setCountdown(null);
      setIsProcessing(false);
      setCapturedPhotos({});
    });

    socket.on('session:updated', (data) => {
      setSession(data.session);
      if (!data.session) {
        setCountdown(null);
        setIsProcessing(false);
        setCapturedPhotos({});
        setSessionError(null);
        return;
      }
      if (data.session?.id) {
        setCapturedPhotos(prev => {
          const next = { ...prev };
          if (data.session.photo1Path && !next[1]) next[1] = `/api/image/${data.session.id}/photo-1`;
          if (data.session.photo2Path && !next[2]) next[2] = `/api/image/${data.session.id}/photo-2`;
          if (data.session.photo3Path && !next[3]) next[3] = `/api/image/${data.session.id}/photo-3`;
          return next;
        });
      }
      if (data.session.status === 'abandoned' || data.session.status === 'error') {
        setTimeout(() => {
          setSession(null);
          setCountdown(null);
          setIsProcessing(false);
          setCapturedPhotos({});
        }, 3000);
      }
    });

    socket.on('session:reset', () => {
      setSession(null);
      setCountdown(null);
      setIsProcessing(false);
      setCapturedPhotos({});
      setSessionError(null);
    });

    socket.on('countdown:start', (data) => {
      setCountdown(data);
      setIsCapturing(false);
    });

    socket.on('countdown:tick', (data) => {
      setCountdown(prev => prev ? { ...prev, remaining: data.remaining } : data);
    });

    socket.on('countdown:capture', () => {
      setIsCapturing(true);
    });

    socket.on('countdown:captured', (data: { photoIndex: number; success: boolean; photoUrl?: string }) => {
      setIsCapturing(false);
      setCountdown(null);
      if (data?.photoIndex && data?.photoUrl) {
        setCapturedPhotos(prev => ({ ...prev, [data.photoIndex]: data.photoUrl! }));
      }
    });

    socket.on('processing:started', () => {
      setIsProcessing(true);
    });

    socket.on('processing:complete', (data) => {
      setIsProcessing(false);
      setSession(data.session);
    });

    socket.on('session:error', (data) => {
      setSessionError(data.error);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const resetSession = () => {
    setSession(null);
    setCountdown(null);
    setIsProcessing(false);
    setCapturedPhotos({});
    setSessionError(null);
    if (socketRef.current) {
      socketRef.current.emit('session:reset');
    }
  };

  return {
    socket: socketRef.current,
    isConnected,
    session,
    countdown,
    isCapturing,
    isProcessing,
    sessionError,
    capturedPhotos,
    resetSession,
  };
}
