'use client';

import { useState, useCallback } from 'react';
import { useDashboardData } from '@/hooks/use-trades';
import Header from '@/components/header';
import KpiCards from '@/components/kpi-cards';
import BalanceChart from '@/components/balance-chart';
import BotPerformance from '@/components/bot-performance';
import PositionsTable from '@/components/positions-table';
import TradeHistory from '@/components/trade-history';
import CreateBotModal from '@/components/modals/create-bot-modal';
import ApiKeyModal from '@/components/modals/api-key-modal';
import RenameBotModal from '@/components/modals/rename-bot-modal';
import RegisterBoModal from '@/components/modals/register-bo-modal';
import ApiExampleModal from '@/components/modals/api-example-modal';
import TradingViewCharts from '@/components/tradingview-charts';
import OrderbookDepth from '@/components/orderbook-depth';
import ReportPage from '@/components/report-page';
import Toast from '@/components/ui/toast';

export default function Dashboard() {
  const { data, loading, error, refresh } = useDashboardData(30_000);
  const [showCreateBot, setShowCreateBot] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyData, setApiKeyData] = useState<{ bot_name: string; api_key: string; balance: number } | null>(null);
  const [showRenameBot, setShowRenameBot] = useState(false);
  const [showRegisterBo, setShowRegisterBo] = useState(false);
  const [showApiExample, setShowApiExample] = useState(false);
  const [selectedBots, setSelectedBots] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'report'>('dashboard');

  const [lastUpdated, setLastUpdated] = useState('');

  const handleRefresh = useCallback(async () => {
    await refresh();
    setLastUpdated(
      'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    );
  }, [refresh]);

  const handleBotCreated = (d: { bot_name: string; api_key: string; balance: number }) => {
    setShowCreateBot(false);
    setApiKeyData(d);
    setShowApiKey(true);
    refresh();
  };

  const handleBotFilterChange = (selected: Set<string>) => {
    setSelectedBots(selected.size >= 1 ? [...selected] : []);
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading dashboard...</div>
      </div>
    );
  }

  const trades = data?.trades ?? [];
  const bots = data?.bots ?? [];
  const balanceHistory = data?.balanceHistory ?? [];
  const schedulerStatus = data?.schedulerStatus ?? null;

  return (
    <>
      <Header
        schedulerStatus={schedulerStatus}
        lastUpdated={lastUpdated}
        onRefresh={handleRefresh}
        onNewBot={() => setShowCreateBot(true)}
        onRenameBot={() => setShowRenameBot(true)}
        onApiExample={() => setShowApiExample(true)}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {activeTab === 'report' ? (
        <ReportPage trades={trades} bots={bots} />
      ) : (
        <main className="max-w-[1900px] mx-auto px-5 py-5 space-y-5">
          <KpiCards trades={trades} bots={bots} />

          <BalanceChart
            bots={bots}
            balanceHistory={balanceHistory}
            trades={trades}
            onBotFilterChange={handleBotFilterChange}
          />

          {selectedBots.length > 0 && (
            <BotPerformance
              selectedBots={selectedBots}
              trades={trades}
              bots={bots}
              onClose={() => setSelectedBots([])}
            />
          )}

          <TradingViewCharts />
          <OrderbookDepth />

          <PositionsTable trades={trades} bots={bots} />

          <TradeHistory trades={trades} bots={bots} />
        </main>
      )}

      {/* Modals */}
      <CreateBotModal open={showCreateBot} onClose={() => setShowCreateBot(false)} onCreated={handleBotCreated} />
      <ApiKeyModal open={showApiKey} onClose={() => setShowApiKey(false)} data={apiKeyData} />
      <RenameBotModal open={showRenameBot} onClose={() => setShowRenameBot(false)} bots={bots} onRenamed={() => refresh()} />
      <RegisterBoModal open={showRegisterBo} onClose={() => setShowRegisterBo(false)} onCreated={() => refresh()} />
      <ApiExampleModal open={showApiExample} onClose={() => setShowApiExample(false)} />

      <Toast />
    </>
  );
}
