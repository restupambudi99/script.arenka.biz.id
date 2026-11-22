import { useEffect, useMemo, useRef, useState } from 'react';
import './storyboard-studio.css';

type Scene = { id: string; title: string; duration: string; script: string; action: string; visual: string; flow: string; continuityIn: string; continuityOut: string; image?: string; referenceImage?: string };
type Project = { id: string; title: string; brief: string; ratio: string; script: string; scenes: Scene[]; updatedAt: string; style?: string; character?: string; product?: string; characterImage?: string; productImage?: string };
const KEY = 'arenka-storyboard-project-v1';
const makeScene = (index: number, script = ''): Scene => ({ id: `scene-${index + 1}-${crypto.randomUUID()}`, title: `Scene ${index + 1}`, duration: '5 dtk', script, action: '', visual: '', flow: '', continuityIn: '', continuityOut: '' });
const initial: Project = { id: '', title: 'Proyek storyboard baru', brief: '', ratio: '9:16', script: '', scenes: [{ id: 'scene-1', title: 'Scene 1', duration: '5 dtk', script: '', action: '', visual: '', flow: '', continuityIn: '', continuityOut: '' }], updatedAt: new Date().toISOString() };
const cloudProject = (project: Project) => ({ ...project, scenes: project.scenes.map(item => {
  const cloudScene = { ...item };
  if (cloudScene.image?.startsWith('data:')) delete cloudScene.image;
  if (cloudScene.referenceImage?.startsWith('data:')) delete cloudScene.referenceImage;
  return cloudScene;
}), characterImage: project.characterImage?.startsWith('data:') ? undefined : project.characterImage, productImage: project.productImage?.startsWith('data:') ? undefined : project.productImage });

function parseScript(text: string): Scene[] {
  const chunks = text.split(/(?=^(?:scene|adegan|shot)\s*\d+\b)/gim).map(part => part.trim()).filter(Boolean);
  const parsed = chunks.map((chunk, index) => {
    const lines = chunk.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const heading = lines[0]?.match(/^(?:scene|adegan|shot)\s*\d+\s*[:—-]?\s*(.*)$/i);
    const script = lines.slice(heading ? 1 : 0).join('\n').replace(/^(?:dialog(?:ue)?|narasi|voice.?over|aksi|visual)\s*:\s*/gim, '').trim();
    return { ...makeScene(index, script || chunk), title: heading?.[1] || `Scene ${index + 1}` };
  });
  return parsed.length ? parsed : [makeScene(0, text.trim())];
}

export default function StoryboardStudio() {
  const [project, setProject] = useState<Project>(initial);
  const [active, setActive] = useState(0);
  const [notice, setNotice] = useState('');
  const [importText, setImportText] = useState('');
  const [tab, setTab] = useState<'scene' | 'script' | 'flow'>('scene');
  const [view, setView] = useState<'board' | 'edit'>('board');
  const [saved, setSaved] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploadingReference, setUploadingReference] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [syncState, setSyncState] = useState('Menghubungkan…');
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const scene = project.scenes[active] ?? project.scenes[0];

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let local = initial;
      let hasLocalProject = false;
      try {
        const stored = localStorage.getItem(KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<Project>;
          local = { ...initial, ...parsed, id: parsed.id || crypto.randomUUID() };
          hasLocalProject = true;
        }
      } catch { setNotice('Proyek lokal tidak dapat dibaca.'); }
      if (!local.id) local = { ...local, id: crypto.randomUUID() };
      if (cancelled) return;
      setProject(local);
      try {
        if (!hasLocalProject) {
          const listResponse = await fetch('/api/studio/projects', { credentials: 'same-origin' });
          if (listResponse.ok) {
            const list = await listResponse.json() as { projects: Array<{ id: string }> };
            if (list.projects[0]?.id) local = { ...local, id: list.projects[0].id };
            else setSyncState('Proyek baru · siap disimpan ke D1');
          } else if (listResponse.status === 401) setSyncState('Masuk sebagai editor untuk sinkronisasi');
          else if (listResponse.status === 403) setSyncState('Akses editor diperlukan untuk sinkronisasi');
        }
        const response = await fetch(`/api/studio/projects/${local.id}`, { credentials: 'same-origin' });
        if (response.ok) {
          const payload = await response.json() as { project: Project };
          const cloud = payload.project;
          const merged = { ...local, ...cloud, scenes: cloud.scenes.map((item, index) => ({ ...item, image: item.image || local.scenes[index]?.image, referenceImage: item.referenceImage || local.scenes[index]?.referenceImage })) };
          if (!cancelled) { setProject(merged); setSyncState('Tersinkron dengan D1'); }
        } else if (response.status === 404) setSyncState('Proyek baru · siap disimpan ke D1');
        else if (response.status === 401) setSyncState('Masuk sebagai editor untuk sinkronisasi');
        else if (response.status === 403) setSyncState('Akses editor diperlukan untuk sinkronisasi');
        else setSyncState('Penyimpanan cloud belum siap');
      } catch { setSyncState('Offline · tersimpan di browser ini'); }
      if (!cancelled) setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!hydrated || !project.id) return;
    const timer = window.setTimeout(() => {
      const updated = { ...project, updatedAt: new Date().toISOString() };
      try { localStorage.setItem(KEY, JSON.stringify(updated)); setSaved(true); }
      catch { setSaved(false); setNotice('Penyimpanan browser penuh. Ekspor proyek sebagai cadangan.'); }
      saveQueue.current = saveQueue.current.then(async () => {
        try {
          const response = await fetch(`/api/studio/projects/${updated.id}`, {
            method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cloudProject(updated)),
          });
          if (response.ok) setSyncState('Tersinkron dengan D1');
          else if (response.status === 401) setSyncState('Masuk sebagai editor untuk sinkronisasi');
          else if (response.status === 403) setSyncState('Akses editor diperlukan untuk sinkronisasi');
          else if (response.status === 503) setSyncState('Migrasi D1 perlu diterapkan');
          else setSyncState('Sinkronisasi gagal · data lokal aman');
        } catch { setSyncState('Offline · tersimpan di browser ini'); }
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [project, hydrated]);
  const flowPrompt = useMemo(() => [
    `Buat video vertikal ${project.ratio}, durasi sekitar ${scene.duration}.`,
    project.brief && `KONTEKS PROYEK: ${project.brief}`,
    project.character && `KUNCI IDENTITAS KARAKTER: ${project.character}`,
    project.product && `KUNCI PRODUK DAN GAYA VISUAL: ${project.product}`,
    project.characterImage && 'Lampirkan gambar referensi karakter sebagai acuan identitas utama.',
    project.productImage && 'Lampirkan gambar referensi produk sebagai acuan bentuk dan kemasan.',
    `SCENE: ${scene.title}`,
    scene.script && `NASKAH / DIALOG: ${scene.script}`,
    scene.action && `AKSI: ${scene.action}`,
    scene.visual && `VISUAL DAN KAMERA: ${scene.visual}`,
    scene.continuityIn && `KONDISI AWAL: ${scene.continuityIn}`,
    scene.continuityOut && `KONDISI AKHIR UNTUK SAMBUNGAN: ${scene.continuityOut}`,
    'Pertahankan identitas karakter dan bentuk produk sesuai gambar referensi yang diunggah. Gerakan alami, satu aksi utama yang jelas, jangan menambahkan teks atau logo baru.'
  ].filter(Boolean).join('\n\n'), [project, scene]);

  function updateSceneById(sceneId: string, patch: Partial<Scene>) { setProject(value => ({ ...value, scenes: value.scenes.map(item => item.id === sceneId ? { ...item, ...patch } : item) })); }
  function updateScene(patch: Partial<Scene>) { if (scene) updateSceneById(scene.id, patch); }
  function updateProject(patch: Partial<Project>) { setProject(value => ({ ...value, ...patch })); }
  function importScript() { if (!importText.trim()) return; const scenes = parseScript(importText); setProject(value => ({ ...value, script: importText.trim(), scenes })); setActive(0); setImportText(''); setNotice(`${scenes.length} scene diimpor. Periksa dan lengkapi detail tiap scene.`); }
  function addScene() { const next = [...project.scenes, makeScene(project.scenes.length)]; setProject(value => ({ ...value, scenes: next })); setActive(next.length - 1); setTab('scene'); }
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setNotice('Teks disalin.'); } catch { setNotice('Clipboard tidak tersedia; pilih teks lalu salin manual.'); } }
  function download(name: string, type: string, data: string) { const url = URL.createObjectURL(new Blob([data], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function exportProject() { download('arenka-storyboard-project.json', 'application/json', JSON.stringify(project, null, 2)); }
  function exportPrompts() { download('arenka-flow-prompts.txt', 'text/plain;charset=utf-8', project.scenes.map(item => `## ${item.title}\n${flowPromptFor(project, item)}`).join('\n\n---\n\n')); }
  async function handleImage(file?: File, sceneId = scene?.id) {
    if (!file) return;
    if (!sceneId) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setNotice('Pilih gambar JPEG, PNG, atau WebP.'); return; }
    if (file.size > 8 * 1024 * 1024) { setNotice('Gambar terlalu besar. Batas unggahan 8 MB.'); return; }
    try {
      const readyToUpload = saveQueue.current.then(() => fetch(`/api/studio/projects/${project.id}`, {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cloudProject(project)),
      }));
      saveQueue.current = readyToUpload.then(() => undefined, () => undefined);
      const projectResponse = await readyToUpload;
      if (!projectResponse.ok) {
        if (projectResponse.status === 401) setNotice('Masuk sebagai editor sebelum mengunggah gambar referensi ke R2.');
        else { const payload = await projectResponse.json() as { error?: string }; setNotice(payload.error || 'Proyek gagal disimpan sebelum unggahan.'); }
        return;
      }
      const form = new FormData(); form.set('projectId', project.id); form.set('file', file);
      const response = await fetch('/api/studio/assets', { method: 'POST', credentials: 'same-origin', body: form });
      if (response.ok) {
        const payload = await response.json() as { url: string };
        updateSceneById(sceneId, { referenceImage: payload.url });
        setNotice('Gambar referensi tersimpan di R2.');
      } else if (response.status === 401) setNotice('Gambar tersimpan di browser. Masuk sebagai editor untuk mengunggah ke R2.');
      else { const payload = await response.json() as { error?: string }; setNotice(payload.error || 'Gagal mengunggah gambar ke R2.'); }
    } catch { setNotice('Unggahan gagal karena koneksi R2 belum tersedia. Coba lagi saat koneksi pulih.'); }
  }
  async function handleProjectReference(file: File | undefined, kind: 'characterImage' | 'productImage') {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setNotice('Pilih file gambar.'); return; }
    if (file.size > 8 * 1024 * 1024) { setNotice('Gambar terlalu besar. Batas unggahan 8 MB.'); return; }
    setUploadingReference(kind);
    try {
      const savedProject = await fetch(`/api/studio/projects/${project.id}`, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cloudProject(project)) });
      if (!savedProject.ok) { setNotice(savedProject.status === 401 ? 'Masuk sebagai editor untuk menyimpan referensi ke R2.' : 'Proyek belum siap disimpan ke D1.'); return; }
      const form = new FormData(); form.set('projectId', project.id); form.set('file', file);
      const response = await fetch('/api/studio/assets', { method: 'POST', credentials: 'same-origin', body: form });
      const payload = await response.json() as { url?: string; error?: string };
      if (!response.ok || !payload.url) { setNotice(payload.error || 'Gagal mengunggah gambar referensi.'); return; }
      updateProject({ [kind]: payload.url });
      setNotice(`${kind === 'characterImage' ? 'Referensi karakter' : 'Referensi produk'} tersimpan di R2.`);
    } catch { setNotice('Koneksi R2 belum tersedia. Coba unggah kembali.'); }
    finally { setUploadingReference(''); }
  }
  async function generateImage() {
    if (!scene || generating) return;
    setGenerating(true);
    try {
      const savedProject = await fetch(`/api/studio/projects/${project.id}`, {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cloudProject(project)),
      });
      if (!savedProject.ok) { setNotice(savedProject.status === 401 ? 'Masuk sebagai editor untuk membuat gambar.' : 'Simpan proyek ke D1 sebelum membuat gambar.'); return; }
      const response = await fetch('/api/studio/generate-image', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, sceneId: scene.id }),
      });
      const payload = await response.json() as { imageUrl?: string; error?: string };
      if (!response.ok || !payload.imageUrl) { setNotice(payload.error || 'Gambar belum berhasil dibuat.'); return; }
      updateSceneById(scene.id, { image: payload.imageUrl });
      setSyncState('Tersinkron dengan D1 · gambar tersimpan di R2');
      setNotice('Storyboard still berhasil dibuat dan disimpan ke R2.');
    } catch { setNotice('Layanan gambar belum tersedia. Proyek lokal tetap aman.'); }
    finally { setGenerating(false); }
  }

  return <main className="studio-shell">
    <header className="studio-topbar"><a className="studio-brand" href="/generator"><span className="studio-mark">A</span><span>ARENKA <b>STORYBOARD STUDIO</b></span></a><div className="studio-top-actions">{saved && syncState.startsWith('Masuk sebagai editor') ? <a className="studio-login-link" href="https://arenka.biz.id/_emdash/admin/login?redirect=%2F_emdash%2Fadmin" target="_blank" rel="noreferrer">Masuk admin untuk sinkronisasi</a> : <span className="studio-save">{saved ? syncState : 'Menyimpan…'}</span>}<button className="studio-btn ghost" type="button" onClick={exportProject}>Ekspor proyek</button><button className="studio-btn accent" type="button" onClick={exportPrompts}>Unduh prompt Flow</button></div></header>
    <section className="studio-heading"><div><div className="studio-eyebrow">WORKSPACE / STORYBOARD</div><input className="project-title" aria-label="Nama proyek" value={project.title} onChange={event => updateProject({ title: event.target.value })}/><p>Rangkai naskah, karakter, dan frame yang saling nyambung sebelum produksi di Flow.</p></div><label className="ratio-field">Rasio kanvas<select value={project.ratio} onChange={event => updateProject({ ratio: event.target.value })}><option>9:16</option><option>16:9</option><option>1:1</option></select></label></section>
    <section className="studio-setup"><label>IDE CERITA<textarea value={project.brief} onChange={event => updateProject({ brief: event.target.value })} placeholder="Tujuan video, audiens, lokasi, dan inti ceritanya…" rows={2}/></label><div className="reference-card"><label className="reference-title" htmlFor="character-lock">KUNCI KARAKTER</label><textarea id="character-lock" value={project.character || ''} onChange={event => updateProject({ character: event.target.value })} placeholder="Ciri wajah, rambut, pakaian, usia, dan pembawaan…" rows={2}/><div className="reference-upload">{project.characterImage ? <img src={project.characterImage} alt="Referensi karakter"/> : <span className="reference-placeholder">＋</span>}<div><b>{project.characterImage ? 'Referensi karakter siap' : 'Gambar acuan karakter'}</b><small>Jaga wajah, rambut, dan pakaian tetap konsisten.</small></div><label className="reference-button">{uploadingReference === 'characterImage' ? 'Mengunggah…' : project.characterImage ? 'Ganti gambar' : 'Upload gambar'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(uploadingReference)} onChange={event => { void handleProjectReference(event.target.files?.[0], 'characterImage'); event.currentTarget.value = ''; }}/></label>{project.characterImage && <button className="reference-remove" aria-label="Hapus referensi karakter" onClick={() => updateProject({ characterImage: undefined })}>×</button>}</div></div><div className="reference-card"><label className="reference-title" htmlFor="product-lock">PRODUK & GAYA VISUAL</label><textarea id="product-lock" value={project.product || ''} onChange={event => updateProject({ product: event.target.value })} placeholder="Bentuk produk, warna, kemasan, cahaya, dan palet…" rows={2}/><div className="reference-upload">{project.productImage ? <img src={project.productImage} alt="Referensi produk"/> : <span className="reference-placeholder">＋</span>}<div><b>{project.productImage ? 'Referensi produk siap' : 'Gambar acuan produk'}</b><small>Jaga bentuk, warna, dan kemasan di semua scene.</small></div><label className="reference-button">{uploadingReference === 'productImage' ? 'Mengunggah…' : project.productImage ? 'Ganti gambar' : 'Upload gambar'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(uploadingReference)} onChange={event => { void handleProjectReference(event.target.files?.[0], 'productImage'); event.currentTarget.value = ''; }}/></label>{project.productImage && <button className="reference-remove" aria-label="Hapus referensi produk" onClick={() => updateProject({ productImage: undefined })}>×</button>}</div></div></section>
    <section className="import-panel"><div><div className="studio-eyebrow">01 / SCRIPT KE STORYBOARD</div><h2>Mulai dari naskah yang sudah dibuat</h2><p>Tempel script dari Copywriter GPT. Tiap bagian akan menjadi scene yang bisa disunting, diberi gambar, dan disiapkan sebagai prompt Flow.</p></div><div className="import-controls"><textarea value={importText} onChange={event => setImportText(event.target.value)} placeholder={'Scene 1 — Hook\nDialog: ...\nAksi: ...\n\nScene 2 — Demo\nDialog: ...'} rows={4}/><button className="studio-btn dark" type="button" onClick={importScript} disabled={!importText.trim()}>Buat scene dari naskah</button></div></section>
    <section className="studio-workspace"><aside className="scene-list"><div className="scene-list-head"><div><di…509 tokens truncated…nceImage} alt={`Frame ${index + 1}`}/> : <span className="board-empty">Frame {String(index + 1).padStart(2, '0')}</span>}<b>{String(index + 1).padStart(2, '0')}</b></span><strong>{item.title}</strong><small>{item.script || item.action || 'Isi dialog atau aksi scene'}</small></button>)}</div> : <><div className="scene-preview">{scene.image || scene.referenceImage ? <img src={scene.image || scene.referenceImage} alt={`${scene.image ? 'Storyboard still' : 'Referensi visual'} ${scene.title}`}/> : <label className="image-drop"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { void handleImage(event.target.files?.[0], scene.id); event.currentTarget.value = ''; }}/><span className="preview-icon">▧</span><b>Tambahkan gambar referensi scene</b><small>Gunakan karakter atau produk yang sama sebagai acuan visual.</small><span className="studio-btn ghost">Pilih gambar</span></label>}<div className="preview-caption"><span>{scene.image ? 'STORYBOARD STILL' : 'FRAME REFERENSI'}</span><span>{project.ratio}</span></div></div>
        <div className="scene-preview">{scene.image || scene.referenceImage ? <img src={scene.image || scene.referenceImage} alt={`${scene.image ? 'Storyboard still' : 'Referensi visual'} ${scene.title}`}/> : <label className="image-drop"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => handleImage(event.target.files?.[0], scene.id)}/><span className="preview-icon">▧</span><b>Tambahkan gambar referensi scene</b><small>Gunakan karakter atau produk yang sama sebagai acuan visual.</small><span className="studio-btn ghost">Pilih gambar</span></label>}<div className="preview-caption"><span>{scene.image ? 'STORYBOARD STILL' : 'FRAME REFERENSI'}</span><span>{project.ratio}</span></div></div>
        <div className="image-actions"><label className="studio-btn ghost">{scene.referenceImage ? 'Ganti gambar referensi' : 'Unggah gambar referensi'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { void handleImage(event.target.files?.[0], scene.id); event.currentTarget.value = ''; }}/></label><button className="studio-btn dark" type="button" disabled={generating || (!scene.script && !scene.action && !scene.visual)} onClick={generateImage}>{generating ? 'Membuat storyboard…' : 'Buat storyboard still'}</button><small>{generating ? 'Permintaan sedang diproses melalui 9Router.' : (!scene.script && !scene.action && !scene.visual) ? 'Isi dialog, aksi, atau visual scene ini untuk mengaktifkan pembuatan gambar.' : 'Gambar akan disimpan ke proyek Anda.'}</small></div>
        <div className="editor-tabs" role="tablist"><button type="button" role="tab" aria-selected={tab === 'scene'} className={tab === 'scene' ? 'selected' : ''} onClick={() => setTab('scene')}>Aksi & kontinuitas</button><button type="button" role="tab" aria-selected={tab === 'script'} className={tab === 'script' ? 'selected' : ''} onClick={() => setTab('script')}>Naskah</button><button type="button" role="tab" aria-selected={tab === 'flow'} className={tab === 'flow' ? 'selected' : ''} onClick={() => setTab('flow')}>Prompt Flow</button></div>
        {tab === 'scene' && <div className="field-grid"><label className="studio-field wide">Dialog / narasi<textarea rows={3} value={scene.script} onChange={event => updateScene({ script: event.target.value })} placeholder="Kalimat yang diucapkan atau voice-over…"/></label><label className="studio-field">Aksi utama<textarea rows={3} value={scene.action} onChange={event => updateScene({ action: event.target.value })} placeholder="Satu gerakan sederhana dan natural…"/></label><label className="studio-field">Visual & kamera<textarea rows={3} value={scene.visual} onChange={event => updateScene({ visual: event.target.value })} placeholder="Komposisi, cahaya, framing…"/></label><label className="studio-field">Keadaan awal<textarea rows={2} value={scene.continuityIn} onChange={event => updateScene({ continuityIn: event.target.value })} placeholder="Posisi karakter/produk saat scene mulai…"/></label><label className="studio-field">Keadaan akhir<textarea rows={2} value={scene.continuityOut} onChange={event => updateScene({ continuityOut: event.target.value })} placeholder="Detail yang diteruskan ke scene selanjutnya…"/></label></div>}
        {tab === 'script' && <div className="script-note"><div className="studio-eyebrow">NASKAH PROYEK</div><textarea rows={12} value={project.script} onChange={event => updateProject({ script: event.target.value })} placeholder="Naskah lengkap yang diimpor dari Copywriter GPT…"/><small>Scene aktif tetap memiliki dialog tersendiri di tab Aksi & kontinuitas.</small></div>}
        {tab === 'flow' && <div className="flow-panel"><div className="flow-head"><div><div className="studio-eyebrow">PROMPT UNTUK GOOGLE FLOW</div><p>Dihasilkan dari brief dan data scene yang sama, agar arahan visual tetap terhubung.</p></div><button className="studio-btn dark" type="button" onClick={() => copy(flowPrompt)}>Salin prompt</button></div><pre>{flowPrompt}</pre><div className="flow-note">Lampirkan referensi karakter dan produk di Flow, lalu cocokkan frame ini dengan scene sebelumnya.</div></div>}
        <div className="scene-footer"><button className="studio-btn ghost" type="button" disabled={active === 0} onClick={() => setActive(active - 1)}>Sebelumnya</button><span>{active + 1} dari {project.scenes.length}</span><button className="studio-btn dark" type="button" disabled={active === project.scenes.length - 1} onClick={() => setActive(active + 1)}>Berikutnya</button></div>
      </>}
      </article>}
    </section>
    <footer className="studio-footer"><span>ARENKA STUDIO <i>·</i> {syncState}</span><a href="/generator">Kembali ke Content Script</a></footer>
    {notice && <div className="studio-toast" role="status">{notice}<button type="button" aria-label="Tutup pemberitahuan" onClick={() => setNotice('')}>×</button></div>}
  </main>;
}

function flowPromptFor(project: Project, scene: Scene) { return [`Buat video vertikal ${project.ratio}, durasi sekitar ${scene.duration}.`, project.brief && `KONTEKS PROYEK: ${project.brief}`, project.character && `KUNCI IDENTITAS KARAKTER: ${project.character}`, project.characterImage && 'Lampirkan gambar referensi karakter sebagai acuan identitas utama.', project.product && `KUNCI PRODUK DAN GAYA VISUAL: ${project.product}`, project.productImage && 'Lampirkan gambar referensi produk sebagai acuan bentuk dan kemasan.', `SCENE: ${scene.title}`, scene.script && `NASKAH / DIALOG: ${scene.script}`, scene.action && `AKSI: ${scene.action}`, scene.visual && `VISUAL DAN KAMERA: ${scene.visual}`, scene.continuityIn && `KONDISI AWAL: ${scene.continuityIn}`, scene.continuityOut && `KONDISI AKHIR UNTUK SAMBUNGAN: ${scene.continuityOut}`, 'Pertahankan identitas karakter dan bentuk produk sesuai gambar referensi yang diunggah. Gerakan alami, satu aksi utama yang jelas, jangan menambahkan teks atau logo baru.'].filter(Boolean).join('\n\n'); }
