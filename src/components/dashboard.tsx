'use client';

import { useState, useCallback } from 'react';
import { useDashboardData } from '@/hooks/use-trades';
import { useAuth } from '@/contexts/auth-context';
import { useSettings } from '@/hooks/use-settings';
import Header from '@/components/header';
import KpiCards from '@/components/kpi-cards';
import BalanceChart from '@/components/balance-chart';

import PositionsTable from '@/components/positions-table';
import TradeHistory from '@/components/trade-history';
import CreateBotModal from '@/components/modals/create-bot-modal';
import ApiKeyModal from '@/components/modals/api-key-modal';
import RenameBotModal from '@/components/modals/rename-bot-modal';
import RegisterBoModal from '@/components/modals/register-bo-modal';
import ApiExampleModal from '@/components/modals/api-example-modal';
import AuthModal from '@/components/modals/auth-modal';
import TradingViewCharts from '@/components/tradingview-charts';
import OrderbookDepth from '@/components/orderbook-depth';
import ReportPage from '@/components/report-page';
import BotManagerPage from '@/components/bot-manager-page';
import AdminPage from '@/components/admin-page';
import Toast from '@/components/ui/toast';

export default function Dashboard() {
  const { user } = useAuth();
  const { data, loading, refresh } = useDashboardData(30_000);
  const { settings, updateSettings } = useSettings();
  const [showCreateBot, setShowCreateBot] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyData, setApiKeyData] = useState<{ bot_name: string; api_key: string; balance: number } | null>(null);
  const [showRenameBot, setShowRenameBot] = useState(false);
  const [showRegisterBo, setShowRegisterBo] = useState(false);
  const [showApiExample, setShowApiExample] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'report' | 'bots' | 'admin'>('dashboard');
  const [botRefreshKey, setBotRefreshKey] = useState(0);
  const [sessionOffset, setSessionOffset] = useState(0);

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
    setBotRefreshKey((k) => k + 1);
    refresh();
  };

  const handleTabChange = (tab: 'dashboard' | 'report' | 'bots' | 'admin') => {
    if (tab === 'bots' && !user) return;
    if (tab === 'admin' && !user?.is_admin) return;
    setActiveTab(tab);
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
  const userBalanceHistory = data?.userBalanceHistory ?? [];
  const userBalanceSnapshots = data?.userBalanceSnapshots ?? [];
  const userPnls = data?.userPnls ?? [];
  const schedulerStatus = data?.schedulerStatus ?? null;
  const botAchievements = data?.botAchievements ?? {};

  return (
    <>
      <Header
        schedulerStatus={schedulerStatus}
        lastUpdated={lastUpdated}
        onRefresh={handleRefresh}
        onApiExample={() => setShowApiExample(true)}
        onLogin={() => setShowAuth(true)}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        bots={bots}
        trades={trades}
      />

      {activeTab === 'admin' && user?.is_admin ? (
        <AdminPage />
      ) : activeTab === 'report' ? (
        <ReportPage trades={trades} bots={bots} botAchievements={botAchievements} />
      ) : activeTab === 'bots' && user ? (
        <BotManagerPage
          onCreateBot={() => setShowCreateBot(true)}
          onRefresh={refresh}
          refreshKey={botRefreshKey}
        />
      ) : (
        <main className="max-w-[1900px] mx-auto px-5 py-5 space-y-5">
          <KpiCards trades={trades} bots={bots} />

          <BalanceChart
            bots={bots}
            botPnls={data?.botPnls ?? []}
            balanceHistory={balanceHistory}
            trades={trades}
            userBalanceHistory={userBalanceHistory}
            userBalanceSnapshots={userBalanceSnapshots}
            userPnls={userPnls}
            initialSettings={settings.balanceChart}
            onSettingsChange={(s) => updateSettings({ balanceChart: s })}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <TradingViewCharts
              initialSettings={settings.tradingView}
              onSettingsChange={(s) => updateSettings({ tradingView: s })}
            />
            <OrderbookDepth
              initialSettings={settings.orderbook}
              onSettingsChange={(s) => updateSettings({ orderbook: s })}
              onSessionChange={setSessionOffset}
            />
          </div>

          <PositionsTable
            trades={trades}
            bots={bots}
            isAdmin={user?.is_admin}
            sessionOffset={sessionOffset}
            initialSettings={settings.positions}
            onSettingsChange={(s) => updateSettings({ positions: s })}
          />

          <TradeHistory
            trades={trades}
            bots={bots}
            isAdmin={user?.is_admin}
            initialSettings={settings.tradeHistory}
            onSettingsChange={(s) => updateSettings({ tradeHistory: s })}
          />
        </main>
      )}

      {/* Modals */}
      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
      <CreateBotModal open={showCreateBot} onClose={() => setShowCreateBot(false)} onCreated={handleBotCreated} />
      <ApiKeyModal open={showApiKey} onClose={() => setShowApiKey(false)} data={apiKeyData} />
      <RenameBotModal open={showRenameBot} onClose={() => setShowRenameBot(false)} bots={bots} onRenamed={() => refresh()} />
      <RegisterBoModal open={showRegisterBo} onClose={() => setShowRegisterBo(false)} onCreated={() => refresh()} />
      <ApiExampleModal open={showApiExample} onClose={() => setShowApiExample(false)} />

      <Toast />
    </>
  );
}
