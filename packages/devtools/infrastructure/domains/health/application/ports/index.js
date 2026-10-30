/**
 * Health Domain - Application Layer Ports
 *
 * Port interfaces define how the application layer communicates with
 * infrastructure adapters. These are part of the hexagonal architecture
 * pattern, allowing provider-specific implementations (AWS, GCP, Azure, etc.)
 * without changing the domain or application logic.
 *
 * Ports:
 * - IStackRepository: CloudFormation stack operations
 * - IResourceDetector: Cloud resource discovery (orphan detection)
 * - IResourceImporter: Import resources into CloudFormation
 * - IPropertyReconciler: Fix property drift (mutable properties)
 */

const IStackRepository = require('./IStackRepository');
const IResourceDetector = require('./IResourceDetector');
const IResourceImporter = require('./IResourceImporter');
const IPropertyReconciler = require('./IPropertyReconciler');

module.exports = {
    IStackRepository,
    IResourceDetector,
    IResourceImporter,
    IPropertyReconciler,
};
