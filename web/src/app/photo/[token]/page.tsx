import { uploadQueue } from '@/lib/upload-queue';
import { getSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase-server';

export default async function PhotoDownloadPage({ params }: { params: { token: string } }) {
  const job = uploadQueue.getJobByToken(params.token);

  if (!job) {
    return (
      <main className="w-full min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6">
        <h1 className="text-3xl font-bold text-red-400 mb-4">Tidak Ditemukan</h1>
        <p className="text-center text-slate-300">Tautan ini tidak valid atau foto sudah kadaluarsa.</p>
      </main>
    );
  }

  let downloadUrl = '';
  let previewUrl = '';
  
  if (job.status === 'COMPLETED' && isSupabaseConfigured) {
    try {
      const supabase = getSupabaseServerClient();
      const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'photobooth';
      
      const { data: finalData, error: finalErr } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(`sessions/${job.session_id}/photobooth-final.jpg`, 60 * 60); // 1 hour valid
        
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
    <main className="w-full min-h-screen bg-gradient-to-br from-sky-400 via-sky-300 to-cyan-300 flex flex-col items-center p-6 font-sans">
      <div className="w-full max-w-md bg-white/20 backdrop-blur-md border border-white/50 rounded-3xl p-8 shadow-2xl mt-12 flex flex-col items-center text-center">
        
        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-100 drop-shadow-md mb-2">
          SI-FEST 2026
        </h1>
        <p className="text-sky-900 font-bold mb-8">Memori Photobooth Kamu</p>

        {job.status === 'COMPLETED' && downloadUrl ? (
          <>
            {previewUrl && (
              <img 
                src={previewUrl} 
                alt="Preview" 
                className="w-full h-auto rounded-xl shadow-lg border-4 border-white mb-8 transform -rotate-2" 
              />
            )}
            
            <a 
              href={downloadUrl} 
              download="SI-FEST-2026-Photobooth.jpg"
              className="w-full bg-gradient-to-b from-yellow-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 text-slate-900 font-black text-xl py-4 rounded-full shadow-[0_10px_20px_rgba(250,204,21,0.4)] transition-transform transform hover:scale-105 active:scale-95 text-center"
            >
              DOWNLOAD RESOLUSI TINGGI
            </a>
            <p className="text-sm text-sky-800 mt-6 opacity-70">
              Tautan ini kadaluarsa dalam 1 jam demi keamanan.
            </p>
          </>
        ) : (
          <div className="py-12 flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-sky-100 border-t-yellow-400 rounded-full animate-spin mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">Sedang Diunggah...</h2>
            <p className="text-sky-800">
              Foto kamu sedang dalam perjalanan ke cloud. 
              Silakan <b>refresh halaman ini</b> sebentar lagi.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
