export interface BalanceChartSettings {
  timeframe?: string;
  selectedBots?: string[];
  chartTab?: 'users' | 'bots';
}

export interface OrderbookSettings {
  symbol?: string;
  timeframe?: string;
  open?: boolean;
}

export interface PositionsSettings {
  userFilter?: string;
  botFilter?: string;
  symbolFilter?: string;
  tfFilter?: string;
  typeFilter?: string;
  forecastFilter?: string;
}

export interface TradeHistorySettings {
  userFilter?: string;
  botFilter?: string;
  symbolFilter?: string;
  tfFilter?: string;
  typeFilter?: string;
  forecastFilter?: string;
  resultFilter?: string;
  open?: boolean;
}

export interface TradingViewSettings {
  symbols?: string[];
  interval?: string;
  open?: boolean;
}

export interface DashboardSettings {
  balanceChart?: BalanceChartSettings;
  orderbook?: OrderbookSettings;
  positions?: PositionsSettings;
  tradeHistory?: TradeHistorySettings;
  tradingView?: TradingViewSettings;
}
