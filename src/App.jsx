import { useState, useEffect, useRef } from 'react'
import { db, storage } from './firebase'
import {
  doc, getDoc, setDoc, onSnapshot, collection,
  addDoc, query, orderBy, serverTimestamp
} from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import './App.css'
import confetti from 'canvas-confetti'

// ─── PASSWORDS ──────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = 'Milkman'      // Change this to whatever you want
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

// ─── TAUNTS ─────────────────────────────────────────────────────────────────
const TAUNTS = [
  "He's doing it. Unfortunately.",
  "Current status: probably regretting his bracket picks.",
  "Somewhere out there, a donut is laughing at him.",
  "Let this be a warning not to pick chalk.",
  "In lieu of flowers, please send donuts.",
  "He knew the risks. He picked anyway.",
]

function TauntMessage() {
  const [index, setIndex] = useState(() => Math.floor(Date.now() / 3600000) % TAUNTS.length)

  useEffect(() => {
    const msUntilNextHour = 3600000 - (Date.now() % 3600000)
    const timeout = setTimeout(() => {
      setIndex(Math.floor(Date.now() / 3600000) % TAUNTS.length)
    }, msUntilNextHour)
    return () => clearTimeout(timeout)
  }, [index])

  return (
    <div className="taunt-message elite">"{TAUNTS[index]}"</div>
  )
}

function LastUpdated({ lastUpdated, lastAction }) {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const id = setInterval(() => forceUpdate(n => n + 1), 30000)
    return () => clearInterval(id)
  }, [])

  if (!lastUpdated || !lastAction || lastAction.count === 0) return null

  const diffMs = Date.now() - lastUpdated.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)

  let timeLabel
  if (diffMins < 1) timeLabel = 'just now'
  else if (diffMins < 60) timeLabel = `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`
  else timeLabel = `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`

  const ACTION_LABELS = {
    milk: (n) => `drank his ${ordinal(n)} pint of milk`,
    miles: (n) => `ran his ${ordinal(n)} mile`,
    beers: (n) => `drank his ${ordinal(n)} beer`,
    donuts: (n) => `ate his ${ordinal(n)} donut`,
  }

  function ordinal(n) {
    const s = ['first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth','eleventh','twelfth']
    return s[n - 1] || `${n}th`
  }

  const actionText = ACTION_LABELS[lastAction.item]?.(lastAction.count) || 'checked something off'

  return (
    <div className="last-updated elite">Micah last {actionText} {timeLabel}</div>
  )
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
        <div className="strava-placeholder elite">Strava link will appear here once the run concludes...</div>
      ) : null}
    </div>
  )
}


// ─── MEDIA UPLOAD ───────────────────────────────────────────────────────────
const CLOUDINARY_CLOUD = 'dnnpkrhpq'
const CLOUDINARY_PRESET = 'march_madness'

function MediaUpload({ onUploaded, unlocked, onUnlock }) {
  const [pwInput, setPwInput] = useState('')
  const [pwError, setPwError] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadError, setUploadError] = useState(null)
  const [uploaderName, setUploaderName] = useState('')
  const fileRef = useRef()

  function tryUnlock() {
    if (pwInput.trim() === UPLOAD_PASSWORD) {
      onUnlock()
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
            uploaderName: uploaderName.trim() || 'Anonymous',
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
        className="text-input"
        type="text"
        placeholder="Your name (optional)"
        value={uploaderName}
        onChange={e => setUploaderName(e.target.value)}
        maxLength={40}
        style={{ marginBottom: '10px' }}
      />
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

// ─── COMMENTS ───────────────────────────────────────────────────────────────
function CommentFeed({ comments, isAdmin, unlocked, onUnlock }) {
  const [pwInput, setPwInput] = useState('')
  const [pwError, setPwError] = useState(false)
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  function tryUnlock() {
    if (pwInput.trim() === UPLOAD_PASSWORD) {
      onUnlock()
      setPwError(false)
    } else {
      setPwError(true)
      setPwInput('')
    }
  }

  async function handleSubmit() {
    if (!text.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await addDoc(collection(db, 'comments'), {
        name: name.trim() || 'Anonymous',
        text: text.trim(),
        createdAt: serverTimestamp(),
      })
      setText('')
    } catch (e) {
      setError('Failed to post. Try again.')
    }
    setSubmitting(false)
  }

  async function handleDeleteComment(id) {
    if (!window.confirm('Delete this comment?')) return
    const { deleteDoc, doc: firestoreDoc } = await import('firebase/firestore')
    await firestoreDoc && deleteDoc(firestoreDoc(db, 'comments', id))
  }

  return (
    <div className="comment-section">
      {!unlocked ? (
        <div className="upload-lock">
          <div className="upload-lock-title bebas">💬 Leave a Comment</div>
          <div className="upload-lock-sub elite">Enter the password to comment</div>
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
      ) : (
        <div className="comment-form">
          <div className="upload-lock-title bebas">💬 Leave a Comment</div>
          <input
            className="text-input"
            type="text"
            placeholder="Your name (optional)"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={40}
            style={{ marginBottom: '8px' }}
          />
          <textarea
            className="text-input comment-textarea"
            placeholder="Say something encouraging. Or don't."
            value={text}
            onChange={e => setText(e.target.value)}
            maxLength={255}
            rows={3}
          />
          <div className="comment-char-count">{text.length}/255</div>
          {error && <div className="error-msg">{error}</div>}
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={submitting || !text.trim()}
            style={{ marginTop: '8px' }}
          >
            {submitting ? 'Posting...' : 'Post'}
          </button>
        </div>
      )}

      <div className="comment-list">
        {comments.length === 0 ? (
          <div className="media-empty elite">No comments yet. Be the first.</div>
        ) : (
          comments.map(c => (
            <div key={c.id} className="comment-item">
              <div className="comment-header">
                <span className="comment-name">{c.name || 'Anonymous'}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="media-time">
                    {c.createdAt?.toDate ? c.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                  {isAdmin && (
                    <button className="comment-delete" onClick={() => handleDeleteComment(c.id)} title="Delete">✕</button>
                  )}
                </div>
              </div>
              <div className="comment-text elite">{c.text}</div>
            </div>
          ))
        )}
      </div>
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
          <div className="media-meta">
            <span className="media-uploader">{item.uploaderName || 'Anonymous'}</span>
            <span className="media-time">{item.createdAt?.toDate ? item.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
          </div>
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
  const [comments, setComments] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)
  const [lastAction, setLastAction] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploadUnlocked, setUploadUnlocked] = useState(false)

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
        if (data.lastUpdated) setLastUpdated(data.lastUpdated.toDate())
        if (data.lastAction) setLastAction(data.lastAction)
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

  // ── Firestore: load + sync comments ──
  useEffect(() => {
    const q = query(collection(db, 'comments'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
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
    const action = { item: itemId, count: next }
    await setDoc(doc(db, 'challenge', 'progress'), { ...newProgress, stravaUrl, lastUpdated: serverTimestamp(), lastAction: action }, { merge: true })
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
  const prevAllDone = useRef(false)
  const prevCategoryDone = useRef({})

  useEffect(() => {
    if (allDone && !prevAllDone.current) {
      confetti({
        particleCount: 200,
        spread: 90,
        origin: { y: 0.6 },
        colors: ['#f47b20', '#f5f0e8', '#ffffff', '#c45f10'],
      })
    } else if (!allDone) {
      CHALLENGE_ITEMS.forEach(item => {
        const isDone = (progress[item.id] || 0) >= item.total
        const wasDone = prevCategoryDone.current[item.id] || false
        if (isDone && !wasDone) {
          confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.6 },
            colors: [item.color, '#ffffff'],
          })
        }
      })
    }
    prevAllDone.current = allDone
    prevCategoryDone.current = Object.fromEntries(
      CHALLENGE_ITEMS.map(item => [item.id, (progress[item.id] || 0) >= item.total])
    )
  }, [allDone, progress])

  return (
    <div className="app">
      {/* ── HEADER ── */}
      <header className="hero">
        <div className="hero-badge marker">BRACKET LOSER 2026</div>
        <h1 className="hero-title bebas">
          {allDone ? (
            <>
              <span className="name">Micah</span>
              <span className="rip">LIVES!</span>
            </>
          ) : (
            <>
              <span className="rip">R.I.P.</span>
              <span className="name">Micah</span>
            </>
          )}
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
          <LastUpdated lastUpdated={lastUpdated} lastAction={lastAction} />
          <TauntMessage />
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
        <MediaUpload onUploaded={() => {}} unlocked={uploadUnlocked} onUnlock={() => setUploadUnlocked(true)} />
        <MediaWall items={mediaItems} isAdmin={isAdmin} onDelete={handleDeleteMedia} />
      </section>

      {/* ── COMMENTS ── */}
      <section className="section">
        <div className="section-title bebas">💬 Comments</div>
        <CommentFeed comments={comments} isAdmin={isAdmin} unlocked={uploadUnlocked} onUnlock={() => setUploadUnlocked(true)} />
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer elite">
        In loving memory of Micah's dignity · March Madness 2026 · Gone but not forgotten 🏀
      </footer>
    </div>
  )
}
