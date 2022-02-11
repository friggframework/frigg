import React from 'react';
import { BrowserRouter, Route, Navigate, Routes } from 'react-router-dom';

// components
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';

// pages
import AppsPage from './pages/AppsPage';
import AppPage from './pages/AppPage';
import IntegrationsPage from './pages/IntegrationsPage';
import IntegrationPage from './pages/IntegrationPage';
import DatabasesPage from './pages/DatabasesPage';
import SettingsPage from './pages/SettingsPage';

const AppRouter = () => (
	<BrowserRouter>
		<Sidebar />
		<div className="flex flex-col flex-1">
			<Navbar />
			<Routes>
				<Route path="/apps" element={<AppsPage />} />
				<Route path="/apps/:appId" element={<AppPage />} />
				<Route path="/integrations" element={<IntegrationsPage />} />
				<Route path="/integrations/:integrationId" element={<IntegrationPage />} />
				<Route path="/databases" element={<DatabasesPage />} />
				<Route path="/settings" element={<SettingsPage />} />
				<Route path="*" element={<Navigate to="/apps" />} />
			</Routes>
		</div>
	</BrowserRouter>
);

export default AppRouter;
