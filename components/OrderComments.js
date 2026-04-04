'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { MessageSquare, Send, Trash2, Loader2, X } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const MAX_CHARS = 500;

/** Inline comment thread used inside the picking page's Pack by Invoice view */
export default function OrderComments({ orderId, initialCount = 0 }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // comment id to confirm deletion

  const fetchComments = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('order_comments')
      .select('id, comment_text, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });
    if (!error) {
      setComments(data || []);
      setCount(data?.length || 0);
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    if (open) fetchComments();
  }, [open, fetchComments]);

  const addComment = async () => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_CHARS) return;
    setSaving(true);
    const { error } = await supabase
      .from('order_comments')
      .insert({ order_id: orderId, comment_text: trimmed });
    setSaving(false);
    if (error) { toast.error('Failed to add comment'); return; }
    setText('');
    fetchComments();
  };

  const deleteComment = async (id) => {
    const { error } = await supabase.from('order_comments').delete().eq('id', id);
    if (error) { toast.error('Delete failed'); return; }
    setDeleteConfirm(null);
    fetchComments();
  };

  const remaining = MAX_CHARS - text.length;

  return (
    <div className="border-t border-tea-100">
      {/* Toggle trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'w-full flex items-center gap-2 px-4 py-3 text-sm transition-colors',
          open ? 'bg-tea-50 text-tea-700' : 'hover:bg-stone-50 text-stone-500'
        )}
      >
        <MessageSquare className="w-4 h-4" />
        <span className="font-medium">Comments</span>
        {count > 0 && (
          <span className="ml-1 bg-tea-400 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold">
            {count}
          </span>
        )}
        <span className="ml-auto text-xs text-stone-400">{open ? 'hide' : 'show'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 bg-tea-50/40">
          {/* Input */}
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <input
                className="input flex-1 bg-white text-sm"
                placeholder="Add a note about this order…"
                value={text}
                maxLength={MAX_CHARS}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && addComment()}
              />
              <button
                onClick={addComment}
                disabled={saving || !text.trim()}
                className="btn-primary text-sm px-3 py-2 min-w-[44px]"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            <p className={clsx('text-xs text-right', remaining < 50 ? 'text-brand-error' : 'text-stone-400')}>
              {remaining} chars left
            </p>
          </div>

          {/* Comment list */}
          {loading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="w-4 h-4 animate-spin text-tea-400" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-xs text-stone-400 text-center py-2">
              No comments yet. Add a note if there&apos;s an issue with this order.
            </p>
          ) : (
            <div className="space-y-2">
              {comments.map((c) => (
                <div key={c.id} className="bg-white rounded-lg px-3 py-2.5 border border-tea-100 group">
                  {deleteConfirm === c.id ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-brand-error font-medium">Delete this comment?</span>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => deleteComment(c.id)}
                          className="text-xs text-white bg-brand-error rounded px-2 py-1 hover:bg-red-700"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="text-xs text-stone-500 bg-stone-100 rounded px-2 py-1 hover:bg-stone-200"
                        >
                          No
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-tea-800 leading-snug">{c.comment_text}</p>
                        <p className="text-xs text-stone-400 mt-1">
                          {formatDistanceToNow(parseISO(c.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      <button
                        onClick={() => setDeleteConfirm(c.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-stone-300 hover:text-brand-error transition-all flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact comment count badge for dashboard table */
export function CommentsBadge({ orderId, count = 0, onClick }) {
  if (count === 0) {
    return (
      <button
        onClick={onClick}
        className="text-stone-300 hover:text-tea-400 transition-colors p-1"
        title="Add comment"
      >
        <MessageSquare className="w-3.5 h-3.5" />
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-tea-600 hover:text-tea-700 transition-colors group"
      title={`${count} comment${count !== 1 ? 's' : ''}`}
    >
      <MessageSquare className="w-3.5 h-3.5" />
      <span className="text-xs font-medium">{count}</span>
    </button>
  );
}

/** Full-screen comments modal for the dashboard */
export function CommentsModal({ orderId, orderLabel, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-warm-lg w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-tea-100">
          <div>
            <h3 className="font-serif text-tea-800">Comments</h3>
            <p className="text-xs text-stone-400">{orderLabel}</p>
          </div>
          <button onClick={onClose} className="p-2 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <OrderComments orderId={orderId} />
        </div>
      </div>
    </div>
  );
}
