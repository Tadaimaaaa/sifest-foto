'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  Upload, 
  Trash2, 
  ExternalLink, 
  RefreshCw, 
  Plus,
  X,
  Eye,
  FileText,
  Info,
  Lock,
  Layers,
  Scissors,
  Sparkles
} from 'lucide-react';

interface TemplateItem {
  id: string;
  name: string;
  icon: string;
  isBuiltin?: boolean;
  hasCustom: boolean;
  url: string | null;
  updatedAt: string | null;
}

const PRESET_ICONS = ['✨', '📸', '🚀', '🎈', '🎨', '🌟', '🎞️', '🌸', '⚡', '👑'];

export default function AdminDashboard() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Add Template Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('✨');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newFilePreview, setNewFilePreview] = useState<string | null>(null);
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const newFileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleAutoPunch = async (templateId: string) => {
    setUploadingId(templateId);
    setMessage(null);

    const formData = new FormData();
    formData.append('action', 'punch');
    formData.append('templateId', templateId);

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
        setMessage({ text: data.error || 'Gagal melubangi template', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: 'Terjadi kesalahan saat melubangi template', type: 'error' });
    } finally {
      setUploadingId(null);
    }
  };

  const handleNewFileSelect = (file: File) => {
    setNewFile(file);
    const objectUrl = URL.createObjectURL(file);
    setNewFilePreview(objectUrl);
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      alert('Mohon masukkan nama template');
      return;
    }
    if (!newFile) {
      alert('Mohon pilih file desain template (PNG / JPG)');
      return;
    }

    setIsSubmittingNew(true);
    setMessage(null);

    const formData = new FormData();
    formData.append('action', 'create');
    formData.append('name', newName.trim());
    formData.append('icon', newIcon.trim() || '🎨');
    formData.append('file', newFile);

    try {
      const res = await fetch('/api/admin/templates', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: data.message, type: 'success' });
        setShowAddModal(false);
        setNewName('');
        setNewIcon('✨');
        setNewFile(null);
        if (newFilePreview) URL.revokeObjectURL(newFilePreview);
        setNewFilePreview(null);
        await fetchTemplates();
      } else {
        alert(data.error || 'Gagal menambahkan template baru');
      }
    } catch (err) {
      alert('Terjadi kesalahan saat menambahkan template');
    } finally {
      setIsSubmittingNew(false);
    }
  };

  const handleDelete = async (tpl: TemplateItem) => {
    const isCustom = !tpl.isBuiltin;
    const confirmMsg = isCustom
      ? `Hapus template "${tpl.name}" secara permanen? Template ini tidak akan muncul lagi di kiosk photobooth.`
      : `Reset file desain "${tpl.name}" kembali ke desain bawaan sistem?`;

    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/admin/templates?templateId=${tpl.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: data.message, type: 'success' });
        await fetchTemplates();
      } else {
        setMessage({ text: data.error || 'Gagal menghapus template', type: 'error' });
      }
    } catch (err) {
      alert('Gagal memproses penghapusan template');
    }
  };

  // PIN Lock Screen
  if (!isUnlocked) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 p-8 rounded-xl shadow-2xl flex flex-col items-center text-center">
          <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700/80 flex items-center justify-center text-zinc-300 mb-5">
            <Lock size={18} />
          </div>

          <h1 className="text-base font-semibold text-zinc-100">SI-FEST Admin Access</h1>
          <p className="text-xs text-zinc-400 mt-1 mb-6">
            Masukkan PIN panitia untuk mengakses pengelola template
          </p>

          <form onSubmit={handleUnlock} className="w-full space-y-3">
            <input 
              type="password" 
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value);
                setPinError(false);
              }}
              placeholder="PIN (Default: 12345)"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-center text-sm font-mono tracking-widest text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
              autoFocus
            />

            {pinError && (
              <p className="text-red-400 text-xs font-medium">PIN tidak sesuai. Silahkan coba lagi.</p>
            )}

            <button
              type="submit"
              className="w-full bg-white hover:bg-zinc-200 text-zinc-950 font-medium text-xs py-2.5 rounded-lg shadow-sm transition-colors"
            >
              Buka Dashboard
            </button>
          </form>

          <Link href="/photobooth" className="text-zinc-500 hover:text-zinc-300 text-xs mt-6 transition-colors">
            Kembali ke Kiosk Photobooth &rarr;
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      {/* Top Navbar */}
      <nav className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 text-xs font-bold font-mono">
              SI
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-400 font-medium">SI-FEST 2026</span>
              <span className="text-zinc-700">/</span>
              <span className="text-zinc-200 font-medium">Template Manager</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchTemplates}
              disabled={loading}
              className="text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            <Link
              href="/photobooth"
              target="_blank"
              className="text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <span>Kiosk</span>
              <ExternalLink size={12} />
            </Link>

            <button
              onClick={() => setShowAddModal(true)}
              className="text-xs font-medium text-zinc-950 bg-white hover:bg-zinc-200 px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Plus size={14} />
              <span>Tambah Template</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Body */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Title Bar */}
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-zinc-900 pb-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
              Template Strip Photobooth
            </h1>
            <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
              Kelola desain frame foto strip 2x6 inci. Template yang diunggah akan otomatis tersinkronisasi ke kiosk iPad tanpa perlu restart server.
            </p>
          </div>
          <div className="text-xs font-mono text-zinc-500 bg-zinc-900/60 border border-zinc-800/80 px-3 py-1.5 rounded-lg w-fit">
            {templates.length} template aktif
          </div>
        </div>

        {/* Alert Notification */}
        {message && (
          <div className="mb-6">
            <div className={`px-4 py-3 rounded-lg border text-xs flex items-center justify-between ${
              message.type === 'success' 
                ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300' 
                : 'bg-red-950/40 border-red-800/50 text-red-300'
            }`}>
              <span className="font-medium">{message.text}</span>
              <button onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100 ml-4">&times;</button>
            </div>
          </div>
        )}

        {/* Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Template Cards (3 Columns) */}
          <div className="lg:col-span-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {templates.map((tpl) => (
                <div 
                  key={tpl.id}
                  className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl overflow-hidden flex flex-col hover:border-zinc-700/80 transition-all"
                >
                  {/* Card Header */}
                  <div className="px-4 py-3 border-b border-zinc-800/60 flex items-center justify-between bg-zinc-900/40">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-base shrink-0">{tpl.icon}</span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-zinc-200 truncate">{tpl.name}</h3>
                        <span className="text-[11px] font-mono text-zinc-500 block truncate">{tpl.id}</span>
                      </div>
                    </div>

                    <div>
                      {!tpl.isBuiltin ? (
                        <span className="inline-flex items-center text-[11px] font-medium text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                          Kustom
                        </span>
                      ) : tpl.hasCustom ? (
                        <span className="inline-flex items-center text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                          Kustom Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[11px] font-medium text-zinc-400 bg-zinc-800/80 border border-zinc-700/50 px-2 py-0.5 rounded-md">
                          Bawaan
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Preview Frame */}
                  <div className="relative p-6 flex items-center justify-center bg-zinc-950/70 h-80 overflow-hidden group">
                    {/* Subtle transparency checkerboard */}
                    <div 
                      className="absolute inset-0 opacity-[0.03] pointer-events-none"
                      style={{
                        backgroundImage: `linear-gradient(45deg, #fff 25%, transparent 25%), linear-gradient(-45deg, #fff 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #fff 75%), linear-gradient(-45deg, transparent 75%, #fff 75%)`,
                        backgroundSize: '16px 16px',
                        backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px'
                      }}
                    />

                    {tpl.hasCustom && tpl.url ? (
                      <div className="relative h-full flex items-center justify-center">
                        <img 
                          src={tpl.url} 
                          alt={tpl.name} 
                          className="max-h-full w-auto object-contain rounded shadow-lg border border-zinc-800/80"
                        />
                        <div className="absolute inset-0 bg-zinc-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded">
                          <a
                            href={tpl.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-md border border-zinc-700 flex items-center gap-1.5 transition-colors shadow-sm"
                          >
                            <Eye size={13} />
                            <span>Lihat Asli</span>
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-center p-4 text-zinc-600">
                        <FileText size={32} className="mb-2 opacity-40" />
                        <p className="text-xs font-medium text-zinc-400">File Frame Bawaan</p>
                        <p className="text-[11px] text-zinc-600 mt-0.5">Belum ada file kustom yang diunggah</p>
                      </div>
                    )}

                    {uploadingId === tpl.id && (
                      <div className="absolute inset-0 bg-zinc-950/85 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-10">
                        <RefreshCw size={20} className="text-zinc-200 animate-spin" />
                        <span className="text-xs text-zinc-300 font-medium">Mengunggah berkas...</span>
                      </div>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div className="p-3 border-t border-zinc-800/60 bg-zinc-900/40 flex items-center gap-2">
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
                      className="flex-1 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700/80 border border-zinc-700/60 py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Upload size={13} />
                      <span>{tpl.hasCustom ? 'Ganti Desain' : 'Upload Desain'}</span>
                    </button>

                    {tpl.hasCustom && (
                      <button
                        onClick={() => handleAutoPunch(tpl.id)}
                        disabled={uploadingId === tpl.id}
                        className="text-xs font-medium text-amber-300 hover:text-amber-200 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-800/60 py-2 px-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                        title="Otomatis standarkan ke 1200x3600 & lubangi 3 kotak foto transparan"
                      >
                        <Scissors size={13} />
                        <span>Lubangi</span>
                      </button>
                    )}

                    {(!tpl.isBuiltin || tpl.hasCustom) && (
                      <button
                        onClick={() => handleDelete(tpl)}
                        disabled={uploadingId === tpl.id}
                        className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 rounded-lg transition-colors"
                        title={!tpl.isBuiltin ? 'Hapus template ini secara permanen' : 'Reset ke desain bawaan sistem'}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar Specs Guide (1 Column) */}
          <div className="space-y-5">
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-zinc-800/60">
                <FileText size={16} className="text-zinc-400" />
                <h3 className="text-sm font-semibold text-zinc-200">Panduan Desain Frame</h3>
              </div>

              <div className="space-y-3.5 text-xs">
                <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-lg p-3 text-emerald-300">
                  <p className="font-semibold mb-1 flex items-center gap-1.5 text-emerald-300">
                    <Sparkles size={14} /> Otomatis Standar & Lubang Bolong
                  </p>
                  <p className="text-[11px] text-emerald-400/90 leading-relaxed">
                    Apapun desain template yang Anda masukkan (dari Canva, Photoshop, JPG maupun PNG ukuran berapa saja), sistem akan <strong>langsung mengubahnya ke ukuran standar 1200 × 3600 px</strong> dan <strong>3 kotak foto langsung dilubangi transparan</strong> secara otomatis!
                  </p>
                </div>

                <div>
                  <span className="text-zinc-500 block mb-1">Ukuran Standar Cetak Ultra-HD</span>
                  <div className="font-mono text-zinc-200 bg-zinc-950 px-2.5 py-1.5 rounded border border-zinc-800 flex items-center justify-between">
                    <span>1200 × 3600 px</span>
                    <span className="text-[10px] text-emerald-400">Rasio 1:3 • 600 DPI</span>
                  </div>
                </div>

                <div>
                  <span className="text-zinc-500 block mb-1">Format Berkas Diterima</span>
                  <div className="text-zinc-200 bg-zinc-950 px-2.5 py-1.5 rounded border border-zinc-800 flex items-center justify-between">
                    <span className="font-medium text-emerald-400">PNG / JPG (Bebas)</span>
                    <span className="text-[10px] font-mono text-zinc-500">Auto-convert</span>
                  </div>
                </div>

                <div>
                  <span className="text-zinc-500 block mb-1">Ukuran 3 Lubang Foto (Otomatis)</span>
                  <div className="font-mono text-zinc-200 bg-zinc-950 px-2.5 py-1.5 rounded border border-zinc-800">
                    960 × 750 px (Radius 28px)
                  </div>
                </div>

                <div>
                  <span className="text-zinc-500 block mb-1">Posisi Vertikal 3 Lubang (Otomatis):</span>
                  <div className="font-mono text-[11px] text-zinc-400 bg-zinc-950 p-2.5 rounded border border-zinc-800 space-y-1">
                    <div className="flex justify-between"><span>Slot 1 (Atas)</span><span className="text-zinc-200">Y: 908 px</span></div>
                    <div className="flex justify-between"><span>Slot 2 (Tengah)</span><span className="text-zinc-200">Y: 1746 px</span></div>
                    <div className="flex justify-between"><span>Slot 3 (Bawah)</span><span className="text-zinc-200">Y: 2582 px</span></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-4 text-xs text-zinc-400 space-y-2">
              <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
                <Info size={13} />
                <span>Catatan Teknis</span>
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                Biarkan 3 kotak foto dalam kondisi <b>transparan/bolong</b> di Canva atau Photoshop agar foto konsumen otomatis masuk tepat di bawah frame.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Tambah Template Baru */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">Tambah Template Baru</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Tambahkan frame kustom baru ke photobooth</p>
              </div>
              <button 
                onClick={() => {
                  setShowAddModal(false);
                  if (newFilePreview) URL.revokeObjectURL(newFilePreview);
                  setNewFilePreview(null);
                  setNewFile(null);
                }}
                className="text-zinc-400 hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateTemplate} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Nama Template
                </label>
                <input 
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="misal: Retro Vintage, Neon Cyber, Cute Pastel"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Ikon / Simbol
                </label>
                <div className="flex items-center gap-2">
                  <input 
                    type="text"
                    value={newIcon}
                    onChange={(e) => setNewIcon(e.target.value)}
                    maxLength={4}
                    className="w-12 text-center bg-zinc-950 border border-zinc-800 rounded-lg py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600"
                  />
                  <div className="flex flex-wrap gap-1">
                    {PRESET_ICONS.map((emoji) => (
                      <button
                        type="button"
                        key={emoji}
                        onClick={() => setNewIcon(emoji)}
                        className={`w-7 h-7 text-xs rounded-md border flex items-center justify-center transition-colors ${
                          newIcon === emoji 
                            ? 'bg-zinc-800 border-zinc-600 text-white' 
                            : 'bg-zinc-950 border-zinc-800/80 text-zinc-400 hover:bg-zinc-800/60'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Berkas Desain Frame (PNG Transparan / JPG)
                </label>

                <input 
                  type="file"
                  accept="image/png,image/jpeg"
                  ref={newFileInputRef}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      handleNewFileSelect(e.target.files[0]);
                    }
                  }}
                />

                {!newFilePreview ? (
                  <div 
                    onClick={() => newFileInputRef.current?.click()}
                    className="border border-dashed border-zinc-700 hover:border-zinc-500 rounded-lg p-5 flex flex-col items-center justify-center text-center cursor-pointer bg-zinc-950/50 hover:bg-zinc-950 transition-colors"
                  >
                    <Upload size={20} className="text-zinc-400 mb-1.5" />
                    <span className="text-xs font-medium text-zinc-200">Klik untuk memilih berkas desain frame</span>
                    <span className="text-[11px] text-amber-400 mt-1 font-medium">✨ Otomatis diubah ke 1200 × 3600 px & 3 lubang foto langsung bolong!</span>
                    <span className="text-[10px] text-zinc-500 mt-0.5">Bisa JPG/PNG langsung dari Canva atau Photoshop</span>
                  </div>
                ) : (
                  <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-12 bg-zinc-900 border border-zinc-800 rounded flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                        <img src={newFilePreview} alt="Preview" className="max-h-full max-w-full object-contain" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-zinc-200 truncate">{newFile?.name}</p>
                        <span className="text-[11px] text-zinc-500">{(newFile!.size / 1024).toFixed(0)} KB</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => newFileInputRef.current?.click()}
                      className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded transition-colors shrink-0"
                    >
                      Ganti
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="text-xs font-medium text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNew || !newName.trim() || !newFile}
                  className="text-xs font-medium bg-white hover:bg-zinc-200 disabled:bg-zinc-800 text-zinc-950 disabled:text-zinc-500 px-3.5 py-1.5 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:cursor-not-allowed"
                >
                  {isSubmittingNew && <RefreshCw size={12} className="animate-spin" />}
                  <span>{isSubmittingNew ? 'Menyimpan...' : 'Simpan Template'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
