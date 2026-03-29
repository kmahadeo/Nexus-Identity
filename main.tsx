import ReactDOM from 'react-dom/client';
import { InternetIdentityProvider } from './hooks/useInternetIdentity';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TenantProvider } from './TenantContext';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <InternetIdentityProvider>
      <TenantProvider>
        <App />
      </TenantProvider>
    </InternetIdentityProvider>
  </QueryClientProvider>
);
