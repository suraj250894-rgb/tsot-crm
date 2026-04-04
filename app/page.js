import OrderTable from '@/components/OrderTable';
import { LayoutDashboard } from 'lucide-react';

export const metadata = { title: 'Dashboard — TSOT CRM' };

export default function DashboardPage() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <LayoutDashboard className="w-5 h-5 text-tea-600" />
        <h1 className="text-xl font-bold text-stone-800">Order Dashboard</h1>
        <span className="text-sm text-stone-400 ml-2">All orders across all lots</span>
      </div>
      <OrderTable />
    </div>
  );
}
