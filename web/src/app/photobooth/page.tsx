'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Banknote, ArrowLeft, Camera, Sparkles, CheckCircle2, Loader2, Palette, Check, X, Clock, Video, AlertTriangle, SwitchCamera, RefreshCw, Maximize, Minimize, Printer, Download } from 'lucide-react';

const PHOTO_FILTERS = [
  {
    id: 'normal',
    name: 'Normal (Asli)',
    tag: 'Warna Tajam & Natural',
    icon: '🌟',
    css: 'none',
  },
  {
    id: 'bw',
    name: 'Black & White',
    tag: 'Monokrom Klasik Analog',
    icon: '🖤',
    css: 'grayscale(100%) contrast(1.2) brightness(1.05)',
  },
  {
    id: 'vintage',
    name: 'Warm Vintage',
    tag: 'Nuansa Hangat Retro',
    icon: '🎞️',
    css: 'sepia(45%) contrast(1.1) brightness(1.05) saturate(1.2)',
  },
  {
    id: 'cool',
    name: 'Cool Cyber',
    tag: 'Tone Dingin Modern & Sejuk',
    icon: '❄️',
    css: 'hue-rotate(185deg) saturate(0.9) contrast(1.08) brightness(1.04)',
  },
  {
    id: 'dreamy',
    name: 'Soft Glow',
    tag: 'Pastel Lembut, Cerah & Glowing',
    icon: '🌸',
    css: 'brightness(1.12) contrast(0.95) saturate(1.25)',
  }
];

const WebcamMirror = ({ isCapturing }: { isCapturing?: boolean }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [cameraMode, setCameraMode] = useState<'dslr' | 'webcam'>('dslr');
  const [dslrConnected, setDslrConnected] = useState<boolean>(false);
  const [isConnectingDslr, setIsConnectingDslr] = useState<boolean>(true);
  const [streamKey, setStreamKey] = useState<number>(() => Date.now());
  const [dslrNotice, setDslrNotice] = useState<string | null>(null);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isWebcamLoading, setIsWebcamLoading] = useState<boolean>(false);
  const [isWebcamMirrored, setIsWebcamMirrored] = useState<boolean>(false);

  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dslrFailCountRef = useRef<number>(0);

  // Clean up streaming connection when component unmounts to prevent socket exhaustion
  useEffect(() => {
    return () => {
      if (imgRef.current) {
        imgRef.current.src = '';
      }
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  // Enumerate available video input devices (webcams)
  useEffect(() => {
    async function getDevices() {
      try {
        if (!navigator?.mediaDevices?.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        setAvailableDevices(videoInputs);
        if (videoInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(videoInputs[0].deviceId);
        }
      } catch (err) {
        console.warn("Could not enumerate camera devices:", err);
      }
    }
    getDevices();
  }, [selectedDeviceId]);

  // Webcam streaming effect
  useEffect(() => {
    if (cameraMode !== 'webcam') return;

    let stream: MediaStream | null = null;
    let isCancelled = false;

    const startWebcam = async () => {
      setIsWebcamLoading(true);
      try {
        const constraints: MediaStreamConstraints = {
          video: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'user' }
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (isCancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing webcam:", err);
      } finally {
        if (!isCancelled) setIsWebcamLoading(false);
      }
    };

    startWebcam();

    return () => {
      isCancelled = true;
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [cameraMode, selectedDeviceId]);

  // Handle retry connect to DSLR
  const handleTryConnectDslr = () => {
    setIsConnectingDslr(true);
    setDslrNotice(null);
    dslrFailCountRef.current = 0;
    setCameraMode('dslr');
    setStreamKey(Date.now());
  };

  // Switch to next available webcam device
  const handleSwitchWebcam = () => {
    if (availableDevices.length <= 1) return;
    const currentIndex = availableDevices.findIndex(d => d.deviceId === selectedDeviceId);
    const nextIndex = (currentIndex + 1) % availableDevices.length;
    setSelectedDeviceId(availableDevices[nextIndex].deviceId);
  };

  return (
    <div className="w-full h-full relative overflow-hidden rounded-[3rem] border-[12px] border-white/20 shadow-[0_0_50px_rgba(255,255,255,0.2)] bg-black/50 backdrop-blur-sm group select-none">
      
      {/* Tampilan Kamera */}
      {cameraMode === 'dslr' ? (
        <>
          <img 
            ref={imgRef}
            key={streamKey}
            src={`/api/camera/live?t=${streamKey}`}
            alt="DSLR Live View Stream"
            className="absolute inset-0 w-full h-full object-cover"
            onLoad={() => {
              setDslrConnected(true);
              setIsConnectingDslr(false);
              setDslrNotice(null);
              dslrFailCountRef.current = 0;
            }}
            onError={() => {
              // Jika sedang dalam proses capture foto (shutter jepret), jangan anggap error
              if (isCapturing) return;

              console.warn("Koneksi stream DSLR sedang menunggu digiCamControl...");
              dslrFailCountRef.current++;
              
              if (dslrFailCountRef.current >= 10) {
                // Auto fallback ke Webcam setelah 10x kegagalan (~15-20 detik)
                setCameraMode('webcam');
                setDslrConnected(false);
                setIsConnectingDslr(false);
                setDslrNotice("digiCamControl / DSLR tidak terdeteksi di port 5513. Otomatis beralih ke Webcam Laptop.");
              } else {
                if (retryTimeoutRef.current) return;
                retryTimeoutRef.current = setTimeout(() => {
                  retryTimeoutRef.current = null;
                  setStreamKey(Date.now());
                }, 1500);
              }
            }}
          />

          {isConnectingDslr && !dslrConnected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 text-white z-10 gap-3">
              <Loader2 size={44} className="animate-spin text-yellow-400" />
              <p className="text-lg font-bold tracking-wide">Menghubungkan DSLR (digiCamControl)...</p>
              <p className="text-xs text-white/60">Pastikan aplikasi digiCamControl dibuka & port 5513 aktif</p>
            </div>
          )}
        </>
      ) : (
        <>
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className={`absolute inset-0 w-full h-full object-cover ${isWebcamMirrored ? 'scale-x-[-1]' : ''}`} 
          />
          {isWebcamLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 text-white z-10 gap-3">
              <Loader2 size={44} className="animate-spin text-yellow-400" />
              <p className="text-lg font-bold tracking-wide">Menyalakan Webcam Laptop...</p>
            </div>
          )}
        </>
      )}

      {/* Floating Camera Mode & Controls Badge (Top Right) */}
      <div className="absolute top-6 right-6 z-30 flex items-center gap-2">
        {cameraMode === 'dslr' ? (
          <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 text-white text-xs font-bold shadow-lg">
            <span className={`w-2.5 h-2.5 rounded-full ${dslrConnected ? 'bg-green-400 animate-pulse' : 'bg-yellow-400 animate-ping'}`} />
            <span>📷 DSLR (digiCamControl)</span>
            <button
              onClick={() => {
                setCameraMode('webcam');
                setDslrNotice(null);
              }}
              className="ml-2 bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-full text-[11px] transition"
              title="Ganti ke Webcam Laptop"
            >
              Ganti ke Webcam
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 text-white text-xs font-bold shadow-lg">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
            <span>📹 Webcam Laptop</span>
            <button
              onClick={() => setIsWebcamMirrored(prev => !prev)}
              className="bg-white/20 hover:bg-white/30 px-2 py-1 rounded-full text-[11px] transition"
              title="Ubah orientasi cermin webcam"
            >
              {isWebcamMirrored ? '🪞 Cermin' : '📷 Asli'}
            </button>
            {availableDevices.length > 1 && (
              <button
                onClick={handleSwitchWebcam}
                className="bg-white/20 hover:bg-white/30 px-2 py-1 rounded-full text-[11px] flex items-center gap-1 transition"
                title="Ganti Lensa Kamera"
              >
                <SwitchCamera size={13} />
                <span>Ganti</span>
              </button>
            )}
            <button
              onClick={handleTryConnectDslr}
              className="ml-1 bg-yellow-400/90 hover:bg-yellow-400 text-blue-950 font-black px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1 transition shadow"
              title="Coba sambungkan kamera DSLR"
            >
              <RefreshCw size={12} className={isConnectingDslr ? 'animate-spin' : ''} />
              <span>Hubungkan DSLR</span>
            </button>
          </div>
        )}
      </div>

      {/* Notification Toast if Fallback Triggered */}
      {dslrNotice && cameraMode === 'webcam' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 max-w-[90%] bg-amber-500/95 text-slate-950 font-bold px-5 py-2.5 rounded-2xl shadow-2xl border border-amber-300 flex items-center gap-3 text-xs sm:text-sm animate-fade-in backdrop-blur-md">
          <AlertTriangle size={18} className="shrink-0 text-slate-950" />
          <div className="flex flex-col text-left">
            <span>{dslrNotice}</span>
            <span className="text-[10px] text-slate-900 font-semibold opacity-90">
              Tips: Jika memakai DSLR, buka aplikasi <b>digiCamControl</b> di laptop dan pastikan kamera menyala.
            </span>
          </div>
          <button 
            onClick={() => setDslrNotice(null)}
            className="ml-auto text-slate-900 hover:text-black font-black text-base px-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

const TemplateCard = ({
  tpl,
  isSelected,
  onSelect,
  index
}: {
  tpl: { id: string; name: string; icon: string; file: string };
  isSelected: boolean;
  onSelect: (id: string) => void;
  index: number;
}) => {
  const [imageError, setImageError] = useState(false);

  return (
    <motion.button
      key={tpl.id}
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => onSelect(tpl.id)}
      className={`flex flex-col items-center justify-between p-6 h-[40vh] rounded-3xl border transition-all relative overflow-hidden backdrop-blur-md ${
        isSelected 
          ? 'border-yellow-400 bg-white/25 shadow-[0_0_35px_rgba(250,204,21,0.5)]' 
          : 'border-white/30 bg-white/10 hover:bg-white/20'
      }`}
    >
      {isSelected && (
        <motion.div 
          layoutId="selection-ring"
          className="absolute inset-0 bg-yellow-400/10 pointer-events-none"
        />
      )}
      
      {/* Preview Frame atau Emoji Fallback */}
      <div className="w-full flex-1 flex items-center justify-center p-2 min-h-0 overflow-hidden">
        {!imageError ? (
          <img 
            src={tpl.file} 
            alt={tpl.name}
            className="max-h-full max-w-[85%] object-contain rounded-xl shadow-lg border border-white/20"
            onError={() => setImageError(true)}
          />
        ) : (
          <div 
            className={`w-24 h-24 rounded-full flex items-center justify-center text-5xl shadow-inner ${
              isSelected ? 'bg-yellow-400/30' : 'bg-white/10'
            }`}
          >
            {tpl.icon}
          </div>
        )}
      </div>

      <span className={`text-2xl font-black text-center px-4 tracking-widest mt-4 ${
        isSelected ? 'text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]' : 'text-white'
      }`}>{tpl.name}</span>
    </motion.button>
  );
};

const DEFAULT_TEMPLATES = [
  { id: 'y2k-dreamy', name: 'Y2K Dreamy', icon: '✨', file: '/templates/y2k-dreamy.png?v=2' },
  { id: 'classic', name: 'Classic', icon: '📸', file: '/templates/classic.png?v=2' },
  { id: 'futuristic', name: 'Futuristic', icon: '🚀', file: '/templates/futuristic.png?v=2' },
  { id: 'fun', name: 'Fun', icon: '🎈', file: '/templates/fun.png?v=2' },
];

export default function PhotoboothKiosk() {
  const { socket, isConnected, session, countdown, isCapturing, isProcessing, isFilterSelecting, applyFilter, retakePhoto, sessionError, capturedPhotos, resetSession } = useSocket();
  const [retakeModalOpen, setRetakeModalOpen] = useState(false);
  const [step, setStep] = useState<'welcome' | 'payment' | 'qris_payment' | 'cash_verification' | 'template'>('welcome');
  const [availableTemplates, setAvailableTemplates] = useState<Array<{ id: string; name: string; icon: string; file: string; holes?: Array<{ top: string; left: string; width: string; height: string }> }>>(DEFAULT_TEMPLATES);
  const [templateSelection, setTemplateSelection] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [isCompletedDismissed, setIsCompletedDismissed] = useState(false);
  const [finalImageError, setFinalImageError] = useState(false);
  const [templateOverlayError, setTemplateOverlayError] = useState(false);

  // Filter Selection State
  const [selectedFilter, setSelectedFilter] = useState<string>('normal');
  const [filterTimer, setFilterTimer] = useState<number>(30);
  const [isChangingFilter, setIsChangingFilter] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [finalImageKey, setFinalImageKey] = useState<number>(() => Date.now());

  // DOKU QRIS Payment State
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentData, setPaymentData] = useState<{
    paymentUrl: string;
    invoiceNumber: string;
    amount: number;
  } | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [isStarting, setIsStarting] = useState(false);
  const [printStatus, setPrintStatus] = useState<'IDLE'|'PENDING'|'PRINTING'|'COMPLETED'|'FAILED'>('IDLE');
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [printLayoutMode, setPrintLayoutMode] = useState<'8-slots' | '6-slots'>('8-slots');
  const [selectedPrintSlots, setSelectedPrintSlots] = useState<number[]>([1]);
  const [isFullCenterPrint, setIsFullCenterPrint] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as any;
      setIsFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    try {
      const doc = document as any;
      const docEl = document.documentElement as any;

      if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen().catch(() => {});
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen();
        }
      } else {
        if (doc.exitFullscreen) {
          doc.exitFullscreen().catch(() => {});
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        }
      }
    } catch (e) {
      console.warn("Fullscreen toggle error:", e);
    }
  };

  useEffect(() => {
    if (session && session.status === 'active') {
      setIsCompletedDismissed(false);
      setFinalImageError(false);
      setTemplateOverlayError(false);
      setSelectedFilter((session as any).filterId || 'normal');
      setIsStarting(false);
    }
  }, [session]);

  useEffect(() => {
    if (sessionError) {
      setIsStarting(false);
      if (sessionError === 'SESSION_ALREADY_ACTIVE') {
        resetSession();
      }
    }
  }, [sessionError, resetSession]);

  // Timers per page
  const [templateTimer, setTemplateTimer] = useState<number>(60);
  const [paymentTimer, setPaymentTimer] = useState<number>(60);
  const [cashTimer, setCashTimer] = useState<number>(60);
  const [qrisTimer, setQrisTimer] = useState<number>(180);
  const [resultTimer, setResultTimer] = useState<number>(90);

  // Dynamic templates fetching
  const fetchAvailableTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/templates');
      const data = await res.json();
      if (data.success && Array.isArray(data.templates) && data.templates.length > 0) {
        setAvailableTemplates(
          data.templates.map((t: any) => ({
            id: t.id,
            name: t.name,
            icon: t.icon,
            file: t.url || `/templates/${t.id}.png?v=2`,
            holes: t.holes,
          }))
        );
      }
    } catch (e) {
      console.warn('Failed to fetch dynamic templates, using defaults:', e);
    }
  }, []);

  const getSlotStyles = useCallback((tplId: string) => {
    const activeTpl = availableTemplates.find(t => t.id === tplId);
    if (activeTpl?.holes && activeTpl.holes.length === 3) {
      return activeTpl.holes;
    }

    // SI FEST Layout: 3 foto di atas, judul di bawah (Y = 190, 1060, 1940)
    if (tplId.includes('si-fest') || tplId.includes('sifest')) {
      return [
        { top: '5.28%', left: '8.33%', width: '83.33%', height: '19.44%' },
        { top: '29.44%', left: '8.33%', width: '83.33%', height: '19.44%' },
        { top: '53.89%', left: '8.33%', width: '83.33%', height: '19.44%' },
      ];
    }

    // Classic / Y2K Layout: Judul di atas, 3 foto di bawah (Y = 908, 1746, 2582)
    return [
      { top: '25.2%', left: '10.0%', width: '80.0%', height: '20.8%' },
      { top: '48.5%', left: '10.0%', width: '80.0%', height: '20.8%' },
      { top: '71.7%', left: '10.0%', width: '80.0%', height: '20.8%' },
    ];
  }, [availableTemplates]);

  useEffect(() => {
    fetchAvailableTemplates();
  }, [fetchAvailableTemplates]);

  useEffect(() => {
    if (step === 'template') {
      fetchAvailableTemplates();
    }
  }, [step, fetchAvailableTemplates]);

  const templateSelectionRef = useRef(templateSelection);
  const printPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    templateSelectionRef.current = templateSelection;
  }, [templateSelection]);

  // Timer dinonaktifkan sesuai permintaan pengguna (bebas waktu tanpa batas / countdown mati)
  useEffect(() => {
    if (!templateSelection && availableTemplates.length > 0) {
      setTemplateSelection(availableTemplates[0].id);
    }
  }, [availableTemplates, templateSelection]);

  const handleReapplyFilter = async (filterId: string) => {
    if (!session?.id) return;
    setIsChangingFilter(true);
    try {
      const res = await fetch(`/api/session/${session.id}/filter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filterId }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedFilter(filterId);
        setFinalImageKey(Date.now());
      }
    } catch (err) {
      console.error('Gagal mengganti filter:', err);
    } finally {
      setIsChangingFilter(false);
      setFilterModalOpen(false);
    }
  };

  const handlePaymentSuccess = () => {
    setPaymentSuccess(true);
    setTimeout(() => {
      setStep('template');
      setPaymentSuccess(false);
      setPaymentData(null);
    }, 1500);
  };

  // Listen to payment webhook via Socket.io and poll status fallback
  useEffect(() => {
    if (step !== 'qris_payment' || !paymentData?.invoiceNumber || paymentSuccess) return;

    const onPaymentDone = (data: any) => {
      if (!data?.invoiceNumber || data.invoiceNumber === paymentData.invoiceNumber) {
        handlePaymentSuccess();
      }
    };

    socket?.on('payment:success', onPaymentDone);

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payment/status/${paymentData.invoiceNumber}`);
        const data = await res.json();
        if (data.status === 'SUCCESS') {
          handlePaymentSuccess();
        }
      } catch (err) {
        // silent fallback
      }
    }, 2500);

    return () => {
      socket?.off('payment:success', onPaymentDone);
      clearInterval(pollInterval);
    };
  }, [step, paymentData, paymentSuccess, socket]);

  const startQrisPayment = async () => {
    setStep('qris_payment');
    setPaymentLoading(true);
    setPaymentError(null);
    setPaymentSuccess(false);
    try {
      const res = await fetch('/api/payment/create', { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Gagal membuat transaksi DOKU');
      }
      setPaymentData({
        paymentUrl: data.paymentUrl,
        invoiceNumber: data.invoiceNumber,
        amount: data.amount || 1,
      });
    } catch (err: any) {
      setPaymentError(err.message || 'Koneksi ke gateway pembayaran gagal');
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleMulaiClick = () => {
    setStep('payment');
  };

  const handlePaymentSelect = (method: 'qris' | 'cash') => {
    if (method === 'cash') {
      // Hilangkan password cash: langsung masuk ke pemilihan template!
      setStep('template');
    } else {
      startQrisPayment();
    }
  };

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep('template');
    setAccessCode('');
  };

  const handleStartSession = (overrideTemplateId?: string) => {
    if (!socket || isStarting) return;
    const tpl = overrideTemplateId || templateSelectionRef.current || templateSelection || availableTemplates[0]?.id || 'y2k-dreamy';
    setIsStarting(true);
    setStep('welcome'); // Exit 'template' step immediately
    socket.emit('session:start', { templateId: tpl });
    setTimeout(() => setIsStarting(false), 3000);
  };

  const handlePrintClick = () => {
    if (!session || printStatus === 'PENDING' || printStatus === 'PRINTING') return;
    setIsPrintModalOpen(true);
  };

  const startPrint = async (slotsArg?: string) => {
    if (!session || printStatus === 'PENDING' || printStatus === 'PRINTING') return;
    setIsPrintModalOpen(false);
    setPrintStatus('PENDING');
    try {
      const prefix = printLayoutMode === '6-slots' ? '6-' : '8-';
      const slotsToSend = slotsArg || (isFullCenterPrint ? 'center' : `${prefix}${selectedPrintSlots.join(',')}`);
      const res = await fetch(`/api/print/${session.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: slotsToSend }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error('Gagal menambah antrean cetak:', errText);
        throw new Error(errText || 'Gagal menambah antrean');
      }
      pollPrintStatus();
    } catch (e) {
      setPrintStatus('FAILED');
    }
  };

  const pollPrintStatus = () => {
    if (!session) return;
    if (printPollIntervalRef.current) {
      clearInterval(printPollIntervalRef.current);
    }
    printPollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/print/${session.id}`);
        const data = await res.json();
        if (data.status) {
           setPrintStatus(data.status);
           if (data.status === 'COMPLETED' || data.status === 'FAILED') {
             if (printPollIntervalRef.current) {
               clearInterval(printPollIntervalRef.current);
               printPollIntervalRef.current = null;
             }
           }
        }
      } catch (err) {
        if (printPollIntervalRef.current) {
          clearInterval(printPollIntervalRef.current);
          printPollIntervalRef.current = null;
        }
      }
    }, 2000);
  };

  const resetSelection = () => {
    if (printPollIntervalRef.current) {
      clearInterval(printPollIntervalRef.current);
      printPollIntervalRef.current = null;
    }
    setIsCompletedDismissed(true);
    setFinalImageError(false);
    resetSession();
    setStep('welcome');
    setTemplateSelection(null);
    setPrintStatus('IDLE');
    setIsPrintModalOpen(false);
    setAccessCode('');
    setTemplateTimer(60);
    setPaymentTimer(60);
    setCashTimer(60);
    setQrisTimer(180);
    setResultTimer(90);
  };

  // Dynamic tunnel URL from backend config (saved in storage/tunnel-url.txt)
  const [tunnelUrl, setTunnelUrl] = useState<string>('');
  const [localIp, setLocalIp] = useState<string>('');
  const publicBaseUrl = process.env.NEXT_PUBLIC_PHOTO_BASE_URL;

  const refreshTunnelConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/config?t=${Date.now()}`);
      const data = await res.json();
      if (data?.tunnelUrl && !data.tunnelUrl.includes('api.trycloudflare.com')) {
        setTunnelUrl(data.tunnelUrl);
      }
      if (data?.localIp) {
        setLocalIp(data.localIp);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    refreshTunnelConfig();
  }, [refreshTunnelConfig]);

  // When session completes, immediately refresh tunnel URL so QR code always holds the freshest public link
  useEffect(() => {
    if (session && session.status === 'completed') {
      refreshTunnelConfig();
    }
  }, [session?.status, refreshTunnelConfig]);

  // Background elements for official.sifest.my.id style
  const Background = () => (
    <div className="absolute inset-0 -z-10 bg-[#3b82f6] overflow-hidden flex items-center justify-center">
      {/* CSS Clouds */}
      <motion.div 
        animate={{ x: [0, 20, 0], y: [0, -10, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-32 left-10 opacity-40"
      >
        <div className="relative w-[300px] h-[100px] bg-[#60a5fa] rounded-full blur-[2px]">
          <div className="absolute w-[150px] h-[150px] bg-[#60a5fa] rounded-full -top-[70px] left-[40px]" />
          <div className="absolute w-[120px] h-[120px] bg-[#60a5fa] rounded-full -top-[40px] right-[40px]" />
        </div>
      </motion.div>
      
      <motion.div 
        animate={{ x: [0, -20, 0], y: [0, 10, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute bottom-40 right-10 opacity-30"
      >
        <div className="relative w-[400px] h-[120px] bg-[#60a5fa] rounded-full blur-[2px]">
          <div className="absolute w-[200px] h-[200px] bg-[#60a5fa] rounded-full -top-[100px] left-[60px]" />
          <div className="absolute w-[160px] h-[160px] bg-[#60a5fa] rounded-full -top-[60px] right-[50px]" />
        </div>
      </motion.div>

      {/* Diamond Stars */}
      <motion.div 
        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }} 
        transition={{ duration: 3, repeat: Infinity }}
        className="absolute top-[35%] left-[25%] text-white text-3xl"
      >✦</motion.div>
      <motion.div 
        animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }} 
        transition={{ duration: 4, repeat: Infinity, delay: 1.5 }}
        className="absolute bottom-[20%] right-[40%] text-yellow-300 text-2xl"
      >✦</motion.div>
    </div>
  );

  // Active Session Flow
  if (session && session.status === 'active') {
    const currentPhotoIndex = countdown ? countdown.photoIndex : ((session as any).currentPhoto || 1);
    const normalizedTemplateId = (session.templateId || 'y2k-dreamy').toLowerCase().trim().replace(/\s+/g, '-');
    const templateUrl = `/templates/${normalizedTemplateId}.png?v=2`;
    const activeFilterCss = PHOTO_FILTERS.find(f => f.id === selectedFilter)?.css || 'none';
    const slotStyles = getSlotStyles(normalizedTemplateId);

    // 1. FILTER SELECTION STUDIO (Muncul setelah 3 foto selesai dijepret)
    if (isFilterSelecting) {
      const p1 = capturedPhotos[1] || `/api/image/${session.id}/photo-1`;
      const p2 = capturedPhotos[2] || `/api/image/${session.id}/photo-2`;
      const p3 = capturedPhotos[3] || `/api/image/${session.id}/photo-3`;
      const hasRetaken = Boolean((session as any)?.hasRetaken);

      return (
        <main className="w-screen h-screen flex flex-col items-center justify-center overflow-hidden select-none relative font-sans">
          <Background />

          <div className="flex flex-col md:flex-row items-center justify-center w-full h-full max-h-[92vh] p-4 md:p-8 gap-6 md:gap-12 z-10">
            
            {/* SISI KIRI: Live Preview Strip dengan filter yang dipilih */}
            <div className="h-[68vh] md:h-[84vh] aspect-[600/1800] bg-slate-900/50 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.4)] relative overflow-hidden flex flex-col justify-between border-4 border-white/60 shrink-0">
              
              {/* Slot 1 */}
              <div 
                style={slotStyles[0]}
                onClick={() => { if (!hasRetaken) setRetakeModalOpen(true); }}
                className={`absolute overflow-hidden rounded-xl bg-slate-900/50 flex items-center justify-center transition-all ${!hasRetaken ? 'cursor-pointer hover:ring-2 hover:ring-yellow-400 group/slot1' : ''}`}
                title={!hasRetaken ? "Klik untuk foto ulang frame ini" : undefined}
              >
                <img 
                  src={p1} 
                  alt="Pose 1" 
                  style={{ filter: activeFilterCss }}
                  className="w-full h-full object-cover transition-all duration-300" 
                />
                {!hasRetaken && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/slot1:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-yellow-300 font-bold text-xs bg-black/50">
                    <RefreshCw size={14} className="animate-spin-slow" />
                    <span>Ulang Pose 1</span>
                  </div>
                )}
              </div>

              {/* Slot 2 */}
              <div 
                style={slotStyles[1]}
                onClick={() => { if (!hasRetaken) setRetakeModalOpen(true); }}
                className={`absolute overflow-hidden rounded-xl bg-slate-900/50 flex items-center justify-center transition-all ${!hasRetaken ? 'cursor-pointer hover:ring-2 hover:ring-yellow-400 group/slot2' : ''}`}
                title={!hasRetaken ? "Klik untuk foto ulang frame ini" : undefined}
              >
                <img 
                  src={p2} 
                  alt="Pose 2" 
                  style={{ filter: activeFilterCss }}
                  className="w-full h-full object-cover transition-all duration-300" 
                />
                {!hasRetaken && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/slot2:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-yellow-300 font-bold text-xs bg-black/50">
                    <RefreshCw size={14} className="animate-spin-slow" />
                    <span>Ulang Pose 2</span>
                  </div>
                )}
              </div>

              {/* Slot 3 */}
              <div 
                style={slotStyles[2]}
                onClick={() => { if (!hasRetaken) setRetakeModalOpen(true); }}
                className={`absolute overflow-hidden rounded-xl bg-slate-900/50 flex items-center justify-center transition-all ${!hasRetaken ? 'cursor-pointer hover:ring-2 hover:ring-yellow-400 group/slot3' : ''}`}
                title={!hasRetaken ? "Klik untuk foto ulang frame ini" : undefined}
              >
                <img 
                  src={p3} 
                  alt="Pose 3" 
                  style={{ filter: activeFilterCss }}
                  className="w-full h-full object-cover transition-all duration-300" 
                />
                {!hasRetaken && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/slot3:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-yellow-300 font-bold text-xs bg-black/50">
                    <RefreshCw size={14} className="animate-spin-slow" />
                    <span>Ulang Pose 3</span>
                  </div>
                )}
              </div>

              {/* Template Overlay Frame */}
              {!templateOverlayError && (
                <img 
                  src={templateUrl} 
                  alt="Template Frame"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
                  onError={() => setTemplateOverlayError(true)}
                />
              )}
            </div>

            {/* SISI KANAN: Panel Pemilihan Filter */}
            <div className="flex flex-col items-center md:items-start max-w-xl w-full bg-white/20 p-6 md:p-8 rounded-[2.5rem] backdrop-blur-md border-2 md:border-4 border-white/50 shadow-2xl overflow-y-auto max-h-[85vh]">
              
              <div className="flex items-center gap-3 mb-2">
                <Sparkles size={28} className="text-yellow-400 animate-pulse" />
                <h1 className="text-3xl md:text-5xl font-black text-yellow-300 drop-shadow-md">
                  PILIH FILTER STRIP
                </h1>
              </div>
              <p className="text-sky-100 text-sm md:text-base mb-6 font-medium">
                Sentuh filter di bawah untuk melihat preview warna strip fotomu secara instan!
              </p>

              {/* Daftar Filter */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mb-6">
                {PHOTO_FILTERS.map((f) => {
                  const isSelected = selectedFilter === f.id;
                  return (
                    <motion.button
                      key={f.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedFilter(f.id)}
                      className={`flex items-center gap-3 p-3 md:p-4 rounded-2xl border-2 transition-all text-left ${
                        isSelected 
                          ? 'bg-white/35 border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.5)] ring-2 ring-yellow-300' 
                          : 'bg-white/10 border-white/25 hover:bg-white/20'
                      }`}
                    >
                      <div className="text-3xl shrink-0 p-2 rounded-xl bg-white/10">{f.icon}</div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className={`font-black text-base md:text-lg truncate ${isSelected ? 'text-yellow-300' : 'text-white'}`}>
                          {f.name}
                        </span>
                        <span className="text-white/70 text-xs truncate">
                          {f.tag}
                        </span>
                      </div>
                      {isSelected && (
                        <div className="w-6 h-6 rounded-full bg-yellow-400 text-blue-900 flex items-center justify-center font-black text-sm shrink-0">
                          ✓
                        </div>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {/* Tombol Ulang 1 Foto (Fitur Retake Maks 1 Frame) */}
              {!hasRetaken ? (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setRetakeModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 mb-4 rounded-2xl bg-white/15 hover:bg-white/25 active:scale-98 border-2 border-dashed border-yellow-300/60 text-white font-bold text-sm md:text-base transition-all shadow-md group cursor-pointer"
                >
                  <RefreshCw size={18} className="text-yellow-400 group-hover:rotate-180 transition-transform duration-500" />
                  <span>Ada Pose Kurang Pas? <span className="text-yellow-300 underline font-black">Ulang 1 Foto</span></span>
                </motion.button>
              ) : (
                <div className="w-full flex items-center justify-center gap-2 py-2 px-4 mb-4 rounded-xl bg-white/5 border border-white/10 text-white/50 text-xs font-semibold">
                  <Check size={14} className="text-emerald-400" />
                  <span>Kesempatan ulang 1 foto telah digunakan</span>
                </div>
              )}

              {/* Tombol Aksi */}
              <div className="flex items-center justify-between w-full mb-3 px-2">
                <span className="text-white/80 font-medium text-xs md:text-sm">
                  Pilih gaya warna foto favorit Anda:
                </span>
                <button
                  onClick={() => applyFilter('normal')}
                  className="text-white/60 hover:text-white text-xs underline cursor-pointer"
                >
                  Lewati
                </button>
              </div>

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => applyFilter(selectedFilter)}
                className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-blue-950 font-black text-xl md:text-2xl py-4 md:py-5 rounded-2xl md:rounded-3xl shadow-[0_10px_30px_rgba(250,204,21,0.5)] border-2 border-yellow-200 transition-all flex items-center justify-center gap-3 cursor-pointer"
              >
                <span>GUNAKAN FILTER INI</span>
                <CheckCircle2 size={26} />
              </motion.button>
            </div>

          </div>

          {/* Modal Pilih Frame yang Mau Diulang */}
          <AnimatePresence>
            {retakeModalOpen && !hasRetaken && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
              >
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  className="bg-slate-900/95 border-2 md:border-4 border-yellow-400/60 p-6 md:p-8 rounded-[2.5rem] max-w-2xl w-full shadow-[0_0_50px_rgba(250,204,21,0.3)] flex flex-col items-center text-center relative font-sans"
                >
                  <button
                    onClick={() => setRetakeModalOpen(false)}
                    className="absolute top-5 right-5 text-white/60 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <X size={24} />
                  </button>

                  <div className="flex items-center gap-2 text-yellow-400 mb-2">
                    <RefreshCw size={28} className="animate-spin-slow" />
                    <h2 className="text-2xl md:text-4xl font-black text-white">
                      PILIH 1 POSE UNTUK DIULANG
                    </h2>
                  </div>
                  
                  <p className="text-white/80 text-sm md:text-base mb-6 max-w-md font-medium">
                    Kamu memiliki <span className="text-yellow-300 font-black">1 kali kesempatan</span> untuk mengulang salah satu pose fotomu. Pilih pose mana yang ingin kamu foto ulang:
                  </p>

                  <div className="grid grid-cols-3 gap-3 md:gap-4 w-full mb-6">
                    {[
                      { index: 1, url: p1, label: 'Pose 1' },
                      { index: 2, url: p2, label: 'Pose 2' },
                      { index: 3, url: p3, label: 'Pose 3' }
                    ].map((item) => (
                      <motion.button
                        key={item.index}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          setRetakeModalOpen(false);
                          retakePhoto(item.index);
                        }}
                        className="group relative flex flex-col items-center p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 border-2 border-white/20 hover:border-yellow-400 transition-all shadow-lg text-left cursor-pointer"
                      >
                        <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-black/40 mb-2 relative">
                          <img 
                            src={item.url} 
                            alt={item.label} 
                            style={{ filter: activeFilterCss }}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                          />
                          <div className="absolute top-2 left-2 bg-black/70 text-yellow-300 font-mono text-xs px-2 py-0.5 rounded-md font-black">
                            #{item.index}
                          </div>
                        </div>
                        <span className="font-black text-white text-base md:text-lg group-hover:text-yellow-300 transition-colors">
                          {item.label}
                        </span>
                        <span className="text-xs text-yellow-400 font-bold mt-1 flex items-center gap-1">
                          <Camera size={13} /> Ulang Pose Ini
                        </span>
                      </motion.button>
                    ))}
                  </div>

                  <button
                    onClick={() => setRetakeModalOpen(false)}
                    className="px-6 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-sm font-semibold transition-colors cursor-pointer"
                  >
                    Batal, Tetap Pakai Foto Sekarang
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      );
    }

    return (
      <main className="w-screen h-screen flex flex-col items-center justify-center overflow-hidden select-none relative font-sans">
        <Background />

        {/* Error overlay */}
        <AnimatePresence>
          {sessionError && (
            <motion.div 
              initial={{ opacity: 0, y: -50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              className="absolute top-8 bg-red-600/95 backdrop-blur-md text-white px-8 py-4 rounded-full text-lg md:text-2xl font-black shadow-2xl z-50 border-2 border-red-300 flex items-center gap-3 text-center"
            >
              <span>
                {sessionError === 'CAMERA_DISCONNECTED'
                  ? '📷 Kamera DSLR tidak terdeteksi! Pastikan kabel USB terpasang dan kamera menyala.'
                  : sessionError === 'CANON_AF_FAILED'
                  ? '⚠️ Autofokus gagal (Err 8D01). Geser tombol lensa ke "MF" (Manual Focus) agar shutter bisa jepret!'
                  : sessionError === 'CANON_ERROR_81'
                  ? '⚠️ Kamera sibuk / Autofokus gagal (Err 81). Geser switch lensa ke "MF" (Manual Focus) atau matikan & hidupkan kamera.'
                  : sessionError === 'CAMERA_NOT_READY'
                  ? '⏳ Kamera sedang bersiap, mohon tunggu sebentar...'
                  : sessionError === 'CAPTURE_FAILED'
                  ? '❌ Gagal menjepret foto. Periksa kabel USB & status kamera DSLR.'
                  : sessionError === 'CAMERA_CAPTURE_TIMEOUT'
                  ? '⏳ Kamera DSLR tidak merespons (Timeout). Periksa tombol power & kabel USB.'
                  : sessionError}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active Session Split Layout */}
        <div className="flex flex-row items-center justify-between w-full h-full p-8 md:p-12 gap-8 md:gap-12 z-10">
          
          {/* SISI KIRI: Live Template Strip Preview (Mengisi otomatis sesuai urutan jepretan) */}
          <div className="h-full flex flex-col items-center justify-center select-none">
            
            {/* Header Mini Strip */}
            <div className="flex items-center gap-2 bg-white/20 backdrop-blur-md px-6 py-2 rounded-full border border-white/30 mb-3 shadow-md">
              <Sparkles size={16} className="text-yellow-400 animate-pulse" />
              <span className="text-xs md:text-sm font-black text-white tracking-widest uppercase">
                STRIP FOTO HASIL
              </span>
            </div>

            {/* Container Strip Foto 1:3 */}
            <div className="h-[84vh] aspect-[600/1800] bg-slate-900/50 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.35)] relative overflow-hidden flex flex-col justify-between border-4 border-white/60">
              
              {/* Slot Foto 1 (Atas: Bleed pas di belakang lubang frame) */}
              <div 
                style={slotStyles[0]}
                className="absolute overflow-hidden rounded-xl bg-slate-900/50 flex items-center justify-center"
              >
                {capturedPhotos[1] ? (
                  <motion.img 
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    src={capturedPhotos[1]} 
                    alt="Pose 1" 
                    className="w-full h-full object-cover" 
                  />
                ) : currentPhotoIndex === 1 ? (
                  <div className="flex flex-col items-center justify-center text-yellow-300 animate-pulse gap-1">
                    <Camera size={26} />
                    <span className="text-[11px] font-black tracking-widest uppercase drop-shadow">Pose 1...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-white/50 gap-1">
                    <span className="text-2xl font-black">1</span>
                    <span className="text-[10px] tracking-wider uppercase font-semibold">Pose 1</span>
                  </div>
                )}
              </div>

              {/* Slot Foto 2 (Tengah: Bleed pas di belakang lubang frame) */}
              <div 
                style={slotStyles[1]}
                className="absolute overflow-hidden rounded-xl bg-slate-900/50 flex items-center justify-center"
              >
                {capturedPhotos[2] ? (
                  <motion.img 
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    src={capturedPhotos[2]} 
                    alt="Pose 2" 
                    className="w-full h-full object-cover" 
                  />
                ) : currentPhotoIndex === 2 ? (
                  <div className="flex flex-col items-center justify-center text-yellow-300 animate-pulse gap-1">
                    <Camera size={26} />
                    <span className="text-[11px] font-black tracking-widest uppercase drop-shadow">Pose 2...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-white/50 gap-1">
                    <span className="text-2xl font-black">2</span>
                    <span className="text-[10px] tracking-wider uppercase font-semibold">Pose 2</span>
                  </div>
                )}
              </div>

              {/* Slot Foto 3 (Bawah: Bleed pas di belakang lubang frame) */}
              <div 
                style={slotStyles[2]}
                className="absolute overflow-hidden rounded-xl bg-slate-900/50 flex items-center justify-center"
              >
                {capturedPhotos[3] ? (
                  <motion.img 
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    src={capturedPhotos[3]} 
                    alt="Pose 3" 
                    className="w-full h-full object-cover" 
                  />
                ) : currentPhotoIndex === 3 ? (
                  <div className="flex flex-col items-center justify-center text-yellow-300 animate-pulse gap-1">
                    <Camera size={26} />
                    <span className="text-[11px] font-black tracking-widest uppercase drop-shadow">Pose 3...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-white/50 gap-1">
                    <span className="text-2xl font-black">3</span>
                    <span className="text-[10px] tracking-wider uppercase font-semibold">Pose 3</span>
                  </div>
                )}
              </div>

              {/* Template Overlay Frame (Di atas foto agar bingkai & stiker menempel natural) */}
              {!templateOverlayError && (
                <img 
                  src={templateUrl} 
                  alt="Template Frame"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
                  onError={() => setTemplateOverlayError(true)}
                />
              )}
            </div>
          </div>

          {/* SISI TENGAH & KANAN: Live Camera Mirror Besar */}
          <div className="flex-1 h-[88vh] relative">
            <WebcamMirror isCapturing={isCapturing} />

            {/* Overlay Status Bar (Top Left) */}
            <div className="absolute top-8 left-8 flex items-center gap-4 z-20">
              <div className="bg-white/20 backdrop-blur-md px-8 py-3 rounded-full border border-white/40 shadow-xl">
                <span className="text-2xl font-black text-white tracking-widest drop-shadow-md">
                  {countdown?.isRetake ? `ULANG FOTO ${currentPhotoIndex}` : `FOTO ${currentPhotoIndex} DARI 3`}
                </span>
              </div>
            </div>

            {/* Countdown Overlay Melayang di Tengah Kamera */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-30">
              {isCapturing ? (
                <div className="flex flex-col items-center">
                  <motion.h2 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: [1, 1.15, 1], opacity: 1 }}
                    transition={{ duration: 0.4, repeat: Infinity }}
                    className="text-6xl md:text-8xl font-black text-yellow-300 drop-shadow-[0_0_40px_rgba(250,204,21,1)] mb-2 tracking-widest font-sans"
                  >
                    📸 SENYUM!
                  </motion.h2>
                </div>
              ) : countdown ? (
                <div className="flex flex-col items-center">
                  <motion.h2 
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-5xl md:text-6xl font-black text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.9)] mb-2 tracking-widest font-sans"
                  >
                    {countdown?.isRetake ? `ULANG POSE ${countdown.photoIndex}!` : 'BERSIAPLAH!'}
                  </motion.h2>

                  <motion.div 
                    key={countdown.remaining}
                    initial={{ scale: 0.3, opacity: 0 }}
                    animate={{ scale: [1.3, 1], opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className="text-[160px] md:text-[220px] font-black leading-none text-white drop-shadow-[0_0_50px_rgba(255,255,255,0.9)]"
                  >
                    {countdown.remaining}
                  </motion.div>
                </div>
              ) : null}

              {isProcessing && (
                <div className="bg-black/60 backdrop-blur-xl border border-white/20 px-12 py-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4 pointer-events-auto">
                  <div className="w-16 h-16 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-3xl font-black text-white tracking-widest">MEMPROSES STRIP FOTO...</span>
                  <span className="text-white/60 text-base">Sedang menggabungkan foto dengan template Anda</span>
                </div>
              )}
            </div>

            {/* White Flash Overlay inside the camera box (Auto fade-out like real studio flash) */}
            <AnimatePresence>
              {isCapturing && (
                <motion.div 
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 bg-white z-40 rounded-[3rem] pointer-events-none"
                />
              )}
            </AnimatePresence>
          </div>
          
        </div>
      </main>
    );
  }

  // Result State
  if (!isCompletedDismissed && session && session.status === 'completed') {
    const downloadToken = (session as any).downloadToken;
    const rawBaseUrl = (tunnelUrl && !tunnelUrl.includes('api.trycloudflare.com') && !tunnelUrl.includes('localhost'))
      ? tunnelUrl
      : (publicBaseUrl && !publicBaseUrl.includes('api.trycloudflare.com') && !publicBaseUrl.includes('localhost'))
      ? publicBaseUrl
      : (localIp && localIp !== 'localhost' && localIp !== '127.0.0.1')
      ? `http://${localIp}:3000`
      : (typeof window !== 'undefined' ? window.location.origin : '');
    const activeBaseUrl = rawBaseUrl;
    const qrUrl = (activeBaseUrl && downloadToken) ? `${activeBaseUrl}/photo/${downloadToken}` : null;

    return (
      <main className="w-screen h-screen flex flex-col items-center justify-center overflow-hidden select-none relative font-sans">
        <Background />
        
        <div className="flex flex-col md:flex-row gap-6 md:gap-16 items-center justify-center w-full max-w-[95vw] h-full max-h-[88vh] z-10">
          
          {/* Photo Preview (2x6 proportion layout) */}
          <div className="h-[55vh] md:h-full bg-white p-3 md:p-4 rounded-xl shadow-2xl transform -rotate-1 md:-rotate-2 shrink-0">
            {!finalImageError ? (
              <img 
                src={`/api/image/${session.id}/final?t=${finalImageKey}`} 
                alt="Hasil Foto" 
                className="h-full w-auto object-contain rounded border-2 border-slate-100 shadow-md"
                onError={() => setFinalImageError(true)}
              />
            ) : (
              <div className="h-full w-[200px] md:w-[250px] flex items-center justify-center text-slate-400 font-bold text-center p-4 md:p-8">
                Gagal memuat preview foto
              </div>
            )}
          </div>

          <div className="flex flex-col items-start max-w-xl md:max-w-2xl bg-white/20 p-6 md:p-12 rounded-[2rem] md:rounded-[3rem] backdrop-blur-md border-2 md:border-4 border-white/50 shadow-2xl">
            <h1 className="text-4xl md:text-7xl font-black text-yellow-300 mb-3 md:mb-6 drop-shadow-lg">
              KEREN BANGET! 🎉
            </h1>
            
            {qrUrl ? (
              <div className="flex flex-col gap-2 mb-6 md:mb-8 w-full">
                <div className="flex gap-4 md:gap-8 items-center bg-white/10 p-4 md:p-6 rounded-2xl md:rounded-3xl border-2 border-white/30">
                  <div className="bg-white p-3 md:p-4 rounded-xl md:rounded-2xl shadow-xl shrink-0">
                    <QRCodeSVG value={qrUrl} size={110} className="md:w-[150px] md:h-[150px]" level="M" />
                  </div>
                  <div>
                    <h3 className="text-xl md:text-3xl font-bold text-white mb-1 md:mb-2">Scan untuk Download!</h3>
                    <p className="text-sky-100 text-sm md:text-lg leading-relaxed">
                      Arahkan kamera HP kamu ke QR Code ini untuk menyimpan hasil foto kamu (Gratis!). Tautan hanya berlaku 1 jam.
                    </p>
                  </div>
                </div>
                {activeBaseUrl.includes('trycloudflare.com') ? (
                  <p className="text-xs text-emerald-200 bg-emerald-950/60 border border-emerald-400/40 px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5">
                    🌐 Cloud Online Aktif: Pengunjung bisa download langsung dari jaringan internet HP masing-masing!
                  </p>
                ) : (activeBaseUrl.includes('192.168.') || activeBaseUrl.includes('10.') || activeBaseUrl.includes('172.')) ? (
                  <p className="text-xs text-sky-200 bg-sky-950/60 border border-sky-400/40 px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5">
                    📶 WiFi Lokal Siap: Pastikan HP pengunjung terhubung ke WiFi / Hotspot yang sama dengan laptop ini.
                  </p>
                ) : (activeBaseUrl.includes('localhost') || activeBaseUrl.includes('127.0.0.1')) && (
                  <p className="text-xs text-amber-200 bg-amber-900/60 border border-amber-400/40 px-3 py-1.5 rounded-xl font-semibold">
                    ⚠️ Cloudflare Tunnel offline. Hubungkan laptop dan HP pengunjung ke WiFi/Hotspot yang sama agar QR Code dapat dibuka.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xl md:text-3xl text-white font-bold mb-6 md:mb-8 leading-relaxed">
                Foto kamu berhasil disimpan! (Fitur sinkronisasi QR Cloud sedang menunggu konfigurasi panitia).
              </p>
            )}

            {/* Tombol Cetak, Download & Ganti Filter */}
            <div className="flex flex-col gap-3 w-full mb-4 md:mb-6">
              <div className="flex flex-col sm:flex-row gap-3 md:gap-4 w-full">
                <button 
                  onClick={handlePrintClick}
                  disabled={printStatus === 'PENDING' || printStatus === 'PRINTING'}
                  className={`flex-1 border-2 md:border-4 px-4 md:px-6 py-3 md:py-5 rounded-2xl md:rounded-3xl text-base md:text-2xl font-black shadow-xl transition-all transform ${
                    printStatus === 'PENDING' || printStatus === 'PRINTING'
                      ? 'bg-slate-500/50 text-white border-slate-400 cursor-not-allowed opacity-80'
                      : 'bg-gradient-to-b from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 text-white border-emerald-300 hover:scale-105 active:scale-95 cursor-pointer'
                  }`}
                >
                  {printStatus === 'PENDING' && '⏳ MENUNGGU...'}
                  {printStatus === 'PRINTING' && '🖨️ MENCETAK...'}
                  {printStatus === 'COMPLETED' && '🖨️ CETAK LAGI'}
                  {printStatus === 'FAILED' && '❌ COBA CETAK LAGI'}
                  {printStatus === 'IDLE' && '🖨️ CETAK FISIK'}
                </button>

                <a 
                  href={`/api/image/${session.id}/final?download=1`}
                  download={`SI-FEST-2026-${session.id}.jpg`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-blue-500 to-cyan-600 hover:from-blue-400 hover:to-cyan-500 text-white border-2 md:border-4 border-cyan-300 px-4 md:px-6 py-3 md:py-5 rounded-2xl md:rounded-3xl text-base md:text-2xl font-black shadow-xl transition-all transform hover:scale-105 active:scale-95 cursor-pointer text-center"
                >
                  <Download size={26} />
                  <span>UNDUH FOTO</span>
                </a>
              </div>

              <button 
                onClick={() => setFilterModalOpen(true)}
                disabled={isChangingFilter}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-b from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white border-2 md:border-4 border-purple-300 px-5 md:px-8 py-3 md:py-4 rounded-2xl md:rounded-3xl text-base md:text-xl font-black shadow-xl transition-all transform hover:scale-[1.02] active:scale-95 cursor-pointer"
              >
                <Palette size={22} />
                <span>{isChangingFilter ? 'MEMPROSES...' : 'GANTI FILTER LAIN'}</span>
              </button>
            </div>

            {/* Modal Pemilihan Posisi Cetak Kertas A4 (6 Bagian) */}
            {isPrintModalOpen && (
              <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-slate-900/95 border-2 border-emerald-400 p-6 md:p-8 rounded-[2.5rem] shadow-2xl max-w-lg w-full flex flex-col items-center text-white"
                >
                  <div className="flex items-center justify-between w-full mb-3">
                    <h2 className="text-xl md:text-2xl font-black text-emerald-300 flex items-center gap-2">
                      <Printer size={26} className="text-emerald-400" />
                      Pilih Posisi Cetak (Kertas A4)
                    </h2>
                    <button 
                      onClick={() => setIsPrintModalOpen(false)}
                      className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
                    >
                      <X size={22} />
                    </button>
                  </div>

                  {/* Pilihan Mode Tata Letak Kertas A4 */}
                  <div className="flex bg-white/10 p-1 rounded-xl gap-1 mb-3 w-full border border-white/20">
                    <button
                      type="button"
                      onClick={() => {
                        setPrintLayoutMode('8-slots');
                        setSelectedPrintSlots([1]);
                        setIsFullCenterPrint(false);
                      }}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-black transition-all ${
                        printLayoutMode === '8-slots'
                          ? 'bg-emerald-500 text-white shadow-md'
                          : 'text-white/70 hover:text-white'
                      }`}
                    >
                      4 Atas × 4 Bawah (8 Slot)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPrintLayoutMode('6-slots');
                        setSelectedPrintSlots([1]);
                        setIsFullCenterPrint(false);
                      }}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-black transition-all ${
                        printLayoutMode === '6-slots'
                          ? 'bg-emerald-500 text-white shadow-md'
                          : 'text-white/70 hover:text-white'
                      }`}
                    >
                      3 Atas × 3 Bawah (6 Bagian)
                    </button>
                  </div>

                  <p className="text-white/80 text-xs md:text-sm mb-3 text-center leading-relaxed">
                    Kertas A4 muat <b className="text-yellow-300">{printLayoutMode === '8-slots' ? '8 strip foto' : '6 strip foto'}</b>. Pilih kotak nomor yang masih kosong di kertas Anda agar kertas foto dapat dihemat dan dipakai ulang!
                  </p>

                  {/* Simulasi Kertas A4 Interaktif */}
                  <div className="w-full bg-slate-100 text-slate-800 p-3 rounded-2xl shadow-inner border border-slate-300 mb-4">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">
                      <span>📄 Kertas A4 ({printLayoutMode === '8-slots' ? '4 Atas × 4 Bawah = 8 Bagian' : '3 Atas × 3 Bawah = 6 Bagian'})</span>
                      <span className="text-emerald-600 font-extrabold">
                        {isFullCenterPrint ? 'Mode 1 Strip Besar' : `${selectedPrintSlots.length} Bagian Dipilih`}
                      </span>
                    </div>

                    <div className={`grid gap-2 p-2 bg-white rounded-xl border-2 border-dashed border-slate-300 ${
                      printLayoutMode === '8-slots' ? 'grid-cols-4' : 'grid-cols-3'
                    }`}>
                      {(printLayoutMode === '8-slots' ? [1, 2, 3, 4, 5, 6, 7, 8] : [1, 2, 3, 4, 5, 6]).map((slotNum) => {
                        const isSelected = selectedPrintSlots.includes(slotNum) && !isFullCenterPrint;
                        const maxInRow = printLayoutMode === '8-slots' ? 4 : 3;
                        const posText = slotNum <= maxInRow ? 'Atas' : 'Bawah';
                        const colNum = ((slotNum - 1) % maxInRow) + 1;

                        return (
                          <button
                            key={slotNum}
                            type="button"
                            onClick={() => {
                              setIsFullCenterPrint(false);
                              setSelectedPrintSlots(prev => {
                                if (prev.includes(slotNum)) {
                                  if (prev.length === 1) return prev; // Pertahankan minimal 1
                                  return prev.filter(s => s !== slotNum);
                                } else {
                                  return [...prev, slotNum].sort((a,b) => a-b);
                                }
                              });
                            }}
                            className={`flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-all relative cursor-pointer min-h-[90px] ${
                              isSelected
                                ? 'bg-gradient-to-b from-emerald-500 to-emerald-600 text-white border-emerald-400 shadow-lg scale-[1.03] ring-2 ring-emerald-300'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/60'
                            }`}
                          >
                            {isSelected ? (
                              <>
                                <CheckCircle2 size={20} className="text-white drop-shadow mb-1 animate-pulse" />
                                <span className="text-xs font-black">Slot {slotNum}</span>
                                <span className="text-[9px] font-semibold opacity-90">CETAK</span>
                              </>
                            ) : (
                              <>
                                <span className="text-base font-black text-slate-400 mb-0.5">#{slotNum}</span>
                                <span className="text-[10px] font-bold text-slate-700">K{colNum}</span>
                                <span className="text-[8px] text-slate-400">{posText}</span>
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Pilihan 1 Strip Penuh di Tengah */}
                  <div className="flex items-center justify-between w-full px-3 py-2 mb-4 bg-white/5 rounded-xl border border-white/10">
                    <span className="text-xs text-white/80">Mau cetak 1 strip besar di tengah kertas?</span>
                    <button
                      type="button"
                      onClick={() => setIsFullCenterPrint(prev => !prev)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-bold border transition-all ${
                        isFullCenterPrint
                          ? 'bg-yellow-400 text-slate-900 border-yellow-300 shadow font-black'
                          : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                      }`}
                    >
                      {isFullCenterPrint ? '✓ Mode 1 Strip Tengah Aktif' : 'Pilih 1 Strip Tengah'}
                    </button>
                  </div>

                  {/* Tombol Aksi */}
                  <div className="flex gap-3 w-full">
                    <button
                      type="button"
                      onClick={() => setIsPrintModalOpen(false)}
                      className="flex-1 bg-white/10 hover:bg-white/20 text-white py-3 md:py-4 rounded-2xl font-bold text-sm md:text-base transition-all"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={() => startPrint()}
                      className="flex-[2] bg-gradient-to-b from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 text-white border-2 border-emerald-300 py-3 md:py-4 rounded-2xl font-black text-sm md:text-base shadow-xl transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Printer size={20} />
                      <span>
                        CETAK SEKARANG {isFullCenterPrint ? '(Tengah)' : `(Bagian ${selectedPrintSlots.join(', ')})`}
                      </span>
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            {/* Modal Pemilihan Ulang Filter */}
            {filterModalOpen && (
              <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-slate-900/95 border-2 border-yellow-400 p-6 md:p-8 rounded-[2.5rem] shadow-2xl max-w-lg w-full flex flex-col items-center"
                >
                  <div className="flex items-center justify-between w-full mb-4">
                    <h2 className="text-2xl md:text-3xl font-black text-yellow-300 flex items-center gap-2">
                      <Palette size={28} />
                      Ganti Filter Foto
                    </h2>
                    <button 
                      onClick={() => setFilterModalOpen(false)}
                      className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
                    >
                      <X size={24} />
                    </button>
                  </div>
                  <p className="text-white/80 text-sm mb-6 text-center">
                    Pilih filter baru untuk strip fotomu. Hasil akan langsung diperbarui!
                  </p>

                  <div className="flex flex-col gap-3 w-full mb-6">
                    {PHOTO_FILTERS.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => handleReapplyFilter(f.id)}
                        disabled={isChangingFilter}
                        className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left ${
                          selectedFilter === f.id
                            ? 'bg-yellow-400/20 border-yellow-400 text-yellow-300 ring-2 ring-yellow-400'
                            : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{f.icon}</span>
                          <div>
                            <div className="font-black text-lg">{f.name}</div>
                            <div className="text-xs text-white/60">{f.tag}</div>
                          </div>
                        </div>
                        {selectedFilter === f.id && <Check size={20} className="text-yellow-400" />}
                      </button>
                    ))}
                  </div>
                </motion.div>
              </div>
            )}


            <button 
              onClick={resetSelection}
              className="w-full bg-sky-500 hover:bg-sky-400 text-white border-2 md:border-4 border-sky-300 px-8 md:px-16 py-3 md:py-6 rounded-full text-xl md:text-4xl font-black shadow-[0_10px_30px_rgba(14,165,233,0.5)] transition-all transform hover:scale-105 active:scale-95"
            >
              SELESAI & KEMBALI
            </button>
          </div>

        </div>
      </main>
    );
  }

  // Initial State: Welcome & Template Selection
  return (
    <main className="w-screen h-screen flex flex-col items-center justify-center overflow-hidden select-none relative font-sans">
      <Background />
      
      {/* Network / Connection indicators */}
      {!isConnected && (
        <div className="absolute top-6 left-6 bg-red-600/90 backdrop-blur-sm text-white px-6 py-3 rounded-full font-bold text-xl shadow-lg border-2 border-red-400 z-50 flex items-center gap-3">
          <div className="w-4 h-4 bg-red-300 rounded-full animate-pulse" />
          Koneksi ke server terputus
        </div>
      )}



      {sessionError && !session && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-red-600/90 backdrop-blur-sm text-white px-6 py-3 rounded-full font-bold text-base md:text-xl shadow-lg border-2 border-red-400 z-50 flex items-center gap-3 max-w-[90vw] text-center">
          <span>
            {sessionError === 'CAMERA_DISCONNECTED'
              ? '📷 Kamera DSLR tidak terdeteksi! Pastikan kamera menyala & kabel terpasang.'
              : sessionError === 'CANON_ERROR_81'
              ? '⚠️ Kamera sibuk / AF gagal (Err 81). Geser switch lensa ke "MF".'
              : sessionError === 'SESSION_ALREADY_ACTIVE'
              ? 'Mengatur ulang sesi lama...'
              : sessionError}
          </span>
          <button 
            onClick={() => resetSession()}
            className="text-xs bg-white/20 hover:bg-white/40 px-3 py-1 rounded-full text-white underline ml-2"
          >
            Tutup
          </button>
        </div>
      )}

      {step === 'welcome' && (
        <button
          onClick={toggleFullscreen}
          className="absolute top-6 right-6 sm:top-8 sm:right-8 z-40 flex items-center gap-2 bg-white/10 hover:bg-white/25 active:scale-95 backdrop-blur-md px-4 py-2 sm:px-5 sm:py-2.5 rounded-full border border-white/20 text-white shadow-lg text-sm sm:text-base font-semibold transition-all cursor-pointer"
          title={isFullscreen ? "Keluar Layar Penuh" : "Layar Penuh (Fullscreen)"}
        >
          {isFullscreen ? <Minimize size={18} className="text-yellow-400" /> : <Maximize size={18} className="text-yellow-400" />}
          <span>{isFullscreen ? "Kecilkan Layar" : "Layar Penuh"}</span>
        </button>
      )}

      {step === 'welcome' && (
        <div className="flex flex-col items-center z-10 w-full px-4 sm:px-8 mt-6 sm:mt-16">
          <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 1 }}
            className="flex flex-col items-center mb-8 sm:mb-16"
          >
            <h1 className="text-6xl sm:text-8xl md:text-9xl font-black text-white tracking-wide drop-shadow-[0_0_20px_rgba(255,255,255,0.8)]">
              SI FEST
            </h1>
            <h1 className="text-7xl sm:text-9xl md:text-[10rem] leading-none font-black text-yellow-400 tracking-wide drop-shadow-[0_0_25px_rgba(250,204,21,0.8)] -mt-2 sm:-mt-4">
              2026
            </h1>
          </motion.div>
          
          <motion.div 
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-3 sm:gap-4 bg-white/10 backdrop-blur-md border border-white/30 text-white px-6 sm:px-10 py-2 sm:py-3 rounded-full mb-8 sm:mb-16"
          >
            <span className="text-yellow-400">✦</span>
            <span className="text-lg sm:text-2xl font-bold tracking-[0.2em]">PHOTOBOOTH EXPERIENCE</span>
            <span className="text-yellow-400">✦</span>
          </motion.div>
          
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleMulaiClick}
            className="bg-white/20 hover:bg-white/30 backdrop-blur-md border-2 border-white/50 text-white px-12 sm:px-24 py-5 sm:py-8 rounded-full text-2xl sm:text-4xl font-black shadow-[0_0_30px_rgba(255,255,255,0.3)] transition-all flex flex-col items-center"
          >
            MULAI SEKARANG
          </motion.button>
        </div>
      )}

      {step === 'payment' && (
        <div className="flex flex-col items-center w-full max-w-[90vw] z-10">
          <motion.h1 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-3xl sm:text-5xl font-black text-white mb-8 sm:mb-16 tracking-widest drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] text-center"
          >
            PILIH METODE PEMBAYARAN
          </motion.h1>

          <div className="flex flex-col sm:flex-row gap-6 sm:gap-12 mb-8 sm:mb-16">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handlePaymentSelect('qris')}
              className="flex flex-col items-center justify-center w-[260px] h-[220px] sm:w-[320px] sm:h-[320px] md:w-[350px] md:h-[350px] rounded-3xl border border-white/40 bg-white/10 backdrop-blur-md shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:bg-white/20 transition-all group"
            >
              <QrCode size={70} strokeWidth={1.5} className="text-white mb-4 sm:mb-8 group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] transition-all sm:w-[100px] sm:h-[100px]" />
              <span className="text-2xl sm:text-3xl font-bold text-white tracking-widest">SCAN QRIS</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handlePaymentSelect('cash')}
              className="flex flex-col items-center justify-center w-[260px] h-[220px] sm:w-[320px] sm:h-[320px] md:w-[350px] md:h-[350px] rounded-3xl border border-white/40 bg-white/10 backdrop-blur-md shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:bg-white/20 transition-all group"
            >
              <Banknote size={70} strokeWidth={1.5} className="text-white mb-4 sm:mb-8 group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] transition-all sm:w-[100px] sm:h-[100px]" />
              <span className="text-2xl sm:text-3xl font-bold text-white tracking-widest">CASH</span>
            </motion.button>
          </div>
          

          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setStep('welcome')}
            className="flex items-center gap-3 bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/50 text-white px-8 sm:px-12 py-3 sm:py-4 rounded-full text-xl sm:text-2xl font-bold transition-all shadow-lg"
          >
            <ArrowLeft size={24} />
            KEMBALI
          </motion.button>
        </div>
      )}

      {step === 'qris_payment' && (
        <div className="flex flex-col items-center w-full max-w-[90vw] z-10 -mt-2">
          <motion.h1 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-3xl font-black text-white mb-3 tracking-widest drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] flex items-center gap-3"
          >
            PEMBAYARAN DOKU / QRIS
          </motion.h1>

          <div className="bg-white/15 backdrop-blur-md border-2 border-white/40 p-4 rounded-[2.5rem] shadow-2xl flex flex-col items-center max-w-2xl mb-3">
            {paymentLoading && (
              <div className="flex flex-col items-center justify-center p-16 w-full min-h-[400px]">
                <Loader2 size={64} className="text-yellow-400 animate-spin mb-6" />
                <p className="text-3xl font-bold text-white tracking-wide">Menyiapkan QR Pembayaran...</p>
                <p className="text-xl text-sky-200 mt-2">Menghubungkan ke server DOKU</p>
              </div>
            )}

            {paymentError && (
              <div className="flex flex-col items-center justify-center p-12 text-center w-full">
                <p className="text-2xl font-bold text-red-300 mb-6">{paymentError}</p>
                <button
                  onClick={startQrisPayment}
                  className="bg-yellow-400 text-blue-900 font-black px-8 py-4 rounded-2xl text-xl shadow-lg hover:bg-yellow-300 transition-all"
                >
                  Coba Lagi
                </button>
              </div>
            )}

            {paymentSuccess && (
              <div className="flex flex-col items-center justify-center p-16 text-center w-full">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 10 }}
                >
                  <CheckCircle2 size={100} className="text-green-400 mb-6 drop-shadow-[0_0_20px_rgba(74,222,128,0.8)]" />
                </motion.div>
                <h2 className="text-5xl font-black text-white mb-4">PEMBAYARAN BERHASIL! 🎉</h2>
                <p className="text-2xl text-yellow-300 font-bold">Mengalihkan ke pemilihan template...</p>
              </div>
            )}

            {!paymentLoading && !paymentError && !paymentSuccess && paymentData && (
              <div className="flex flex-col items-center w-full">
                {/* Container cropped to show only Order Summary and QR Code */}
                <div className="w-[440px] h-[515px] bg-white rounded-3xl overflow-hidden shadow-2xl border-4 border-white/80 relative flex justify-center">
                  <iframe
                    src={paymentData.paymentUrl}
                    className="w-[500px] h-[820px] border-0 shrink-0"
                    style={{
                      marginTop: '-225px',
                      transform: 'scale(0.88)',
                      transformOrigin: 'top center',
                    }}
                    title="DOKU QRIS Payment"
                    allow="payment"
                    scrolling="no"
                  />
                </div>
                <div className="flex items-center gap-2 bg-emerald-500/25 border border-emerald-400/50 text-emerald-100 px-5 py-2 rounded-xl mt-3 shadow-md">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="font-bold text-sm tracking-wide">Arahkan m-Banking / E-Wallet langsung ke QR Code di atas</span>
                </div>
              </div>
            )}
          </div>


          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setStep('payment');
              setPaymentData(null);
              setPaymentError(null);
            }}
            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/50 text-white px-8 py-3 rounded-full text-xl font-bold transition-all shadow-lg"
          >
            <ArrowLeft size={22} />
            BATAL / KEMBALI
          </motion.button>
        </div>
      )}

      {step === 'cash_verification' && (
        <div className="flex flex-col items-center w-full max-w-[90vw] z-10 text-center">
          <motion.h1 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-5xl font-black text-white mb-6 tracking-widest drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]"
          >
            PEMBAYARAN TUNAI
          </motion.h1>
          
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-white/10 backdrop-blur-md border border-white/30 p-10 rounded-3xl mb-12 max-w-2xl"
          >
            <p className="text-3xl text-white font-bold leading-relaxed mb-6">
              Silahkan bayar ke panitia sebesar <span className="text-yellow-400 text-4xl">Rp 1</span>
            </p>

            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setStep('template')}
              className="w-full bg-yellow-400 hover:bg-yellow-300 text-blue-900 border-2 border-yellow-200 px-12 py-6 rounded-2xl text-2xl font-black transition-all shadow-[0_0_30px_rgba(250,204,21,0.5)] cursor-pointer"
            >
              LANJUTKAN KE PILIH TEMPLATE ➔
            </motion.button>
          </motion.div>


          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setStep('payment')}
            className="flex items-center gap-3 bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/50 text-white px-12 py-4 rounded-full text-2xl font-bold transition-all shadow-lg"
          >
            <ArrowLeft size={28} />
            KEMBALI
          </motion.button>
        </div>
      )}

      {step === 'template' && (
        <div className="flex flex-col items-center w-full max-w-[90vw] z-10">
          <motion.h1 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-3xl sm:text-5xl font-black text-white mb-3 sm:mb-4 tracking-widest drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] text-center"
          >
            PILIH TEMPLATE KAMU
          </motion.h1>

          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 w-full max-h-[50vh] overflow-y-auto px-2 sm:px-4 mb-6 sm:mb-12 py-1">
            {availableTemplates.map((tpl, i) => (
              <TemplateCard
                key={tpl.id}
                tpl={tpl}
                index={i}
                isSelected={templateSelection === tpl.id}
                onSelect={setTemplateSelection}
              />
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 w-full justify-center max-w-md sm:max-w-none">
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={resetSelection}
              className="bg-white/10 border border-white/50 text-white px-10 sm:px-16 py-4 sm:py-6 rounded-full text-xl sm:text-2xl font-bold transition-all hover:bg-white/20 backdrop-blur-md text-center"
            >
              KEMBALI
            </motion.button>
            <motion.button 
              whileHover={isConnected && !isStarting ? { scale: 1.05 } : {}}
              whileTap={isConnected && !isStarting ? { scale: 0.95 } : {}}
              onClick={() => handleStartSession()}
              disabled={!isConnected || isStarting}
              className={`px-14 sm:px-20 py-6 rounded-full text-2xl font-bold transition-all backdrop-blur-md border ${
                isConnected && !isStarting
                  ? 'bg-yellow-400/90 text-blue-900 border-yellow-300 shadow-[0_0_30px_rgba(250,204,21,0.5)] hover:bg-yellow-300' 
                  : 'bg-white/10 text-white/50 border-white/20 cursor-not-allowed'
              }`}
            >
              {isStarting ? 'MEMULAI...' : isConnected ? 'LANJUTKAN ➔' : 'MENYAMBUNG...'}
            </motion.button>
          </div>
        </div>
      )}
    </main>
  );
}
