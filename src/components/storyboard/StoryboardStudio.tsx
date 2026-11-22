import { useEffect, useMemo, useRef, useState } from 'react';
import './storyboard-studio.css';

type Scene = { id: string; title: string; duration: string; script: string; action: string; visual: string; flow: string; continuityIn: string; continuityOut: string; image?: string; referenceImage?: string };
type Project = { id: string; title: string; brief: string; ratio: string; script: string; scenes: Scene[]; updatedAt: string; style?: string; character?: string; product?: string };
const KEY = 'arenka-storyboard-project-v1';
const makeScene = (index: number, script = ''): Scene => ({ id: `scene-${index + 1}-${crypto.randomUUID()}`, title: `Scene ${index + 1}`, duration: '5 dtk', script, action: '', visual: '', flow: '', continuityIn: '', continuityOut: '' });
const initial: Project = { id: '', title: 'Proyek storyboard baru', brief: '', ratio: '9:16', script: '', scenes: [{ id: 'scene-1', title: 'Scene 1', duration: '5 dtk', script: '', action: '', visual: '', flow: '', continuityIn: '', continuityOut: '' }], updatedAt: new Date().toISOString() };
const cloudProject = (project: Project) => ({ ...project, scenes: project.scenes.map(item => {
  const cloudScene = { ...item };
  if (cloudScene.image?.startsWith('data:')) delete cloudScene.image;
  if (cloudScene.referenceImage?.startsWith('data:')) delete cloudScene.referenceImage;
  return cloudScene;
}) });

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
  function download(name: string, type: string, data: string) { const url = URL.createObjectURL(new Blob([data], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
  function exportProject() { download('arenka-storyboard-project.json', 'application/json', JSON.stringify(project, null, 2)); }
  function exportPrompts() { download('arenka-flow-prompts.txt', 'text/plain;charset=utf-8', project.scenes.map(item => `## ${item.title}\n${flowPromptFor(project, item)}`).join('\n\n---\n\n')); }
  async function handleImage(file?: File, sceneId = scene?.id) {
    if (!file) return;
    if (!sceneId) return;
    if (!file.type.startsWith('image/')) { setNotice('Pilih file gambar.'); return; }
    const reader = new FileReader();
    reader.onload = () => updateSceneById(sceneId, { referenceImage: String(reader.result) });
    reader.readAsDataURL(file);
    if (file.size > 8 * 1024 * 1024) { setNotice('Gambar terlalu besar. Batas unggahan 8 MB.'); return; }
    try {
      const readyToUpload = saveQueue.current.then(() => fetch(`/api/studio/projects/${project.id}`, {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cloudProject(project)),
      }));
      saveQueue.current = readyToUpload.then(() => undefined, () => undefined);
      const projectResponse = await readyToUpload;
      if (!projectResponse.ok) {
        if (projectResponse.status === 401) setNotice('Gambar tersimpan di browser. Masuk sebagai editor untuk menyinkronkan ke R2.');
        else setNotice('Simpan proyek ke D1 sebelum mengunggah referensi ke R2.');
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
    } catch { setNotice('Gambar tersimpan di browser. Koneksi R2 belum tersedia.'); }
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
    <header className="studio-topbar"><a className="studio-brand" href="/generator"><span className="studio-mark">A</span><span>ARENKA <b>STORYBOARD STUDIO</b></span></a><div className="studio-top-actions"><span className="studio-save">{saved ? syncState : 'Menyimpan…'}</span><button className="studio-btn ghost" onClick={exportProject}>Ekspor proyek</button><button className="studio-btn accent" onClick={exportPrompts}>Unduh prompt Flow</button></div></header>
    <section className="studio-heading"><div><div className="studio-eyebrow">WORKSPACE / STORYBOARD</div><input className="project-title" aria-label="Nama proyek" value={project.title} onChange={event => updateProject({ title: event.target.value })}/><p>Rangkai naskah, karakter, dan frame yang saling nyambung sebelum produksi di Flow.</p></div><label className="ratio-field">Rasio kanvas<select value={project.ratio} onChange={event => updateProject({ ratio: event.target.value })}><option>9:16</option><option>16:9</option><option>1:1</option></select></label></section>
    <section className="studio-setup"><label>IDE CERITA<textarea value={project.brief} onChange={event => updateProject({ brief: event.target.value })} placeholder="Tujuan video, audiens, lokasi, dan inti ceritanya…" rows={2}/></label><label>KUNCI KARAKTER<textarea value={project.character || ''} onChange={event => updateProject({ character: event.target.value })} placeholder="Ciri wajah, rambut, pakaian, usia, dan pembawaan…" rows={2}/></label><label>PRODUK & GAYA VISUAL<textarea value={project.product || ''} onChange={event => updateProject({ product: event.target.value })} placeholder="Bentuk produk, warna, kemasan, cahaya, dan palet…" rows={2}/></label></section>
    <section className="import-panel"><div><div className="studio-eyebrow">01 / SCRIPT → STORYBOARD</div><h2>Mulai dari naskah yang sudah dibuat</h2><p>Tempel script dari Copywriter GPT. Tiap bagian akan menjadi scene yang bisa disunting, diberi gambar, dan disiapkan sebagai prompt Flow.</p></div><div className="import-controls"><textarea value={importText} onChange={event => setImportText(event.target.value)} placeholder={'Scene 1 — Hook\nDialog: ...\nAksi: ...\n\nScene 2 — Demo\nDialog: ...'} rows={4}/><button className="studio-btn dark" onClick={importScript} disabled={!importText.trim()}>Susun scene dari script →</button></div></section>
    <section className="studio-workspace"><aside className="scene-list"><div className="scene-list-head"><div><div className="studio-eyebrow">02 / ALUR CERITA</div><h2>Storyboard <span>{project.scenes.length} frame</span></h2></div><button className="icon-btn" aria-label="Tambah scene" onClick={addScene}>＋</button></div>{project.scenes.map((item, index) => <button key={item.id} className={`scene-item ${active === index ? 'active' : ''}`} onClick={() => { setActive(index); setView('edit'); }}><span className="scene-number">{String(index + 1).padStart(2, '0')}</span><span className="scene-item-text"><b>{item.title || `Scene ${index + 1}`}</b><small>{item.script || 'Tambahkan script scene'}</small></span><span className="scene-arrow">↗</span></button>)}<button className="add-scene" onClick={addScene}>＋ Tambah frame</button></aside>
      {scene && <article className="scene-editor"><div className="editor-top"><div><div className="studio-eyebrow">SCENE {String(active + 1).padStart(2, '0')} / {String(project.scenes.length).padStart(2, '0')}</div><input value={scene.title} aria-label="Nama scene" onChange={event => updateScene({ title: event.target.value })}/></div><label className="duration-field">Durasi<select value={scene.duration} onChange={event => updateScene({ duration: event.target.value })}>{['3 dtk','5 dtk','8 dtk','10 dtk','15 dtk'].map(value => <option key={value}>{value}</option>)}</select></label></div>
        <div className="board-toolbar"><span>CANVAS STORYBOARD</span><div><button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>Semua frame</button><button className={view === 'edit' ? 'on' : ''} onClick={() => setView('edit')}>Edit frame</button></div></div>
        {view === 'board' ? <div className="storyboard-grid">{project.scenes.map((item, index) => <button className={`board-card ${active === index ? 'current' : ''}`} key={item.id} onClick={() => { setActive(index); setView('edit'); }}><span className="board-image">{item.image || item.referenceImage ? <img src={item.image || item.referenceImage} alt={`Frame ${index + 1}`}/> : <span>✳<small>Frame {String(index + 1).padStart(2, '0')}</small></span>}<b>{String(index + 1).padStart(2, '0')}</b></span><strong>{item.title}</strong><small>{item.script || item.action || 'Isi dialog atau aksi scene'}</small></button>)}</div> : <><div className="scene-preview">{scene.image || scene.referenceImage ? <img src={scene.image || scene.referenceImage} alt={`${scene.image ? 'Storyboard still' : 'Referensi visual'} ${scene.title}`}/> : <label className="image-drop"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => handleImage(event.target.files?.[0], scene.id)}/><span className="preview-icon">▧</span><b>Tambahkan gambar referensi scene</b><small>Gunakan karakter atau produk yang sama sebagai acuan visual.</small><span className="studio-btn ghost">Pilih gambar</span></label>}<div className="preview-caption"><span>{scene.image ? 'STORYBOARD STILL' : 'FRAME REFERENSI'}</span><span>{project.ratio}</span></div></div>
        <div className="scene-preview">{scene.image || scene.referenceImage ? <img src={scene.image || scene.referenceImage} alt={`${scene.image ? 'Storyboard still' : 'Referensi visual'} ${scene.title}`}/> : <label className="image-drop"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => handleImage(event.target.files?.[0], scene.id)}/><span className="preview-icon">▧</span><b>Tambahkan gambar referensi scene</b><small>Gunakan karakter atau produk yang sama sebagai acuan visual.</small><span className="studio-btn ghost">Pilih gambar</span></label>}<div className="preview-caption"><span>{scene.image ? 'STORYBOARD STILL' : 'FRAME REFERENSI'}</span><span>{project.ratio}</span></div></div>
        <div className="…1074 tokens truncated… && `KONDISI AKHIR UNTUK SAMBUNGAN: ${scene.continuityOut}`, 'Pertahankan identitas karakter dan bentuk produk sesuai gambar referensi yang diunggah. Gerakan alami, satu aksi utama yang jelas, jangan menambahkan teks atau logo baru.'].filter(Boolean).join('\n\n'); }
