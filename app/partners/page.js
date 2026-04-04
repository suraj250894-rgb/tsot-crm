'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Plus, Pencil, Check, XCircle, Loader2, Power, PowerOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';

export default function PartnersPage() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchPartners = useCallback(async () => {
    const { data, error } = await supabase.from('delivery_partners').select('*').order('created_at');
    if (error) toast.error('Failed to load partners');
    setPartners(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPartners(); }, [fetchPartners]);

  const addPartner = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    const { error } = await supabase.from('delivery_partners').insert({ name });
    setSaving(false);
    if (error) { toast.error('Failed to add'); return; }
    toast.success(`Added "${name}"`);
    setNewName('');
    fetchPartners();
  };

  const saveEdit = async (id) => {
    const name = editName.trim();
    if (!name) return;
    const { error } = await supabase.from('delivery_partners').update({ name }).eq('id', id);
    if (error) { toast.error('Update failed'); return; }
    toast.success('Updated');
    setEditId(null);
    fetchPartners();
  };

  const toggleActive = async (p) => {
    const { error } = await supabase.from('delivery_partners').update({ is_active: !p.is_active }).eq('id', p.id);
    if (error) { toast.error('Update failed'); return; }
    toast.success(p.is_active ? `"${p.name}" deactivated` : `"${p.name}" activated`);
    fetchPartners();
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Users className="w-5 h-5 text-tea-500" />
        <h1 className="page-heading">Delivery Partners</h1>
      </div>

      {/* Add new */}
      <div className="card p-5 mb-5">
        <h2 className="font-semibold text-tea-800 mb-3">Add New Partner</h2>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Partner name (e.g. Delhivery)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPartner()}
          />
          <button
            onClick={addPartner}
            disabled={saving || !newName.trim()}
            className="btn-primary min-h-[44px]"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </div>
      </div>

      {/* Partners list */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-tea-100 bg-tea-50/50">
          <h2 className="text-sm font-semibold text-tea-700">All Partners</h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-tea-400" />
          </div>
        ) : partners.length === 0 ? (
          <div className="text-center py-10 text-stone-400 text-sm">No partners added yet</div>
        ) : (
          <div className="divide-y divide-tea-100">
            {partners.map((p) => (
              <div key={p.id} className={`flex items-center gap-3 px-5 py-4 transition-colors hover:bg-tea-50/30 ${!p.is_active ? 'opacity-50' : ''}`}>
                {/* Status dot */}
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${p.is_active ? 'bg-brand-success' : 'bg-stone-300'}`} />

                {/* Name / Edit */}
                <div className="flex-1 min-w-0">
                  {editId === p.id ? (
                    <input
                      className="input text-sm"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit(p.id)}
                      autoFocus
                    />
                  ) : (
                    <div>
                      <span className="font-medium text-tea-800">{p.name}</span>
                      <span className="text-xs text-stone-400 ml-2">
                        Added {p.created_at ? format(parseISO(p.created_at), 'd MMM yyyy') : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions — min 44px touch targets */}
                <div className="flex items-center gap-1">
                  {editId === p.id ? (
                    <>
                      <button onClick={() => saveEdit(p.id)} className="p-2.5 text-brand-success hover:bg-green-50 rounded-xl min-h-[44px]">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditId(null)} className="p-2.5 text-stone-400 hover:bg-stone-100 rounded-xl min-h-[44px]">
                        <XCircle className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditId(p.id); setEditName(p.name); }}
                        className="p-2.5 text-stone-400 hover:text-tea-600 hover:bg-tea-50 rounded-xl transition-colors min-h-[44px]"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleActive(p)}
                        className={`p-2.5 rounded-xl transition-colors min-h-[44px] ${
                          p.is_active
                            ? 'text-stone-400 hover:text-brand-error hover:bg-red-50'
                            : 'text-stone-400 hover:text-brand-success hover:bg-green-50'
                        }`}
                        title={p.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {p.is_active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
