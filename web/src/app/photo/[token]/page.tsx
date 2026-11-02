import { uploadQueue } from '@/lib/upload-queue';
import { getSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase-server';
import path from 'path';
import fs from 'fs';
import AutoRefresh from './AutoRefresh';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getStorageDir() {
  if (process.env.STORAGE_PATH) {
    return path.resolve(process.cwd(), process.env.STORAGE_PATH);
  }
  const candidate1 = path.resolve(process.cwd(), '../storage');
  if (fs.existsSync(candidate1)) return candidate1;

  const candidate2 = path.resolve(process.cwd(), 'storage');
  if (fs.existsSync(candidate2)) return candidate2;

  let current = process.cwd();
  for (let i = 0; i < 3; i++) {
    const candidate = path.join(current, 'storage');
    if (fs.existsSync(candidate)) return candidate;
    current = path.dirname(current);
  }
  return path.resolve(process.cwd(), '../storage');
}

export default async function PhotoDownloadPage({ params }: { params: { token: string } }) {
  const job = uploadQueue.getJobByToken(params.token);

  if (!job) {
    return (
      <main className="w-full min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 font-sans">
        <h1 className="text-3xl font-bold text-red-400 mb-4">Tidak Ditemukan</h1>
        <p className="text-center text-slate-300">Tautan ini tidak valid atau foto sudah kadaluarsa.</p>
      </main>
    );
  }

  let downloadUrl = '';
  let previewUrl = '';

  // 1. Prioritaskan pengecekan file lokal (langsung dari laptop via tunnel — 100% instan dan tidak tergantung cloud)
  const absoluteStoragePath = getStorageDir();
  const localFinalPath = path.join(absoluteStoragePath, 'sessions', job.session_id, 'final', 'photobooth-final.jpg');
  const localPreviewPath = path.join(absoluteStoragePath, 'sessions', job.session_id, 'final', 'photobooth-preview.jpg');

  if (fs.existsSync(localFinalPath)) {
    downloadUrl = `/api/image/${job.session_id}/final`;
    previewUrl = fs.existsSync(localPreviewPath)
      ? `/api/image/${job.session_id}/preview`
      : `/api/image/${job.session_id}/final`;
  }

  // 2. Cadangan: jika lokal tidak ada dan Supabase cloud sudah selesai
  if (!downloadUrl && job.status === 'COMPLETED' && isSupabaseConfigured) {
    try {
      const supabase = getSupabaseServerClient();
      const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'photobooth';
      
      const { data: finalData, error: finalErr } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(`sessions/${job.session_id}/photobooth-final.jpg`, 60 * 60);
        
      const { data: prevData, error: prevErr } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(`sessions/${job.session_id}/photobooth-preview.jpg`, 60 * 60);

      if (!finalErr && finalData) downloadUrl = finalData.signedUrl;
      if (!prevErr && prevData) previewUrl = prevData.signedUrl;
    } catch (err) {
      console.error('Failed to generate signed URLs', err);
    }
  }

  return (
    <main className="w-full min-h-screen bg-gradient-to-br from-sky-400 via-sky-300 to-cyan-300 flex flex-col items-center p-4 sm:p-6 font-sans">
      {!downloadUrl && <AutoRefresh intervalMs={2000} />}

      <div className="w-full max-w-md bg-white/30 backdrop-blur-md border border-white/60 rounded-3xl p-6 sm:p-8 shadow-2xl mt-6 sm:mt-10 flex flex-col items-center text-center">
        <h1 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-100 drop-shadow-md mb-1">
          SI-FEST 2026
        </h1>
        <p className="text-sky-950 font-bold mb-6 text-sm sm:text-base">Memori Photobooth Kamu</p>

        {downloadUrl ? (
          <>
            {previewUrl && (
              <div className="w-full mb-6 relative group">
                <img 
                  src={previewUrl} 
                  alt="Preview Foto" 
                  className="w-full h-auto rounded-2xl shadow-xl border-4 border-white transform hover:scale-[1.01] transition-transform" 
                />
              </div>
            )}
            
            <a 
              href={downloadUrl} 
              download={`SI-FEST-2026-${job.session_id}.jpg`}
              className="w-full bg-gradient-to-b from-yellow-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 text-slate-900 font-black text-lg sm:text-xl py-3.5 sm:py-4 px-6 rounded-full shadow-[0_10px_20px_rgba(250,204,21,0.4)] transition-transform transform hover:scale-105 active:scale-95 text-center flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>📥 DOWNLOAD RESOLUSI TINGGI</span>
            </a>

            <div className="mt-4 p-3 bg-white/40 rounded-2xl border border-white/50 text-[11px] text-sky-950 leading-relaxed text-left w-full">
              💡 <strong>Tips Pengguna HP:</strong> Anda juga bisa menekan dan menahan (tahan lama) foto di atas, lalu pilih <strong>&quot;Simpan Gambar&quot;</strong> / <strong>&quot;Save to Photos&quot;</strong> untuk langsung menyimpan ke galeri.
            </div>

            <p className="text-xs text-sky-900 mt-4 opacity-80 font-mono">
              ID Sesi: {job.session_id}
            </p>
          </>
        ) : (
          <div className="py-10 flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-sky-100 border-t-yellow-400 rounded-full animate-spin mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">Sedang Menyiapkan Foto...</h2>
            <p className="text-sky-900 text-sm leading-relaxed max-w-xs">
              Foto kamu sedang diproses dalam resolusi tinggi. Halaman ini akan <b>otomatis ter-refresh</b> begitu foto selesai.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
