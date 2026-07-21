import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import SetupWizard from './SetupWizard';

const WizardCtx = createContext<{ open: () => void }>({ open: () => {} });
export const useSetupWizard = () => useContext(WizardCtx);

const SESSION_KEY = 'vixor-setup-wizard-autoshown';

export default function SetupWizardGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);

  const isSuperAdmin = user?.organizationId == null;
  const shouldAutoShow = isSuperAdmin && user?.setupWizardCompleted === false;

  useEffect(() => {
    if (shouldAutoShow && !sessionStorage.getItem(SESSION_KEY)) {
      sessionStorage.setItem(SESSION_KEY, '1');
      setVisible(true);
    }
  }, [shouldAutoShow]);

  function close(_completed: boolean) {
    setVisible(false);
  }

  return (
    <WizardCtx.Provider value={{ open: () => setVisible(true) }}>
      {children}
      {visible && <SetupWizard onClose={close} />}
    </WizardCtx.Provider>
  );
}
