import React from 'react';
import { 
  Building2, 
  Users, 
  UserCheck, 
  Truck, 
  Award, 
  Clock, 
  ShieldCheck, 
  Wallet 
} from 'lucide-react';

interface EventSummaryCardsProps {
  stats: {
    schools: number;
    dancers: number;
    teachers: number;
    providers: number;
    credentialsIssued: number;
    pendingStellar: number;
    registeredStellar: number;
    walletsClaimed: number;
  };
}

export const EventSummaryCards: React.FC<EventSummaryCardsProps> = ({ stats }) => {
  const cards = [
    {
      title: 'Total Escuelas',
      value: stats.schools,
      icon: <Building2 className="w-5 h-5 text-[#C5A880]" />,
      bg: 'bg-white',
    },
    {
      title: 'Total Bailarinas',
      value: stats.dancers,
      icon: <Users className="w-5 h-5 text-[#C5A880]" />,
      bg: 'bg-white',
    },
    {
      title: 'Total Profesoras',
      value: stats.teachers,
      icon: <UserCheck className="w-5 h-5 text-[#C5A880]" />,
      bg: 'bg-white',
    },
    {
      title: 'Total Proveedores',
      value: stats.providers,
      icon: <Truck className="w-5 h-5 text-[#C5A880]" />,
      bg: 'bg-white',
    },
    {
      title: 'Credenciales Emitidas',
      value: stats.credentialsIssued,
      icon: <Award className="w-5 h-5 text-emerald-600" />,
      bg: 'bg-emerald-50/20 border-emerald-100',
    },
    {
      title: 'Registros Pendientes',
      value: stats.pendingStellar,
      icon: <Clock className="w-5 h-5 text-amber-600" />,
      bg: 'bg-amber-50/20 border-amber-100',
    },
    {
      title: 'Registrados Stellar',
      value: stats.registeredStellar,
      icon: <ShieldCheck className="w-5 h-5 text-[#5C061E]" />,
      bg: 'bg-[#5C061E]/5 border-[#5C061E]/10',
    },
    {
      title: 'Pasaportes Reclamados',
      value: stats.walletsClaimed,
      icon: <Wallet className="w-5 h-5 text-stone-600" />,
      bg: 'bg-stone-50 border-stone-200',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => (
        <div 
          key={idx} 
          className={`p-4 rounded-xl border border-stone-200/60 shadow-xs flex items-center justify-between transition-all duration-200 hover:shadow-sm ${card.bg}`}
        >
          <div className="flex flex-col text-left">
            <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400">
              {card.title}
            </span>
            <span className="text-xl font-bold text-[#1C1A17] mt-1.5 leading-none">
              {card.value}
            </span>
          </div>
          <div className="p-2 bg-stone-50 rounded-lg">
            {card.icon}
          </div>
        </div>
      ))}
    </div>
  );
};
