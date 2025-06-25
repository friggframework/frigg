/**
 * SAFLA Integration for Frigg Framework
 * High-performance search, analysis, and optimization using SAFLA's 1.75M+ ops/sec engine
 */

const SAFLAClient = require('./client');
const SAFLASearch = require('./search');
const SAFLAAnalyzer = require('./analyzer');
const SAFLAOptimizer = require('./optimizer');
const SAFLACache = require('./cache');
const SAFLAPatternDetector = require('./pattern-detector');
const SAFLACodeGenerator = require('./code-generator');

module.exports = {
    SAFLAClient,
    SAFLASearch,
    SAFLAAnalyzer,
    SAFLAOptimizer,
    SAFLACache,
    SAFLAPatternDetector,
    SAFLACodeGenerator
};