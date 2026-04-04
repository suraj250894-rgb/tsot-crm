'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Plus, Pencil, Check, XCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function DeliveryPartnerModal({ onClose, onUpdate }) {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetch = async () => {
    const { data } = await supabase.from('delivery_partners').select('*').order('created_at');
    setPartners(data || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const addPartner = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('delivery_partners').insert({ name: newName.trim() });
    setSaving(false);
    if (error) { toast.error('Failed to add partner'); return; }
    toast.success(`Added "${newName.trim()}"`);
    setNewName('');
    await fetch();
    onUpdate?.();
  };

  const saveEdit = async (id) => {
    if (!editName.trim()) return;
    const { error } = await supabase.from('delivery_partners').update({ name: editName.trim() }).eq('id', id);
    if (error) { toast.error('Update failed'); return; }
    toast.success('Partner updated');
    setEditId(null);
    await fetch();
    onUpdate?.();
  };

  const toggleActive = async (partner) => {
    const { error } = await supabase
      .from('delivery_partners')
      .update({ is_active: !partner.is_active })
      .eq('id', partner.id);
    if (error) { toast.error('Update failed'); return; }
    toast.success(partner.is_active ? 'Partner deactivated' : 'Partner activated');
    await fetch();
    onUpdate?.();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h2 className="font-semibold text-stone-800">Manage Delivery Partners</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-tea-400" /></div>
          ) : (
            partners.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-2 p-2 rounded-lg border ${p.is_active ? 'border-stone-200' : 'border-stone-100 bg-stone-50 opacity-60'}`}
              >
                {editId === p.id ? (
                  <>
                    <input
                      className="input flex-1 text-sm"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit(p.id)}
                      autoFocus
                    />
                    <button onClick={() => saveEdit(p.id)} className="text-green-600 hover:text-green-700">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditId(null)} className="text-stone-400 hover:text-stone-600">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium text-stone-700">{p.name}</span>
                    <button
                      onClick={() => { setEditId(p.id); setEditName(p.name); }}
                      className="text-stone-400 hover:text-tea-600"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => toggleActive(p)}
                      className={`text-xs px-2 py-0.5 rounded-full border font-medium transition-colors ${
                        p.is_active
                          ? 'border-red-200 text-red-600 hover:bg-red-50'
                          : 'border-green-200 text-green-600 hover:bg-green-50'
                      }`}
                    >
                      {p.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* Add new */}
        <div className="px-5 pb-5 border-t border-stone-100 pt-4">
          <div className="flex gap-2">
            <input
              className="input flex-1 text-sm"
              placeholder="New partner name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPartner()}
            />
            <button
              onClick={addPartner}
              disabled={saving || !newName.trim()}
              className="btn-primary text-sm px-3"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
