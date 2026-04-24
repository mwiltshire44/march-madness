import { useState, useEffect, useRef } from 'react'
import { db, storage } from './firebase'
import {
  doc, getDoc, setDoc, onSnapshot, collection,
  addDoc, query, orderBy, serverTimestamp
} from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import './App.css'

// ─── PASSWORDS ──────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = 'ripMicah'      // Change this to whatever you want
const UPLOAD_PASSWORD = 'milkgang'     // Change this to whatever you want

// ─── CHALLENGE END TIME ─────────────────────────────────────────────────────
// May 25 2026 23:59:59 AST (UTC-3)
const CHALLENGE_END = new Date('2026-04-26T02:59:59Z').getTime()
const CHALLENGE_START = new Date('2026-04-25T03:00:00Z').getTime()

// ─── CHALLENGE ITEMS ────────────────────────────────────────────────────────
const CHALLENGE_ITEMS = [
  {
    id: 'milk',
    label: 'Pints of Milk',
    total: 4,
    emoji: '🥛',
    color: '#f5f0e8',
    accent: '#d4cfc7',
    description: 'The sacred nectar',
  },
  {
    id: 'miles',
    label: 'Miles Run',
    total: 6,
    emoji: '🏃',
    color: '#f47b20',
    accent: '#c45f10',
    description: 'One foot in front of the other',
  },
  {
    id: 'beers',
    label: 'Beers',
    total: 8,
    emoji: '🍺',
    color: '#d4a017',
    accent: '#a07810',
    description: 'Liquid courage',
  },
  {
    id: 'donuts',
    label: 'Donuts',
    total: 12,
    emoji: '🍩',
    color: '#e8528a',
    accent: '#b03060',
    description: 'Glazed and confused',
  },
]

// ─── COUNTDOWN ──────────────────────────────────────────────────────────────
function useCountdown() {
  const [time, setTime] = useState(null)
  const [phase, setPhase] = useState('before') // before | active | over

  useEffect(() => {
    function tick() {
      const now = Date.now()
      if (now < CHALLENGE_START) {
        setPhase('before')
        setTime(CHALLENGE_START - now)
      } else if (now < CHALLENGE_END) {
        setPhase('active')
        setTime(CHALLENGE_END - now)
      } else {
        setPhase('over')
        setTime(0)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return { time, phase }
}

function formatCountdown(ms) {
  if (!ms) return '00:00:00'
  const totalSecs = Math.floor(ms / 1000)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ─── PROGRESS CARD ──────────────────────────────────────────────────────────
function ProgressCard({ item, completed, isAdmin, onToggle }) {
  const pct = Math.round((completed / item.total) * 100)
  const ticks = Array.from({ length: item.total }, (_, i) => i)

  return (
    <div className="progress-card" style={{ '--card-color': item.color, '--card-accent': item.accent }}>
      <div className="card-header">
        <span className="card-emoji">{item.emoji}</span>
        <div className="card-title-block">
          <div className="card-label bebas">{item.label}</div>
          <div className="card-desc elite">{item.description}</div>
        </div>
        <div className="card-count bebas">
          <span className="count-done">{completed}</span>
          <span className="count-sep">/</span>
          <span className="count-total">{item.total}</span>
        </div>
      </div>

      <div className="progress-bar-wrap">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="ticks-row">
        {ticks.map(i => {
          const done = i < completed
          return (
            <button
              key={i}
              className={`tick ${done ? 'tick-done' : 'tick-empty'} ${isAdmin ? 'tick-clickable' : ''}`}
              onClick={() => isAdmin && onToggle(item.id, i, done)}
              title={isAdmin ? (done ? 'Uncheck' : 'Check off') : ''}
              disabled={!isAdmin}
            >
              {done ? '✓' : ''}
            </button>
          )
        })}
      </div>

      {completed === item.total && (
        <div className="card-complete marker">DONE!! 🎉</div>
      )}
    </div>
  )
}

// ─── STRAVA SECTION ─────────────────────────────────────────────────────────
function StravaSection({ stravaUrl, isAdmin, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(stravaUrl || '')

  function handleSave() {
    onSave(draft.trim())
    setEditing(false)
  }

  return (
    <div className="strava-section">
      <div className="section-title bebas">🏃 The Run</div>
      {isAdmin && !editing && (
        <button className="btn-ghost small" onClick={() => setEditing(true)}>
          {stravaUrl ? '✏️ Update Strava Link' : '+ Add Strava Link'}
        </button>
      )}
      {editing && (
        <div className="strava-edit">
          <input
            className="text-input"
            placeholder="Paste your Strava activity URL..."
            value={draft}
            onChange={e => setDraft(e.target.value)}
          />
          <div className="row-gap">
            <button className="btn-primary small" onClick={handleSave}>Save</button>
            <button className="btn-ghost small" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
      {stravaUrl && !editing ? (
        <a className="strava-link" href={stravaUrl} target="_blank" rel="noopener noreferrer">
          🔗 View Strava Activity →
        </a>
      ) : !stravaUrl && !editing ? (
        <div className="strava-placeholder elite">Strava link will appear here once the run begins...</div>
      ) : null}
    </div>
  )
}


// ─── MEDIA UPLOAD ───────────────────────────────────────────────────────────
const CLOUDINARY_CLOUD = 'dnnpkrhpq'
const CLOUDINARY_PRESET = 'march_madness'

function MediaUpload({ onUploaded }) {
  const [unlocked, setUnlocked] = useState(false)
  const [pwInput, setPwInput] = useState('')
  const [pwError, setPwError] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadError, setUploadError] = useState(null)
  const fileRef = useRef()

  function tryUnlock() {
    if (pwInput.trim() === UPLOAD_PASSWORD) {
      setUnlocked(true)
      setPwError(false)
    } else {
      setPwError(true)
      setPwInput('')
    }
  }

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    setProgress(0)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('upload_preset', CLOUDINARY_PRESET)

    try {
      const isVideo = file.type.startsWith('video/')
      const resourceType = isVideo ? 'video' : 'image'
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/${resourceType}/upload`)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
      }

      xhr.onload = async () => {
        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText)
          await addDoc(collection(db, 'media'), {
            url: data.secure_url,
            type: isVideo ? 'video' : 'image',
            name: file.name,
            createdAt: serverTimestamp(),
          })
          setUploading(false)
          setProgress(0)
          if (fileRef.current) fileRef.current.value = ''
          onUploaded && onUploaded()
        } else {
          setUploadError('Upload failed. Try again.')
          setUploading(false)
        }
      }

      xhr.onerror = () => {
        setUploadError('Upload failed. Check your connection.')
        setUploading(false)
      }

      xhr.send(formData)
    } catch (err) {
      setUploadError('Something went wrong.')
      setUploading(false)
    }
  }

  if (!unlocked) {
    return (
      <div className="upload-lock">
        <div className="upload-lock-title bebas">📸 Add to the Wall of Shame</div>
        <div className="upload-lock-sub elite">Enter the password to upload photos & videos</div>
        <div className="pw-row">
          <input
            className={`text-input ${pwError ? 'input-error' : ''}`}
            type="password"
            placeholder="Password..."
            value={pwInput}
            onChange={e => { setPwInput(e.target.value); setPwError(false) }}
            onKeyDown={e => e.key === 'Enter' && tryUnlock()}
          />
          <button className="btn-primary" onClick={tryUnlock}>Unlock</button>
        </div>
        {pwError && <div className="error-msg">Wrong password, try again.</div>}
      </div>
    )
  }

  return (
    <div className="upload-unlocked">
      <div className="upload-lock-title bebas">📸 Upload to the Wall of Shame</div>
      <div className="upload-lock-sub elite">Photos & videos from your camera roll</div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        capture={false}
        onChange={handleFile}
        style={{ display: 'none' }}
        id="file-input"
      />
      <label htmlFor="file-input" className={`btn-upload ${uploading ? 'uploading' : ''}`}>
        {uploading ? `Uploading... ${progress}%` : '📱 Choose Photo or Video'}
      </label>
      {uploadError && <div className="error-msg">{uploadError}</div>}
      {uploading && (
        <div className="upload-progress-bar">
          <div className="upload-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  )
}


// ─── MEDIA WALL ─────────────────────────────────────────────────────────────
function MediaWall({ items, isAdmin, onDelete }) {
  if (items.length === 0) {
    return (
      <div className="media-empty elite">
        No photos yet. Be the first to document Micah's suffering.
      </div>
    )
  }

  return (
    <div className="media-grid">
      {items.map(item => (
        <div key={item.id} className="media-item">
          {item.type === 'video' ? (
            <video src={item.url} controls playsInline className="media-asset" />
          ) : (
            <img src={item.url} alt="moment of shame" className="media-asset" />
          )}
	  {isAdmin && (
            <button className="media-delete" onClick={() => onDelete(item.id, item.url)} title="Delete">✕</button>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── ADMIN PANEL ────────────────────────────────────────────────────────────
function AdminUnlock({ onUnlock }) {
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [err, setErr] = useState(false)

  function tryLogin() {
    if (pw === ADMIN_PASSWORD) {
      onUnlock()
      setOpen(false)
    } else {
      setErr(true)
      setPw('')
    }
  }

  return (
    <div className="admin-unlock-wrap">
      {!open ? (
        <button className="btn-ghost tiny" onClick={() => setOpen(true)}>🔒 Admin</button>
      ) : (
        <div className="admin-panel">
          <input
            className={`text-input small ${err ? 'input-error' : ''}`}
            type="password"
            placeholder="Admin password..."
            value={pw}
            onChange={e => { setPw(e.target.value); setErr(false) }}
            onKeyDown={e => e.key === 'Enter' && tryLogin()}
            autoFocus
          />
          <button className="btn-primary small" onClick={tryLogin}>Enter</button>
          <button className="btn-ghost small" onClick={() => setOpen(false)}>✕</button>
          {err && <span className="error-msg">Wrong.</span>}
        </div>
      )}
    </div>
  )
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function App() {
  const { time, phase } = useCountdown()
  const [isAdmin, setIsAdmin] = useState(false)
  const [progress, setProgress] = useState({ milk: 0, miles: 0, beers: 0, donuts: 0 })
  const [stravaUrl, setStravaUrl] = useState('')
  const [mediaItems, setMediaItems] = useState([])
  const [loading, setLoading] = useState(true)

  // ── Firestore: load + sync progress ──
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'challenge', 'progress'), snap => {
      if (snap.exists()) {
        const data = snap.data()
        setProgress({
          milk: data.milk || 0,
          miles: data.miles || 0,
          beers: data.beers || 0,
          donuts: data.donuts || 0,
        })
        setStravaUrl(data.stravaUrl || '')
      }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  // ── Firestore: load + sync media ──
  useEffect(() => {
    const q = query(collection(db, 'media'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setMediaItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [])

  // ── Admin: persist in session ──
  useEffect(() => {
    if (sessionStorage.getItem('isAdmin') === 'true') setIsAdmin(true)
  }, [])

  function handleAdminUnlock() {
    setIsAdmin(true)
    sessionStorage.setItem('isAdmin', 'true')
  }

  // ── Toggle a tick ──
  async function handleToggle(itemId, index, wasDone) {
    const current = progress[itemId]
    let next
    if (!wasDone) {
      // Checking on — set completed to max(current, index+1)
      next = Math.max(current, index + 1)
    } else {
      // Unchecking — set to index (everything before this index stays)
      next = index
    }
    const newProgress = { ...progress, [itemId]: next }
    setProgress(newProgress)
    await setDoc(doc(db, 'challenge', 'progress'), { ...newProgress, stravaUrl }, { merge: true })
  }

  // Delete media
  async function handleDeleteMedia(id, url) {
    if (!window.confirm('Delete this post?')) return
    const { deleteDoc, doc: firestoreDoc } = await import('firebase/firestore')
    const { deleteObject, ref: storageRef } = await import('firebase/storage')
    try {
      const path = decodeURIComponent(new URL(url).pathname.split('/o/')[1].split('?')[0])
      await deleteObject(storageRef(storage, path))
    } catch (e) { console.warn('Storage delete failed', e) }
    await deleteDoc(firestoreDoc(db, 'media', id))
  }

  // ── Save strava URL ──
  async function handleStravaUrl(url) {
    setStravaUrl(url)
    await setDoc(doc(db, 'challenge', 'progress'), { ...progress, stravaUrl: url }, { merge: true })
  }

  const totalItems = CHALLENGE_ITEMS.reduce((a, c) => a + c.total, 0)
  const totalDone = CHALLENGE_ITEMS.reduce((a, c) => a + (progress[c.id] || 0), 0)
  const overallPct = Math.round((totalDone / totalItems) * 100)
  const allDone = totalDone === totalItems

  return (
    <div className="app">
      {/* ── HEADER ── */}
      <header className="hero">
        <div className="hero-badge marker">BRACKET LOSER 2026</div>
        <h1 className="hero-title bebas">
          <span className="rip">R.I.P.</span>
          <span className="name">Micah</span>
        </h1>
        <div className="hero-sub elite">
          Beloved friend. Terrible bracket picker.<br />
          Gone too soon, one donut at a time.
        </div>
        <div className="hero-icons">
          🏀&nbsp;&nbsp;🥛&nbsp;&nbsp;🍺&nbsp;&nbsp;🍩&nbsp;&nbsp;🏃
        </div>

        {/* Countdown */}
        <div className="countdown-wrap">
          {phase === 'before' && (
            <>
              <div className="countdown-label elite">The suffering begins in...</div>
              <div className="countdown bebas">{formatCountdown(time)}</div>
            </>
          )}
          {phase === 'active' && (
            <>
              <div className="countdown-label elite">Time remaining to complete the challenge</div>
              <div className={`countdown bebas ${time < 3600000 ? 'countdown-red' : ''}`}>
                {formatCountdown(time)}
              </div>
            </>
          )}
          {phase === 'over' && (
            <div className="countdown bebas countdown-red">
              {allDone ? '🎉 HE DID IT 🎉' : '⏰ TIME\'S UP'}
            </div>
          )}
        </div>

        {/* Overall progress */}
        <div className="overall-progress">
          <div className="overall-label elite">
            Overall: <strong>{totalDone}</strong> of <strong>{totalItems}</strong> tasks complete
            &nbsp;({overallPct}%)
          </div>
          <div className="overall-bar">
            <div className="overall-fill" style={{ width: `${overallPct}%` }} />
          </div>
        </div>
      </header>

      {/* ── ADMIN UNLOCK ── */}
      <div className="admin-row">
        {isAdmin ? (
          <div className="admin-active-badge">✅ Admin mode — you can check things off</div>
        ) : (
          <AdminUnlock onUnlock={handleAdminUnlock} />
        )}
      </div>

      {/* ── PROGRESS CARDS ── */}
      <section className="section">
        <div className="section-title bebas">📋 The Last Rites</div>
        {loading ? (
          <div className="loading elite">Loading from beyond the grave...</div>
        ) : (
          <div className="cards-grid">
            {CHALLENGE_ITEMS.map(item => (
              <ProgressCard
                key={item.id}
                item={item}
                completed={progress[item.id] || 0}
                isAdmin={isAdmin}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── STRAVA ── */}
      <section className="section">
        <StravaSection
          stravaUrl={stravaUrl}
          isAdmin={isAdmin}
          onSave={handleStravaUrl}
        />
      </section>

      {/* ── MEDIA ── */}
      <section className="section">
        <div className="section-title bebas">📸 Wall of Shame</div>
        <MediaUpload onUploaded={() => {}} />
        <MediaWall items={mediaItems} isAdmin={isAdmin} onDelete={handleDeleteMedia} />
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer elite">
        In loving memory of Micah's dignity · March Madness 2026 · Gone but not forgotten 🏀
      </footer>
    </div>
  )
}
