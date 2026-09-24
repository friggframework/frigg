import React from 'react'
import { Layout } from '../components/Layout'
import { MonitoringDashboard } from '../components/monitoring'

/**
 * Monitoring Page Component
 * Provides production monitoring and metrics visualization
 */
function Monitoring() {
    return (
        <Layout>
            <MonitoringDashboard />
        </Layout>
    )
}

export default Monitoring