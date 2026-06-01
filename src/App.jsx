import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabaseClient'

function App() {
  const [user, setUser] = useState(null)
  const [ideas, setIdeas] = useState([])
  const [upvoteCounts, setUpvoteCounts] = useState({})
  const [myVotes, setMyVotes] = useState(new Set())
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState('')
  const [savingIdea, setSavingIdea] = useState(false)
  const [sendingRequestId, setSendingRequestId] = useState('')
  const [ideaForm, setIdeaForm] = useState({ title: '', description: '' })
  const [requestMessages, setRequestMessages] = useState({})

  const isLoggedIn = Boolean(user)

  const sortedIdeas = useMemo(
    () => [...ideas].sort((a, b) => (upvoteCounts[b.id] || 0) - (upvoteCounts[a.id] || 0)),
    [ideas, upvoteCounts],
  )

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return
    }

    const syncSession = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        setError(sessionError.message)
      }
      setUser(data.session?.user ?? null)
    }

    syncSession()

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return
    }

    const loadData = async () => {
      setLoading(true)
      setError('')

      const [{ data: ideaRows, error: ideaError }, { data: voteRows, error: voteError }] =
        await Promise.all([
          supabase
            .from('ideas')
            .select('id,title,description,creator_id,creator_email,created_at')
            .order('created_at', { ascending: false }),
          supabase.from('idea_upvotes').select('idea_id,user_id'),
        ])

      if (ideaError) {
        setError(ideaError.message)
        setLoading(false)
        return
      }

      if (voteError) {
        setError(voteError.message)
        setLoading(false)
        return
      }

      const counts = {}
      const mine = new Set()

      for (const vote of voteRows ?? []) {
        counts[vote.idea_id] = (counts[vote.idea_id] || 0) + 1
        if (vote.user_id === user?.id) {
          mine.add(vote.idea_id)
        }
      }

      setIdeas(ideaRows ?? [])
      setUpvoteCounts(counts)
      setMyVotes(mine)
      setLoading(false)
    }

    loadData()
  }, [user?.id])

  const signInWithGitHub = async () => {
    if (!isSupabaseConfigured) {
      return
    }

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin,
      },
    })

    if (signInError) {
      setError(signInError.message)
    }
  }

  const signOut = async () => {
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) {
      setError(signOutError.message)
    }
  }

  const submitIdea = async (event) => {
    event.preventDefault()

    if (!isLoggedIn || !ideaForm.title.trim() || !ideaForm.description.trim()) {
      return
    }

    setSavingIdea(true)
    setError('')

    const payload = {
      title: ideaForm.title.trim(),
      description: ideaForm.description.trim(),
      creator_id: user.id,
      creator_email: user.email,
    }

    const { error: insertError } = await supabase.from('ideas').insert(payload)

    setSavingIdea(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setIdeaForm({ title: '', description: '' })
    setIdeas((prev) => [
      {
        ...payload,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      },
      ...prev,
    ])

    const { data: refreshedIdeas } = await supabase
      .from('ideas')
      .select('id,title,description,creator_id,creator_email,created_at')
      .order('created_at', { ascending: false })
    setIdeas(refreshedIdeas ?? [])
  }

  const toggleVote = async (ideaId) => {
    if (!isLoggedIn) {
      return
    }

    setError('')

    const hasVoted = myVotes.has(ideaId)
    const result = hasVoted
      ? await supabase
          .from('idea_upvotes')
          .delete()
          .eq('idea_id', ideaId)
          .eq('user_id', user.id)
      : await supabase.from('idea_upvotes').insert({ idea_id: ideaId, user_id: user.id })

    if (result.error) {
      setError(result.error.message)
      return
    }

    setMyVotes((prev) => {
      const next = new Set(prev)
      if (hasVoted) {
        next.delete(ideaId)
      } else {
        next.add(ideaId)
      }
      return next
    })

    setUpvoteCounts((prev) => ({
      ...prev,
      [ideaId]: Math.max((prev[ideaId] || 0) + (hasVoted ? -1 : 1), 0),
    }))
  }

  const requestCollaboration = async (ideaId) => {
    if (!isLoggedIn) {
      return
    }

    setSendingRequestId(ideaId)
    setError('')

    const { error: requestError } = await supabase.from('collaboration_requests').insert({
      idea_id: ideaId,
      requester_id: user.id,
      message: requestMessages[ideaId]?.trim() || null,
    })

    setSendingRequestId('')

    if (requestError) {
      setError(requestError.message)
      return
    }

    setRequestMessages((prev) => ({ ...prev, [ideaId]: '' }))
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg shadow-black/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">IdeaSpark</p>
              <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">
                Share developer project ideas, upvote favorites, and collaborate.
              </h1>
            </div>
            {isLoggedIn ? (
              <button
                type="button"
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-500"
                onClick={signOut}
              >
                Sign out
              </button>
            ) : (
              <button
                type="button"
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                onClick={signInWithGitHub}
              >
                Login with GitHub
              </button>
            )}
          </div>

          {isLoggedIn && <p className="mt-4 text-sm text-slate-300">Logged in as {user.email}</p>}
          {!isSupabaseConfigured && (
            <p className="mt-4 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
              Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable live data.
            </p>
          )}
          {error && (
            <p className="mt-4 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          )}
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-lg font-semibold text-white">Post a project idea</h2>
          <form className="mt-4 space-y-3" onSubmit={submitIdea}>
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              placeholder="Title"
              value={ideaForm.title}
              onChange={(event) => setIdeaForm((prev) => ({ ...prev, title: event.target.value }))}
              disabled={!isLoggedIn || !isSupabaseConfigured || savingIdea}
            />
            <textarea
              className="min-h-28 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              placeholder="Describe the project and tech stack"
              value={ideaForm.description}
              onChange={(event) => setIdeaForm((prev) => ({ ...prev, description: event.target.value }))}
              disabled={!isLoggedIn || !isSupabaseConfigured || savingIdea}
            />
            <button
              type="submit"
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!isLoggedIn || !isSupabaseConfigured || savingIdea}
            >
              {savingIdea ? 'Posting...' : 'Post idea'}
            </button>
          </form>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Ideas</h2>
          {loading ? (
            <p className="text-sm text-slate-400">Loading ideas...</p>
          ) : sortedIdeas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">
              No ideas yet. Be the first to post one.
            </p>
          ) : (
            sortedIdeas.map((idea) => {
              const voted = myVotes.has(idea.id)
              return (
                <article key={idea.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{idea.title}</h3>
                      <p className="mt-2 text-sm text-slate-300">{idea.description}</p>
                      <p className="mt-3 text-xs text-slate-500">
                        Posted by {idea.creator_email || 'unknown'} •{' '}
                        {new Date(idea.created_at).toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                        voted
                          ? 'bg-emerald-500 text-slate-950'
                          : 'border border-slate-700 text-slate-200 hover:border-slate-500'
                      }`}
                      onClick={() => toggleVote(idea.id)}
                      disabled={!isLoggedIn || !isSupabaseConfigured}
                    >
                      ▲ {upvoteCounts[idea.id] || 0}
                    </button>
                  </div>

                  <div className="mt-4 space-y-2 border-t border-slate-800 pt-4">
                    <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Request collaboration
                    </label>
                    <textarea
                      className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                      placeholder="Tell the idea owner why you'd be a good collaborator"
                      value={requestMessages[idea.id] || ''}
                      onChange={(event) =>
                        setRequestMessages((prev) => ({ ...prev, [idea.id]: event.target.value }))
                      }
                      disabled={!isLoggedIn || !isSupabaseConfigured || sendingRequestId === idea.id}
                    />
                    <button
                      type="button"
                      className="rounded-lg border border-indigo-400/60 px-3 py-2 text-sm font-semibold text-indigo-200 hover:border-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => requestCollaboration(idea.id)}
                      disabled={!isLoggedIn || !isSupabaseConfigured || sendingRequestId === idea.id}
                    >
                      {sendingRequestId === idea.id ? 'Sending request...' : 'Request to collaborate'}
                    </button>
                  </div>
                </article>
              )
            })
          )}
        </section>
      </main>
    </div>
  )
}

export default App
