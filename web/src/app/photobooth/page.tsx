'use client';

import { useState, useEffect, useRef } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Banknote, ArrowLeft, Camera, Sparkles, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';

const WebcamMirror = ({ isCapturing }: { isCapturing?: boolean }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const selectedDeviceId = 'dslr';
  const [dslrFailed, setDslrFailed] = useState(false);
  const [streamKey, setStreamKey] = useState<number>(() => Date.now());
  const imgRef = useRef<HTMLImageElement>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up streaming connection when component unmounts to prevent socket exhaustion
  useEffect(() => {
    return () => {
      if (imgRef.current) {
        imgRef.current.src = '';
      }
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);



  // 2. Mulai streaming webcam laptop jika DSLR tidak dipilih
  useEffect(() => {
    if (selectedDeviceId === 'dslr') return;
    
    let stream: MediaStream | null = null;
    const startWebcam = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { deviceId: { exact: selectedDeviceId }, width: 1280, height: 720 } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing webcam:", err);
      }
    };
    startWebcam();
    
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, [selectedDeviceId]);

  return (
    <div className="w-full h-full relative overflow-hidden rounded-[3rem] border-[12px] border-white/20 shadow-[0_0_50px_rgba(255,255,255,0.2)] bg-black/40 backdrop-blur-sm group">
      
      {/* Tampilan Kamera */}
      {selectedDeviceId === 'dslr' && !dslrFailed ? (
        <img 
          ref={imgRef}
          key={streamKey}
          src={`/api/camera/live?t=${streamKey}`}
          alt="DSLR Live View Stream"
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => {
            console.warn("Koneksi stream DSLR terputus, mencoba menyambung ulang...");
            if (retryTimeoutRef.current) return;
            retryTimeoutRef.current = setTimeout(() => {
              retryTimeoutRef.current = null;
              setStreamKey(Date.now());
            }, 800);
          }}
        />
      ) : (
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" 
        />
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

export default function PhotoboothKiosk() {
  const { socket, isConnected, session, countdown, isCapturing, isProcessing, sessionError, capturedPhotos, resetSession } = useSocket();
  const [step, setStep] = useState<'welcome' | 'payment' | 'qris_payment' | 'cash_verification' | 'template'>('welcome');
  const [templateSelection, setTemplateSelection] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [isCompletedDismissed, setIsCompletedDismissed] = useState(false);
  const [finalImageError, setFinalImageError] = useState(false);
  const [templateOverlayError, setTemplateOverlayError] = useState(false);

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

  useEffect(() => {
    if (session && session.status === 'active') {
      setIsCompletedDismissed(false);
      setFinalImageError(false);
      setTemplateOverlayError(false);
    }
  }, [session]);

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
      setStep('cash_verification');
    } else {
      startQrisPayment();
    }
  };

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (accessCode.toUpperCase() === '12345') { // Hardcoded pin for panitia
      setStep('template');
      setAccessCode('');
    } else {
      alert('Kode Akses Salah!');
      setAccessCode('');
    }
  };

  const handleStartSession = () => {
    if (!socket || !templateSelection || isStarting) return;
    setIsStarting(true);
    socket.emit('session:start', { templateId: templateSelection });
    // Reset starting state after a timeout in case of failure without error broadcast
    setTimeout(() => setIsStarting(false), 2000);
  };

  const handlePrint = async () => {
    if (!session || (printStatus !== 'IDLE' && printStatus !== 'FAILED')) return;
    setPrintStatus('PENDING');
    try {
      const res = await fetch(`/api/print/${session.id}`, { method: 'POST' });
      if (!res.ok) throw new Error('Gagal menambah antrean');
      pollPrintStatus();
    } catch (e) {
      setPrintStatus('FAILED');
    }
  };

  const pollPrintStatus = () => {
    if (!session) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/print/${session.id}`);
        const data = await res.json();
        if (data.status) {
           setPrintStatus(data.status);
           if (data.status === 'COMPLETED' || data.status === 'FAILED') {
             clearInterval(interval);
           }
        }
      } catch (err) {
        clearInterval(interval);
      }
    }, 2000);
  };

  const resetSelection = () => {
    setIsCompletedDismissed(true);
    setFinalImageError(false);
    resetSession();
    setStep('welcome');
    setTemplateSelection(null);
    setPrintStatus('IDLE');
    setAccessCode('');
  };

  // Read environment variable for QR code base URL
  const publicBaseUrl = process.env.NEXT_PUBLIC_PHOTO_BASE_URL;

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
              className="absolute top-10 bg-red-600/90 backdrop-blur-sm text-white px-8 py-4 rounded-full text-2xl shadow-xl z-50 border-2 border-red-400"
            >
              {sessionError === 'CAMERA_NOT_READY' ? 'Kamera sedang sibuk, mohon tunggu sebentar...' : sessionError}
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
                style={{ top: '24.9%', left: '9.2%', width: '81.6%', height: '21.4%' }}
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
                style={{ top: '48.2%', left: '9.2%', width: '81.6%', height: '21.4%' }}
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
                style={{ top: '71.4%', left: '9.2%', width: '81.6%', height: '21.4%' }}
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
                  FOTO {currentPhotoIndex} DARI 3
                </span>
              </div>
            </div>

            {/* Countdown Overlay Melayang di Tengah Kamera */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-30">
              {countdown && (
                <div className="flex flex-col items-center">
                  <motion.h2 
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-5xl md:text-6xl font-black text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.9)] mb-2 tracking-widest font-sans"
                  >
                    BERSIAPLAH!
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
              )}

              {isProcessing && (
                <div className="bg-black/60 backdrop-blur-xl border border-white/20 px-12 py-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4 pointer-events-auto">
                  <div className="w-16 h-16 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-3xl font-black text-white tracking-widest">MEMPROSES STRIP FOTO...</span>
                  <span className="text-white/60 text-base">Sedang menggabungkan foto dengan template Anda</span>
                </div>
              )}
            </div>

            {/* White Flash Overlay inside the camera box */}
            <AnimatePresence>
              {isCapturing && (
                <motion.div 
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0 bg-white z-40 rounded-[3rem]"
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
    const activeBaseUrl = publicBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    const qrUrl = (activeBaseUrl && downloadToken) ? `${activeBaseUrl}/photo/${downloadToken}` : null;

    return (
      <main className="w-screen h-screen flex flex-col items-center justify-center overflow-hidden select-none relative font-sans">
        <Background />
        
        <div className="flex flex-row gap-16 items-center justify-center w-full max-w-[90vw] h-[85vh] z-10">
          
          {/* Photo Preview (2x6 proportion layout) */}
          <div className="h-full bg-white p-4 rounded-xl shadow-2xl transform -rotate-2">
            {!finalImageError ? (
              <img 
                src={`/api/image/${session.id}/final?t=${Date.now()}`} 
                alt="Hasil Foto" 
                className="h-full w-auto object-contain rounded border-2 border-slate-100 shadow-md"
                onError={() => setFinalImageError(true)}
              />
            ) : (
              <div className="h-full w-[250px] flex items-center justify-center text-slate-400 font-bold text-center p-8">
                Gagal memuat preview foto
              </div>
            )}
          </div>

          <div className="flex flex-col items-start max-w-2xl bg-white/20 p-12 rounded-[3rem] backdrop-blur-md border-4 border-white/50 shadow-2xl">
            <h1 className="text-7xl font-black text-yellow-300 mb-6 drop-shadow-lg">
              KEREN BANGET! 🎉
            </h1>
            
            {qrUrl ? (
              <div className="flex gap-8 mb-12 items-center bg-white/10 p-6 rounded-3xl border-2 border-white/30">
                <div className="bg-white p-4 rounded-2xl shadow-xl">
                  <QRCodeSVG value={qrUrl} size={150} level="M" />
                </div>
                <div>
                  <h3 className="text-3xl font-bold text-white mb-2">Scan untuk Download!</h3>
                  <p className="text-sky-100 text-lg leading-relaxed">
                    Arahkan kamera HP kamu ke QR Code ini untuk menyimpan hasil foto kamu (Gratis!). Tautan hanya berlaku 1 jam.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-3xl text-white font-bold mb-12 leading-relaxed">
                Foto kamu berhasil disimpan! (Fitur sinkronisasi QR Cloud sedang menunggu konfigurasi panitia).
              </p>
            )}

            <div className="flex gap-6 w-full mb-8">
              <button 
                onClick={handlePrint}
                disabled={printStatus !== 'IDLE' && printStatus !== 'FAILED'}
                className={`flex-1 border-4 px-8 py-6 rounded-3xl text-3xl font-black shadow-xl transition-all transform ${
                  printStatus === 'IDLE' || printStatus === 'FAILED'
                    ? 'bg-gradient-to-b from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 text-white border-emerald-300 hover:scale-105 active:scale-95'
                    : 'bg-slate-500/50 text-white border-slate-400 cursor-not-allowed opacity-80'
                }`}
              >
                {printStatus === 'IDLE' && '🖨️ CETAK FOTO (FISIK)'}
                {printStatus === 'PENDING' && '⏳ MENUNGGU PRINTER...'}
                {printStatus === 'PRINTING' && '🖨️ SEDANG MENCETAK...'}
                {printStatus === 'COMPLETED' && '✅ BERHASIL DICETAK'}
                {printStatus === 'FAILED' && '❌ GAGAL (COBA LAGI)'}
              </button>
            </div>

            <button 
              onClick={resetSelection}
              className="w-full bg-sky-500 hover:bg-sky-400 text-white border-4 border-sky-300 px-16 py-6 rounded-full text-4xl font-black shadow-[0_10px_30px_rgba(14,165,233,0.5)] transition-all transform hover:scale-105 active:scale-95"
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
        <div className="absolute top-6 right-6 bg-red-600/90 backdrop-blur-sm text-white px-6 py-3 rounded-full font-bold text-xl shadow-lg border-2 border-red-400 z-50">
          {sessionError}
        </div>
      )}

      {step === 'welcome' && (
        <div className="flex flex-col items-center z-10 w-full px-8 mt-16">
          <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 1 }}
            className="flex flex-col items-center mb-16"
          >
            <h1 className="text-9xl font-black text-white tracking-wide drop-shadow-[0_0_20px_rgba(255,255,255,0.8)]">
              SI FEST
            </h1>
            <h1 className="text-[10rem] leading-none font-black text-yellow-400 tracking-wide drop-shadow-[0_0_25px_rgba(250,204,21,0.8)] -mt-4">
              2026
            </h1>
          </motion.div>
          
          <motion.div 
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-4 bg-white/10 backdrop-blur-md border border-white/30 text-white px-10 py-3 rounded-full mb-16"
          >
            <span className="text-yellow-400">✦</span>
            <span className="text-2xl font-bold tracking-[0.2em]">PHOTOBOOTH EXPERIENCE</span>
            <span className="text-yellow-400">✦</span>
          </motion.div>
          
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleMulaiClick}
            className="bg-white/20 hover:bg-white/30 backdrop-blur-md border-2 border-white/50 text-white px-24 py-8 rounded-full text-4xl font-black shadow-[0_0_30px_rgba(255,255,255,0.3)] transition-all flex flex-col items-center"
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
            className="text-5xl font-black text-white mb-16 tracking-widest drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]"
          >
            PILIH METODE PEMBAYARAN
          </motion.h1>

          <div className="flex gap-12 mb-16">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handlePaymentSelect('qris')}
              className="flex flex-col items-center justify-center w-[350px] h-[350px] rounded-3xl border border-white/40 bg-white/10 backdrop-blur-md shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:bg-white/20 transition-all group"
            >
              <QrCode size={100} strokeWidth={1.5} className="text-white mb-8 group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] transition-all" />
              <span className="text-3xl font-bold text-white tracking-widest">SCAN QRIS</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handlePaymentSelect('cash')}
              className="flex flex-col items-center justify-center w-[350px] h-[350px] rounded-3xl border border-white/40 bg-white/10 backdrop-blur-md shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:bg-white/20 transition-all group"
            >
              <Banknote size={100} strokeWidth={1.5} className="text-white mb-8 group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] transition-all" />
              <span className="text-3xl font-bold text-white tracking-widest">CASH</span>
            </motion.button>
          </div>
          
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setStep('welcome')}
            className="flex items-center gap-3 bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/50 text-white px-12 py-4 rounded-full text-2xl font-bold transition-all shadow-lg"
          >
            <ArrowLeft size={28} />
            KEMBALI
          </motion.button>
        </div>
      )}

      {step === 'qris_payment' && (
        <div className="flex flex-col items-center w-full max-w-[90vw] z-10">
          <motion.h1 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-5xl font-black text-white mb-8 tracking-widest drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] flex items-center gap-4"
          >
            PEMBAYARAN DOKU / QRIS
          </motion.h1>

          <div className="bg-white/10 backdrop-blur-md border-2 border-white/40 p-10 rounded-[3rem] shadow-2xl flex flex-col md:flex-row items-center gap-10 max-w-4xl mb-10">
            {paymentLoading && (
              <div className="flex flex-col items-center justify-center p-16 w-full min-h-[350px]">
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
              <>
                <div className="bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center border-4 border-slate-100">
                  <QRCodeSVG value={paymentData.paymentUrl} size={250} level="M" />
                  <span className="text-slate-400 font-mono text-xs mt-3 tracking-wider">
                    {paymentData.invoiceNumber}
                  </span>
                </div>

                <div className="flex flex-col items-start text-left max-w-md">
                  <div className="inline-flex items-center gap-2 bg-yellow-400/20 border border-yellow-300/40 text-yellow-300 px-4 py-2 rounded-full font-bold text-lg mb-4">
                    <span>⚡ TOTAL PEMBAYARAN</span>
                  </div>
                  
                  <div className="text-5xl font-black text-yellow-400 mb-6 drop-shadow-md">
                    Rp {paymentData.amount.toLocaleString('id-ID')}
                  </div>

                  <div className="flex items-center gap-3 bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 px-4 py-2 rounded-xl mb-6">
                    <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="font-semibold text-lg">Menunggu Pembayaran (Otomatis)</span>
                  </div>

                  <p className="text-sky-100 text-lg leading-relaxed mb-6">
                    Scan QR ini dengan kamera HP / aplikasi <strong>m-Banking</strong> (BCA, Mandiri, BRI, BNI) atau <strong>E-Wallet</strong> (GoPay, OVO, Dana, ShopeePay).
                  </p>

                  <a 
                    href={paymentData.paymentUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sky-200 hover:text-white underline text-sm"
                  >
                    Buka halaman pembayaran DOKU <ExternalLink size={16} />
                  </a>
                </div>
              </>
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
            className="flex items-center gap-3 bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/50 text-white px-12 py-4 rounded-full text-2xl font-bold transition-all shadow-lg"
          >
            <ArrowLeft size={28} />
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
            <p className="text-3xl text-white font-bold leading-relaxed mb-8">
              Silahkan bayar ke panitia sebesar <span className="text-yellow-400 text-4xl">Rp 1</span>
            </p>
            <p className="text-xl text-white/80 mb-8">
              Panitia akan memasukkan kode akses di bawah ini untuk melanjutkan:
            </p>

            <form onSubmit={handleCodeSubmit} className="flex flex-col gap-6 items-center">
              <input 
                type="password" 
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="Kode Panitia"
                className="w-full bg-white/20 border-2 border-white/50 rounded-2xl px-8 py-6 text-center text-4xl text-white placeholder-white/50 focus:outline-none focus:border-yellow-400 focus:bg-white/30 transition-all"
                autoFocus
              />
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                type="submit"
                className="w-full bg-yellow-400 hover:bg-yellow-300 text-blue-900 border-2 border-yellow-200 px-12 py-6 rounded-2xl text-2xl font-black transition-all shadow-[0_0_30px_rgba(250,204,21,0.5)]"
              >
                VERIFIKASI
              </motion.button>
            </form>
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
            className="text-5xl font-black text-white mb-12 tracking-widest drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]"
          >
            PILIH TEMPLATE KAMU
          </motion.h1>
          
          <div className="grid grid-cols-4 gap-8 w-full mb-16 px-4">
            {[
              { id: 'y2k-dreamy', name: 'Y2K Dreamy', icon: '✨', file: '/templates/y2k-dreamy.png?v=2' },
              { id: 'classic', name: 'Classic', icon: '📸', file: '/templates/classic.png?v=2' },
              { id: 'futuristic', name: 'Futuristic', icon: '🚀', file: '/templates/futuristic.png?v=2' },
              { id: 'fun', name: 'Fun', icon: '🎈', file: '/templates/fun.png?v=2' },
            ].map((tpl, i) => (
              <TemplateCard
                key={tpl.id}
                tpl={tpl}
                index={i}
                isSelected={templateSelection === tpl.id}
                onSelect={setTemplateSelection}
              />
            ))}
          </div>

          <div className="flex gap-8 w-full justify-center">
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={resetSelection}
              className="bg-white/10 border border-white/50 text-white px-16 py-6 rounded-full text-2xl font-bold transition-all hover:bg-white/20 backdrop-blur-md"
            >
              KEMBALI
            </motion.button>
            <motion.button 
              whileHover={isConnected && !isStarting ? { scale: 1.05 } : {}}
              whileTap={isConnected && !isStarting ? { scale: 0.95 } : {}}
              onClick={handleStartSession}
              disabled={!isConnected || isStarting}
              className={`px-20 py-6 rounded-full text-2xl font-bold transition-all backdrop-blur-md border ${
                isConnected && !isStarting
                  ? 'bg-yellow-400/90 text-blue-900 border-yellow-300 shadow-[0_0_30px_rgba(250,204,21,0.5)] hover:bg-yellow-300' 
                  : 'bg-white/10 text-white/50 border-white/20 cursor-not-allowed'
              }`}
            >
              {isStarting ? 'MEMULAI...' : isConnected ? 'LANJUTKAN' : 'MENYAMBUNG...'}
            </motion.button>
          </div>
        </div>
      )}
    </main>
  );
}
