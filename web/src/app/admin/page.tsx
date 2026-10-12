'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  Upload, 
  Trash2, 
  CheckCircle2, 
  ExternalLink, 
  Camera, 
  Image as ImageIcon, 
  Lock, 
  RefreshCw, 
  Sparkles,
  Info
} from 'lucide-react';

interface TemplateItem {
  id: string;
  name: string;
  icon: string;
  hasCustom: boolean;
  url: string | null;
  updatedAt: string | null;
}

export default function AdminDashboard() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  // Check if PIN was already saved this session
  useEffect(() => {
    const savedPin = sessionStorage.getItem('sifest_admin_auth');
    if (savedPin === '12345') {
      setIsUnlocked(true);
    }
  }, []);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === '12345') {
      setIsUnlocked(true);
      sessionStorage.setItem('sifest_admin_auth', '12345');
      setPinError(false);
    } else {
      setPinError(true);
    }
  };

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/templates');
      const data = await res.json();
      if (data.success) {
        setTemplates(data.templates);
      }
    } catch (err) {
      console.error('Error fetching templates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isUnlocked) {
      fetchTemplates();
    }
  }, [isUnlocked]);

  const handleFileChange = async (templateId: string, file: File) => {
    setUploadingId(templateId);
    setMessage(null);

    const formData = new FormData();
    formData.append('templateId', templateId);
    formData.append('file', file);

    try {
      const res = await fetch('/api/admin/templates', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: data.message, type: 'success' });
        await fetchTemplates();
      } else {
        setMessage({ text: data.error || 'Gagal mengunggah template', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: 'Terjadi kesalahan saat upload', type: 'error' });
    } finally {
      setUploadingId(null);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm(`Reset template "${templateId}" kembali ke desain bawaan sistem?`)) return;

    try {
      const res = await fetch(`/api/admin/templates?templateId=${templateId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: data.message, type: 'success' });
        await fetchTemplates();
      }
    } catch (err) {
      alert('Gagal mereset template');
    }
  };

  if (!isUnlocked) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/40 via-slate-950 to-black -z-10" />

        <div className="w-full max-w-md bg-white/10 backdrop-blur-xl border border-white/20 p-8 rounded-3xl shadow-2xl flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-blue-500/20 border border-blue-400/40 rounded-full flex items-center justify-center text-blue-400 mb-6 shadow-inner">
            <Lock size={36} />
          </div>

          <h1 className="text-3xl font-black tracking-wide text-white mb-2">PANEL ADMIN</h1>
          <p className="text-blue-200/70 text-sm mb-8">
            Khusus Panitia SI-FEST 2026. Masukkan PIN panitia untuk mengelola template & sistem.
          </p>

          <form onSubmit={handleUnlock} className="w-full flex flex-col gap-4">
            <input 
              type="password"
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value);
                setPinError(false);
              }}
              placeholder="PIN Panitia (Default: 12345)"
              className="w-full bg-black/40 border border-white/30 rounded-2xl px-6 py-4 text-center text-2xl tracking-widest text-white placeholder-white/40 focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/30 transition-all"
              autoFocus
            />

            {pinError && (
              <p className="text-red-400 text-sm font-semibold">PIN salah! Gunakan PIN panitia yang benar.</p>
            )}

            <button
              type="submit"
              className="w-full bg-yellow-400 hover:bg-yellow-300 text-blue-950 font-black text-xl py-4 rounded-2xl shadow-lg transition-all mt-2 active:scale-95"
            >
              MASUK KE DASHBOARD
            </button>
          </form>

          <Link href="/photobooth" className="text-white/60 hover:text-white text-sm mt-6 flex items-center gap-1.5 transition-colors">
            Kembali ke Layar Kiosk Photobooth &rarr;
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full overflow-y-auto bg-slate-950 text-white p-6 md:p-12 pb-24 relative font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/30 via-slate-950 to-black -z-10" />

      {/* Top Header */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-8 border-b border-white/10">
        <div>
          <div className="flex items-center gap-3">
            <span className="bg-yellow-400 text-blue-950 text-xs font-black px-3 py-1 rounded-full uppercase tracking-widest">
              SI-FEST 2026
            </span>
            <span className="text-white/50 text-sm">Official Photobooth Management</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mt-1 flex items-center gap-3">
            <Sparkles className="text-yellow-400" /> Pengelola Template Foto
          </h1>
          <p className="text-white/60 text-sm mt-1">
            Unggah desain buatan panitia (Canva/Photoshop). Template yang diunggah langsung aktif di iPad & saat jepret foto.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={fetchTemplates}
            disabled={loading}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 px-4 py-3 rounded-2xl text-sm font-semibold transition-all"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Segarkan
          </button>

          <Link
            href="/photobooth"
            target="_blank"
            className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-blue-950 font-black px-6 py-3 rounded-2xl text-sm shadow-lg shadow-yellow-400/20 transition-all active:scale-95"
          >
            Buka Kiosk (iPad)
            <ExternalLink size={16} />
          </Link>
        </div>
      </header>

      {/* Alert Notification */}
      {message && (
        <div className="max-w-7xl mx-auto mt-6">
          <div className={`p-4 rounded-2xl border flex items-center justify-between ${
            message.type === 'success' 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}>
            <span className="font-semibold text-sm">{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-sm opacity-60 hover:opacity-100">&times;</button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto mt-10 grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Template Cards (3 Columns) */}
        <div className="lg:col-span-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {templates.map((tpl) => (
              <div 
                key={tpl.id}
                className="bg-white/5 border border-white/10 hover:border-white/20 rounded-3xl p-6 backdrop-blur-md flex flex-col justify-between transition-all"
              >
                {/* Header Card */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{tpl.icon}</span>
                    <div>
                      <h2 className="text-xl font-black text-white">{tpl.name}</h2>
                      <span className="text-xs text-white/50 font-mono">ID: {tpl.id}</span>
                    </div>
                  </div>

                  {tpl.hasCustom ? (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full">
                      <CheckCircle2 size={13} /> Kustom Aktif
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-white/50 bg-white/5 border border-white/10 px-3 py-1 rounded-full">
                      Bawaan Sistem
                    </span>
                  )}
                </div>

                {/* Preview Frame */}
                <div className="relative w-full h-80 bg-black/40 border border-white/10 rounded-2xl flex items-center justify-center overflow-hidden my-4 group">
                  {tpl.hasCustom && tpl.url ? (
                    <div className="w-full h-full flex items-center justify-center p-3 relative">
                      <img 
                        src={tpl.url} 
                        alt={tpl.name} 
                        className="max-h-full max-w-full object-contain rounded-lg drop-shadow-2xl" 
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 p-4">
                        <a 
                          href={tpl.url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-4 py-2 rounded-xl backdrop-blur-md"
                        >
                          Lihat Ukuran Asli
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center p-6 text-white/40">
                      <ImageIcon size={48} className="mb-3 opacity-40" />
                      <p className="text-sm font-semibold">Menggunakan Desain Bawaan</p>
                      <p className="text-xs text-white/30 mt-1">Belum ada file kustom yang diunggah</p>
                    </div>
                  )}

                  {uploadingId === tpl.id && (
                    <div className="absolute inset-0 bg-blue-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-20">
                      <RefreshCw size={36} className="text-yellow-400 animate-spin" />
                      <span className="text-sm font-bold text-white">Mengunggah Template...</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3 mt-2">
                  <input 
                    type="file" 
                    accept="image/png,image/jpeg"
                    className="hidden" 
                    ref={(el) => { fileInputRefs.current[tpl.id] = el; }}
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        handleFileChange(tpl.id, e.target.files[0]);
                      }
                    }}
                  />

                  <button
                    onClick={() => fileInputRefs.current[tpl.id]?.click()}
                    disabled={uploadingId === tpl.id}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-md active:scale-95"
                  >
                    <Upload size={16} />
                    {tpl.hasCustom ? 'Ganti Desain' : 'Upload Desain'}
                  </button>

                  {tpl.hasCustom && (
                    <button
                      onClick={() => handleDelete(tpl.id)}
                      disabled={uploadingId === tpl.id}
                      className="p-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 hover:text-red-300 border border-red-500/30 rounded-xl transition-all"
                      title="Reset ke desain bawaan"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar Info & Design Guide (1 Column) */}
        <div className="space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
            <h3 className="text-lg font-black text-white flex items-center gap-2 mb-4">
              <Info className="text-yellow-400" size={20} /> Panduan Desain Template
            </h3>

            <p className="text-xs text-white/70 leading-relaxed mb-4">
              Bagikan panduan ini ke tim desain (PDD) untuk dibuat di <b>Canva</b> atau <b>Photoshop</b>:
            </p>

            <div className="space-y-3 text-xs">
              <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                <span className="text-white/50 block font-semibold">Ukuran Lembar:</span>
                <span className="text-yellow-300 font-mono font-bold text-sm">600 x 1800 px</span>
                <span className="text-white/40 block text-[11px] mt-0.5">(Rasio 1:3 strip 2x6 inci pada 300 DPI)</span>
              </div>

              <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                <span className="text-white/50 block font-semibold">Format Terbaik:</span>
                <span className="text-emerald-400 font-bold">PNG Transparan</span>
                <span className="text-white/40 block text-[11px] mt-0.5">
                  Bagian 3 kotak foto dibiarkan <b>bolong / transparan</b> agar foto otomatis masuk pas di bawah frame.
                </span>
              </div>

              <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                <span className="text-white/50 block font-semibold">Ukuran 3 Lubang Foto:</span>
                <span className="text-white font-mono font-bold">500 x 333 px</span>
                <span className="text-white/50 block font-semibold mt-2">Posisi Vertikal (Y):</span>
                <ul className="list-disc list-inside text-white/70 font-mono text-[11px] mt-1 space-y-0.5">
                  <li>Foto 1: Y = 250 px</li>
                  <li>Foto 2: Y = 633 px</li>
                  <li>Foto 3: Y = 1016 px</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-blue-900/20 border border-blue-500/20 rounded-3xl p-6 backdrop-blur-md">
            <h3 className="text-sm font-bold text-blue-300 flex items-center gap-2 mb-2">
              <Camera size={18} /> Alur Kerja Kiosk
            </h3>
            <p className="text-xs text-blue-200/70 leading-relaxed">
              Setelah template di-upload di sini, panitia tidak perlu restart server. Desain baru akan langsung otomatis muncul di iPad konsumen!
            </p>
          </div>
        </div>

      </div>
    </main>
  );
}
