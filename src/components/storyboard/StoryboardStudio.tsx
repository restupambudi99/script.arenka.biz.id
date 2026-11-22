import { useEffect, useMemo, useState } from 'react';
import './storyboard-studio.css';

type Scene = { id: string; title: string; duration: string; script: string; action: string; visual: string; flow: string; continuityIn: string; continuityOut: string; image?: string };
type Project = { title: string; brief: string; ratio: string; script: string; scenes: Scene[]; updatedAt: string };
const KEY = 'arenka-storyboard-project-v1';
const makeScene = (index: number, script = ''): Scene => ({ id: crypto.randomUUID(), title: `Scene ${index + 1}`, duration: '5 dtk', script, action: '', visual: '', flow: '', continuityIn: '', continuityOut: '' });
const initial: Project = { title: 'Proyek storyboard baru', brief: '', ratio: '9:16', script: '', scenes: [makeScene(0)], updatedAt: new Date().toISOString() };

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
  const [saved, setSaved] = useState(false);
  const scene = project.scenes[active] ?? project.scenes[0];

  useEffect(() => {
    try { const stored = localStorage.getItem(KEY); if (stored) setProject(JSON.parse(stored) as Project); } catch { setNotice('Proyek lokal tidak dapat dibaca.'); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify({ ...project, updatedAt: new Date().toISOString() })); setSaved(true); } catch { setSaved(false); setNotice('Penyimpanan browser penuh. Ekspor proyek sebagai cadangan.'); } }, 350);
    return () => window.clearTimeout(timer);
  }, [project]);
  const flowPrompt = useMemo(() => [
    `Buat video vertikal ${project.ratio}, durasi sekitar ${scene.duration}.`,
    project.brief && `KONTEKS PROYEK: ${project.brief}`,
    `SCENE: ${scene.title}`,
    scene.script && `NASKAH / DIALOG: ${scene.script}`,
    scene.action && `AKSI: ${scene.action}`,
    scene.visual && `VISUAL DAN KAMERA: ${scene.visual}`,
    scene.continuityIn && `KONDISI AWAL: ${scene.continuityIn}`,
    scene.continuityOut && `KONDISI AKHIR UNTUK SAMBUNGAN: ${scene.continuityOut}`,
    'Pertahankan identitas karakter dan bentuk produk sesuai gambar referensi yang diunggah. Gerakan alami, satu aksi utama yang jelas, jangan menambahkan teks atau logo baru.'
  ].filter(Boolean).join('\n\n'), [project, scene]);

  function updateScene(patch: Partial<Scene>) { setProject(value => ({ ...value, scenes: value.scenes.map((item, index) => index === active ? { ...item, ...patch } : item) })); }
  function updateProject(patch: Partial<Project>) { setProject(value => ({ ...value, ...patch })); }
  function importScript() { if (!importText.trim()) return; const scenes = parseScript(importText); setProject(value => ({ ...value, script: importText.trim(), scenes })); setActive(0); setImportText(''); setNotice(`${scenes.length} scene diimpor. Periksa dan lengkapi detail tiap scene.`); }
  function addScene() { const next = [...project.scenes, makeScene(project.scenes.length)]; setProject(value => ({ ...value, scenes: next })); setActive(next.length - 1); setTab('scene'); }
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setNotice('Teks disalin.'); } catch { setNotice('Clipboard tidak tersedia; pilih teks lalu salin manual.'); } }
  function download(name: string, type: string, data: string) { const url = URL.createObjectURL(new Blob([data], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
  function exportProject() { download('arenka-storyboard-project.json', 'application/json', JSON.stringify(project, null, 2)); }
  function exportPrompts() { download('arenka-flow-prompts.txt', 'text/plain;charset=utf-8', project.scenes.map(item => `## ${item.title}\n${flowPromptFor(project, item)}`).join('\n\n---\n\n')); }
  function handleImage(file?: File) { if (!file) return; if (!file.type.startsWith('image/')) { setNotice('Pilih file gambar.'); return; } const reader = new FileReader(); reader.onload = () => updateScene({ image: String(reader.result) }); reader.readAsDataURL(file); }

  return <main className="studio-shell">
    <header className="studio-topbar"><a className="studio-brand" href="/generator"><span className="studio-mark">A</span><span>ARENKA <b>STORYBOARD</b></span></a><div className="studio-top-actions"><span className="studio-save">{saved ? 'Tersimpan di browser' : 'Menyimpan…'}</span><button className="studio-btn ghost" onClick={exportProject}>Ekspor proyek</button><button className="studio-btn accent" onClick={exportPrompts}>Unduh prompt Flow</button></div></header>
    <section className="studio-heading"><div><div className="studio-eyebrow">WORKSPACE / STORYBOARD</div><input className="project-title" aria-label="Nama proyek" value={project.title} onChange={event => updateProject({ title: event.target.value })}/><p>Jaga benang merah naskah, aksi, dan tiap scene sebelum dibawa ke Google Flow.</p></div><label className="ratio-field">Rasio kanvas<select value={project.ratio} onChange={event => updateProject({ ratio: event.target.value })}><option>9:16</option><option>16:9</option><option>1:1</option></select></label></section>
    <section className="project-brief"><label htmlFor="brief">IDE & KONTEKS CERITA</label><textarea id="brief" value={project.brief} onChange={event => updateProject({ brief: event.target.value })} placeholder="Produk, audiens, lokasi, karakter, nuansa, dan tujuan video…" rows={2}/></section>
    <section className="import-panel"><div><div className="studio-eyebrow">01 / BAWA MASUK NASKAH</div><h2>Tempel hasil dari Copywriter GPT</h2><p>Gunakan heading “Scene 1”, “Scene 2”, dan seterusnya agar pemisahan otomatis lebih rapi. Naskah tetap bisa diedit setelah diimpor.</p></div><div className="import-controls"><textarea value={importText} onChange={event => setImportText(event.target.value)} placeholder={'Scene 1 — Hook\nDialog: ...\nAksi: ...\n\nScene 2 — Demo\nDialog: ...'} rows={4}/><button className="studio-btn dark" onClick={importScript} disabled={!importText.trim()}>Impor naskah → scene</button></div></section>
    <section className="studio-workspace"><aside className="scene-list"><div className="scene-list-head"><div><div className="studio-eyebrow">02 / URUTAN CERITA</div><h2>Scene <span>{project.scenes.length}</span></h2></div><button className="icon-btn" aria-label="Tambah scene" onClick={addScene}>＋</button></div>{project.scenes.map((item, index) => <button key={item.id} className={`scene-item ${active === index ? 'active' : ''}`} onClick={() => setActive(index)}><span className="scene-number">{String(index + 1).padStart(2, '0')}</span><span className="scene-item-text"><b>{item.title || `Scene ${index + 1}`}</b><small>{item.script || 'Belum ada naskah'}</small></span><span className="scene-arrow">↗</span></button>)}<button className="add-scene" onClick={addScene}>＋ Tambah scene</button></aside>
      {scene && <article className="scene-editor"><div className="editor-top"><div><div className="studio-eyebrow">SCENE {String(active + 1).padStart(2, '0')} / {String(project.scenes.length).padStart(2, '0')}</div><input value={scene.title} aria-label="Nama scene" onChange={event => updateScene({ title: event.target.value })}/></div><label className="duration-field">Durasi<select value={scene.duration} onChange={event => updateScene({ duration: event.target.value })}>{['3 dtk','5 dtk','8 dtk','10 dtk','15 dtk'].map(value => <option key={value}>{value}</option>)}</select></label></div>
        <div className="scene-preview">{scene.image ? <img src={scene.image} alt={`Referensi visual ${scene.title}`}/> : <label className="image-drop"><input type="file" accept="image/*" onChange={event => handleImage(event.target.files?.[0])}/><span className="preview-icon">▧</span><b>Tambahkan gambar referensi scene</b><small>Seret identitas karakter dan produk lewat referensi yang sama.</small><span className="studio-btn ghost">Pilih gambar</span></label>}<div className="preview-caption"><span>FRAME REFERENSI</span><span>{project.ratio}</span></div></div>
        <div className="editor-tabs" role="tablist"><button className={tab === 'scene' ? 'selected' : ''} onClick={() => setTab('scene')}>Aksi & kontinuitas</button><button className={tab === 'script' ? 'selected' : ''} onClick={() => setTab('script')}>Naskah</button><button className={tab === 'flow' ? 'selected' : ''} onClick={() => setTab('flow')}>Prompt Flow</button></div>
        {tab === 'scene' && <div className="field-grid"><label className="studio-field wide">Dialog / narasi<textarea rows={3} value={scene.script} onChange={event => updateScene({ script: event.target.value })} placeholder="Kalimat yang diucapkan atau voice-over…"/></label><label className="studio-field">Aksi utama<textarea rows={3} value={scene.action} onChange={event => updateScene({ action: event.target.value })} placeholder="Satu gerakan sederhana dan natural…"/></label><label className="studio-field">Visual & kamera<textarea rows={3} value={scene.visual} onChange={event => updateScene({ visual: event.target.value })} placeholder="Komposisi, cahaya, framing…"/></label><label className="studio-field">Keadaan awal<textarea rows={2} value={scene.continuityIn} onChange={event => updateScene({ continuityIn: event.target.value })} placeholder="Posisi karakter/produk saat scene mulai…"/></label><label className="studio-field">Keadaan akhir<textarea rows={2} value={scene.continuityOut} onChange={event => updateScene({ continuityOut: event.target.value })} placeholder="Detail yang diteruskan ke scene selanjutnya…"/></label></div>}
        {tab === 'script' && <div className="script-note"><div className="studio-eyebrow">NASKAH PROYEK</div><textarea rows={12} value={project.script} onChange={event => updateProject({ script: event.target.value })} placeholder="Naskah lengkap yang diimpor dari Copywriter GPT…"/><small>Scene aktif tetap memiliki dialog tersendiri di tab Aksi & kontinuitas.</small></div>}
        {tab === 'flow' && <div className="flow-panel"><div className="flow-head"><div><div className="studio-eyebrow">PROMPT UNTUK GOOGLE FLOW</div><p>Dihasilkan dari brief dan data scene yang sama, agar arahan visual tetap terhubung.</p></div><button className="studio-btn dark" onClick={() => copy(flowPrompt)}>Salin prompt</button></div><pre>{flowPrompt}</pre><div className="flow-note">Sebelum membuat klip di Flow, lampirkan gambar referensi scene dan periksa kontinuitas dengan scene sebelumnya.</div></div>}
        <div className="scene-footer"><button className="studio-btn ghost" disabled={active === 0} onClick={() => setActive(active - 1)}>← Sebelumnya</button><span>{active + 1} dari {project.scenes.length}</span><button className="studio-btn dark" disabled={active === project.scenes.length - 1} onClick={() => setActive(active + 1)}>Scene berikutnya →</button></div>
      </article>}
    </section>
    <footer className="studio-footer"><span>AREKNA STUDIO <i>·</i> Prompt dan aset disimpan di perangkat ini</span><button onClick={() => window.location.href = '/generator'}>← Kembali ke Content Script</button></footer>
    {notice && <div className="studio-toast" role="status">{notice}<button aria-label="Tutup" onClick={() => setNotice('')}>×</button></div>}
  </main>;
}

function flowPromptFor(project: Project, scene: Scene) { return [`Buat video vertikal ${project.ratio}, durasi sekitar ${scene.duration}.`, project.brief && `KONTEKS PROYEK: ${project.brief}`, `SCENE: ${scene.title}`, scene.script && `NASKAH / DIALOG: ${scene.script}`, scene.action && `AKSI: ${scene.action}`, scene.visual && `VISUAL DAN KAMERA: ${scene.visual}`, scene.continuityIn && `KONDISI AWAL: ${scene.continuityIn}`, scene.continuityOut && `KONDISI AKHIR UNTUK SAMBUNGAN: ${scene.continuityOut}`, 'Pertahankan identitas karakter dan bentuk produk sesuai gambar referensi yang diunggah. Gerakan alami, satu aksi utama yang jelas, jangan menambahkan teks atau logo baru.'].filter(Boolean).join('\n\n'); }
