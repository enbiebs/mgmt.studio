'use client'
// Saved vendors (built up automatically from confirmed bills) with the
// details the app watches for changes.

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, FormField, inputClass } from '@/components/ui/Modal'
import type { Vendor } from '@/types'

export function VendorsPanel({ editable }: { editable: boolean }) {
  const client = useStore(s => s.getClient())
  const deleteVendor = useStore(s => s.deleteVendor)
  const [editing, setEditing] = useState<Vendor | null>(null)

  const vendors = client?.finance?.vendors ?? []
  if (!client || vendors.length === 0) return null
  const expenses = client.finance.expenses

  return (
    <div className="mt-6 border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 text-[10px] font-bold uppercase tracking-widest text-gray-400">Vendors</div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-gray-50">
          {vendors.map(v => (
            <tr key={v.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <div className="font-medium">{v.name}</div>
                <div className="text-xs text-gray-400">{[v.email, v.phone].filter(Boolean).join(' · ') || 'No contact details'}</div>
              </td>
              <td className="px-4 py-3 text-xs text-gray-500">{v.taxId ? `Tax ID ${v.taxId}` : ''}</td>
              <td className="px-4 py-3 text-xs text-gray-500">{v.bankLast4 ? `Bank •••• ${v.bankLast4}` : ''}</td>
              <td className="px-4 py-3 text-xs text-gray-400 text-right">
                {expenses.filter(e => e.vendorId === v.id).length} bills
              </td>
              {editable && (
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setEditing(v)} className="text-xs text-blue-500 hover:text-blue-600 mr-3">Edit</button>
                  <button
                    onClick={() => { if (confirm(`Remove ${v.name} from your vendor list? Their bills stay.`)) deleteVendor(v.id) }}
                    className="text-xs text-red-400 hover:text-red-500"
                  >
                    Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {editing && <VendorEditModal vendor={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function VendorEditModal({ vendor, onClose }: { vendor: Vendor; onClose: () => void }) {
  const updateVendor = useStore(s => s.updateVendor)
  const [f, setF] = useState({
    name: vendor.name, address: vendor.address ?? '', email: vendor.email ?? '',
    phone: vendor.phone ?? '', taxId: vendor.taxId ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }))

  function handleSave() {
    if (!f.name.trim()) return
    updateVendor(vendor.id, {
      name: f.name.trim(),
      address: f.address.trim() || undefined, email: f.email.trim() || undefined,
      phone: f.phone.trim() || undefined, taxId: f.taxId.trim() || undefined,
    })
    onClose()
  }

  return (
    <Modal title="Edit vendor" onClose={onClose} footer={
      <>
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={handleSave} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">Save</button>
      </>
    }>
      <FormField label="Name"><input type="text" className={inputClass} value={f.name} onChange={set('name')} /></FormField>
      <FormField label="Address"><input type="text" className={inputClass} value={f.address} onChange={set('address')} /></FormField>
      <FormField label="Email"><input type="text" className={inputClass} value={f.email} onChange={set('email')} /></FormField>
      <FormField label="Phone"><input type="text" className={inputClass} value={f.phone} onChange={set('phone')} /></FormField>
      <FormField label="Tax ID"><input type="text" className={inputClass} value={f.taxId} onChange={set('taxId')} /></FormField>
      <div className="text-xs text-gray-400">
        {vendor.bankLast4 ? `Bank account ending ${vendor.bankLast4} — updated automatically from bills.` : 'No bank account saved yet.'}
      </div>
    </Modal>
  )
}
