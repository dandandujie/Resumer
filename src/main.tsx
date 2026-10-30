import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import '@fontsource-variable/sora';
import i18n from '@/i18n';
import { AppRouter } from '@/router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { UnsavedChangesGuard } from '@/components/app/unsaved-changes-guard';
import { ErrorLog } from '@/components/layout/error-log';
import './globals.css';

// 数据路由提供统一的导航阻止能力，编辑器与 Wiki 共用同一套未保存确认。
const router = createBrowserRouter([{path: '*', element: <>
  <UnsavedChangesGuard /><AppRouter /><Toaster /><ErrorLog />
</>}]);
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <TooltipProvider><RouterProvider router={router} /></TooltipProvider>
    </I18nextProvider>
  </React.StrictMode>,
);
