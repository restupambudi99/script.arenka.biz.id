import { useState } from 'react';
import { createPrompt, defaultValues, generators, type Field } from './config';
import './script-generator.css';

function FieldControl({field,value,onChange}:{field:Field;value:string;onChange:(value:string)=>void}){
 const custom = value==='Lainnya (Isi Manual)';
 return <label className={`sg-field ${field.full?'sg-field-full':''}`} htmlFor={field.id}>
  <span className="sg-label">{field.label}{field.required&&<strong> *</strong>}</span>
  {field.options ? <select id={field.id} value={value} onChange={event=>onChange(event.target.value)}>
   {field.options.map((option,index)=><option key={index} value={index===0&&option.startsWith('--')?'':option}>{option}</option>)}
  </select> : field.multiline ? <textarea id={field.id} value={value} onChange={event=>onChange(event.target.value)} placeholder={field.placeholder} rows={5}/> : <input id={field.id} value={value} onChange={event=>onChange(event.target.value)} placeholder={field.placeholder}/>}
  {custom&&<span className="sg-custom-hint">Pilihan manual: jelaskan detailnya pada kolom teks yang tersedia.</span>}
  {field.help&&<small>{field.help}</small>}
 </label>;
}

export default function ScriptGenerator(){
 const [active,setActive]=useState(0);
 const [values,setValues]=useState<Record<string,string>>(()=>defaultValues(generators[0]));
 const [prompt,setPrompt]=useState('');
 const [dark,setDark]=useState(true);
 const [notice,setNotice]=useState('');
 const generator=generators[active];
 const allFields=generator.sections.flatMap(section=>section.fields);
 const shown=prompt;
 function switchMode(index:number){setActive(index);setValues(defaultValues(generators[index]));setPrompt('');setNotice('');}
 function generatePrompt(){
  const missing=allFields.filter(field=>field.required&&!values[field.id]?.trim());
  if(missing.length){setNotice(`Lengkapi kolom wajib: ${missing.map(field=>field.label).join(', ')}.`);document.getElementById(missing[0].id)?.focus();return;}
  if(active===5&&values.cal_pilar.split(',').map(v=>v.trim()).filter(Boolean).length<3){setNotice('Isi minimal tiga pilar konten, pisahkan dengan koma.');document.getElementById('cal_pilar')?.focus();return;}
  setPrompt(createPrompt(generator,values));setNotice('Prompt siap. Salin atau buka Copywriter GPT untuk menggunakannya.');
 }
 function openCopywriter(){
  if(!prompt)return;
  window.open('https://chatgpt.com/g/g-Ji2QOyMml-copywriter-gpt-marketing-branding-ads','_blank','noopener,noreferrer');
  navigator.clipboard.writeText(prompt)
   .then(()=>setNotice('Copywriter GPT dibuka. Prompt sudah disalin, tempelkan dengan Ctrl+V.'))
   .catch(()=>setNotice('Copywriter GPT dibuka. Salin prompt dari panel lalu tempelkan di chat.'));
 }
 async function copy(){
  try{await navigator.clipboard.writeText(shown);setNotice('Teks disalin ke clipboard.');}
  catch{setNotice('Gagal menyalin. Pilih teks pada panel hasil dan salin secara manual.');}
 }
 return <div className={`sg-app ${dark?'sg-dark':'sg-light'}`}>
  <aside className="sg-sidebar">
   <div className="sg-brand"><span className="sg-brand-mark">✦</span><span><b>Content<span>Script</span></b><small>ARENKA.BIZ.ID</small></span></div>
   <div className="sg-sidebar-title">GENERATORS</div>
   <nav aria-label="Jenis generator" className="sg-nav">{generators.map((item,index)=><button key={item.name} type="button" className={active===index?'selected':''} onClick={()=>switchMode(index)} aria-current={active===index?'page':undefined}><span className="sg-nav-icon" aria-hidden="true">{item.icon}</span>{item.name}</button>)}</nav>
   <div className="sg-sidebar-bottom"><a href="/studio">✦ &nbsp; Storyboard Studio</a><a href="https://arenka.biz.id">← Kembali ke situs</a><small>© 2026 Arenka.biz.id</small></div>
  </aside>
  <div className="sg-main">
   <header className="sg-header"><h1>{generator.name}</h1><div className="sg-header-actions"><button type="button" onClick={()=>setDark(!dark)} aria-label={dark?'Aktifkan tema terang':'Aktifkan tema gelap'} title="Ganti tema">{dark?'☾':'☀'}</button><a href="https://arenka.biz.id" aria-label="Kembali ke situs" title="Kembali ke situs">↪</a></div></header>
   <div className="sg-workspace">
    <div className="sg-form-column"><form onSubmit={event=>{event.preventDefault();generatePrompt();}}>
     {generator.sections.map((section,index)=><section className="sg-section" key={section.title}>
      <h2><span>{String(index+1).padStart(2,'0')}</span>{section.title}</h2>
      <div className="sg-fields">{section.fields.map(field=><FieldControl key={field.id} field={field} value={values[field.id]??''} onChange={value=>setValues(prev=>({...prev,[field.id]:value}))}/>)}</div>
     </section>)}
     <div className="sg-form-actions"><button type="submit" className="sg-primary">▤ &nbsp; Generate Prompt</button><button type="button" className="sg-secondary" onClick={()=>{setValues(defaultValues(generator));setPrompt('');setNotice('Form direset.');}}>↺ &nbsp; Reset Form</button></div>
    </form></div>
    <div className="sg-output-column"><div className="sg-output-card">
      <div className="sg-output-top"><span className="sg-window-dots"><i/><i/><i/></span><span>AI Prompt Output</span><button type="button" className="sg-copy" disabled={!shown} onClick={copy}>COPY</button></div>
     <div className={`sg-output-text ${shown?'has-content':''}`} role="region" aria-label="Prompt AI"><pre>{shown||'// Isi form di sebelah kiri untuk generate prompt...'}</pre></div>
     <div className="sg-output-footer"><button type="button" disabled={!prompt} onClick={openCopywriter}>✦ &nbsp; Buka Copywriter GPT</button></div>
    </div></div>
   </div>
  </div>
  {notice&&<div className="sg-notice" role="status"><span>{notice}</span><button type="button" aria-label="Tutup pemberitahuan" onClick={()=>setNotice('')}>×</button></div>}
 </div>;
}
