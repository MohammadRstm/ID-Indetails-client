import { useEffect } from 'react';
import './App.css'
import AppRoutes from './routes/AppRoutes'
import { ToastProvider } from './services/toast'
import { setupInterceptors } from './services/api/interceptors';
import useAuth from './app/context/Auth/useAuth';
import { useNavigate } from 'react-router';
import { authenticatedApi } from './services/api/client';

function App(){

  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {

    const receptors = setupInterceptors(logout, navigate);

    return () => {
      authenticatedApi.interceptors.request.eject(receptors.authenticatedApiReqReceptor);
      authenticatedApi.interceptors.response.eject(receptors.autheticatedRespInterceptor);
    };

  }, [logout, navigate]);


  return <>
    <ToastProvider />
    <AppRoutes />
  </>
}

export default App
