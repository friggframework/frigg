/**
 * SAFLA Cache - High-performance caching with intelligent eviction
 */
const SAFLAClient = require('./client');

class SAFLACache {
    constructor(client, options = {}) {
        this.client = client || new SAFLAClient();
        this.options = {
            maxSize: options.maxSize || 1000,
            ttl: options.ttl || 300000, // 5 minutes default
            evictionPolicy: options.evictionPolicy || 'lru',
            compressionEnabled: options.compressionEnabled !== false,
            ...options
        };
        
        this.cache = new Map();
        this.metadata = new Map();
        this.accessHistory = [];
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            compressionSavings: 0
        };
    }

    /**
     * Get value from cache with intelligent prefetching
     */
    async get(key, options = {}) {
        const {
            prefetch = true,
            extendTTL = false
        } = options;
        
        // Check if key exists and is not expired
        if (this.cache.has(key)) {
            const metadata = this.metadata.get(key);
            const now = Date.now();
            
            if (now < metadata.expiresAt) {
                // Cache hit
                this.stats.hits++;
                metadata.accessCount++;
                metadata.lastAccessed = now;
                
                // Extend TTL if requested
                if (extendTTL) {
                    metadata.expiresAt = now + this.options.ttl;
                }
                
                // Record access for pattern analysis
                this._recordAccess(key, 'hit');
                
                // Prefetch related items if enabled
                if (prefetch) {
                    await this._prefetchRelated(key);
                }
                
                return {
                    value: this.cache.get(key),
                    cached: true,
                    metadata
                };
            } else {
                // Expired entry
                this._evict(key, 'expired');
            }
        }
        
        // Cache miss
        this.stats.misses++;
        this._recordAccess(key, 'miss');
        
        return {
            value: null,
            cached: false
        };
    }

    /**
     * Set value in cache with compression and optimization
     */
    async set(key, value, options = {}) {
        const {
            ttl = this.options.ttl,
            compress = this.options.compressionEnabled,
            priority = 'normal',
            tags = []
        } = options;
        
        // Check cache size limit
        if (this.cache.size >= this.options.maxSize) {
            await this._evictLRU();
        }
        
        // Compress value if enabled
        let storedValue = value;
        let compressionRatio = 1;
        
        if (compress && this._shouldCompress(value)) {
            const compressed = this._compress(value);
            compressionRatio = compressed.ratio;
            storedValue = compressed.data;
            this.stats.compressionSavings += compressed.savings;
        }
        
        // Store in cache
        this.cache.set(key, storedValue);
        
        // Store metadata
        const metadata = {
            key,
            size: this._getSize(storedValue),
            compressed: compress && compressionRatio < 1,
            compressionRatio,
            createdAt: Date.now(),
            expiresAt: Date.now() + ttl,
            lastAccessed: Date.now(),
            accessCount: 0,
            priority,
            tags
        };
        
        this.metadata.set(key, metadata);
        
        // Store in SAFLA memory for persistence
        await this.client.storeMemory({
            type: 'cache_entry',
            key,
            metadata,
            timestamp: new Date()
        }, 'procedural');
        
        // Analyze patterns for optimization
        await this._analyzeSetPattern(key, value, options);
        
        return metadata;
    }

    /**
     * Batch get operation for efficiency
     */
    async mget(keys) {
        const results = new Map();
        const missingKeys = [];
        
        for (const key of keys) {
            const result = await this.get(key, { prefetch: false });
            if (result.cached) {
                results.set(key, result.value);
            } else {
                missingKeys.push(key);
            }
        }
        
        return {
            found: results,
            missing: missingKeys,
            hitRate: results.size / keys.length
        };
    }

    /**
     * Batch set operation with optimization
     */
    async mset(entries, options = {}) {
        const metadata = [];
        
        // Optimize batch processing
        const optimization = await this.client.optimizeParameters(
            'batch_caching',
            'throughput'
        );
        
        // Process in optimized batches
        const batchSize = optimization.recommendations.batchSize || 100;
        for (let i = 0; i < entries.length; i += batchSize) {
            const batch = entries.slice(i, i + batchSize);
            
            const batchMetadata = await Promise.all(
                batch.map(entry => this.set(entry.key, entry.value, {
                    ...options,
                    ...entry.options
                }))
            );
            
            metadata.push(...batchMetadata);
        }
        
        return metadata;
    }

    /**
     * Delete from cache
     */
    async delete(key) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
            this.metadata.delete(key);
            this._recordAccess(key, 'delete');
            return true;
        }
        return false;
    }

    /**
     * Clear entire cache or by pattern/tags
     */
    async clear(options = {}) {
        const { pattern, tags } = options;
        
        if (!pattern && !tags) {
            // Clear everything
            this.cache.clear();
            this.metadata.clear();
            this.accessHistory = [];
            return { cleared: 'all' };
        }
        
        // Clear by pattern or tags
        const keysToDelete = [];
        
        for (const [key, metadata] of this.metadata) {
            if (pattern && key.match(pattern)) {
                keysToDelete.push(key);
            } else if (tags && tags.some(tag => metadata.tags.includes(tag))) {
                keysToDelete.push(key);
            }
        }
        
        keysToDelete.forEach(key => this.delete(key));
        
        return { cleared: keysToDelete.length, keys: keysToDelete };
    }

    /**
     * Analyze cache patterns for optimization
     */
    async analyzePatterns() {
        const patterns = await this.client.detectPatterns(
            this.accessHistory.slice(-1000), // Last 1000 accesses
            'all'
        );
        
        const analysis = {
            patterns: patterns.patterns || [],
            anomalies: patterns.anomalies || [],
            recommendations: [],
            stats: this.getStats(),
            timestamp: new Date()
        };
        
        // Generate recommendations
        if (analysis.stats.hitRate < 0.5) {
            analysis.recommendations.push({
                type: 'ttl_adjustment',
                message: 'Low hit rate detected',
                suggestion: 'Increase TTL to improve hit rate'
            });
        }
        
        if (patterns.patterns.some(p => p.type === 'sequential')) {
            analysis.recommendations.push({
                type: 'prefetching',
                message: 'Sequential access pattern detected',
                suggestion: 'Enable aggressive prefetching'
            });
        }
        
        return analysis;
    }

    /**
     * Warm cache with predicted entries
     */
    async warmCache(predictions) {
        const warmed = [];
        
        for (const prediction of predictions) {
            if (!this.cache.has(prediction.key) && prediction.confidence > 0.7) {
                // Fetch and cache predicted value
                if (prediction.value) {
                    await this.set(prediction.key, prediction.value, {
                        ttl: prediction.ttl || this.options.ttl,
                        priority: 'predicted'
                    });
                    warmed.push(prediction.key);
                }
            }
        }
        
        return {
            warmed: warmed.length,
            keys: warmed,
            timestamp: new Date()
        };
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const size = this.cache.size;
        const totalAccesses = this.stats.hits + this.stats.misses;
        
        return {
            size,
            maxSize: this.options.maxSize,
            utilization: size / this.options.maxSize,
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: totalAccesses > 0 ? this.stats.hits / totalAccesses : 0,
            evictions: this.stats.evictions,
            compressionSavings: this.stats.compressionSavings,
            averageAccessCount: this._calculateAverageAccessCount(),
            memoryUsage: this._calculateMemoryUsage()
        };
    }

    /**
     * Export cache snapshot
     */
    async exportSnapshot(options = {}) {
        const snapshot = {
            version: '1.0',
            timestamp: new Date(),
            options: this.options,
            stats: this.getStats(),
            entries: []
        };
        
        if (options.includeData) {
            for (const [key, value] of this.cache) {
                const metadata = this.metadata.get(key);
                snapshot.entries.push({
                    key,
                    value: options.compress ? this._compress(value).data : value,
                    metadata
                });
            }
        }
        
        return snapshot;
    }

    /**
     * Import cache snapshot
     */
    async importSnapshot(snapshot) {
        if (snapshot.version !== '1.0') {
            throw new Error(`Unsupported snapshot version: ${snapshot.version}`);
        }
        
        let imported = 0;
        
        for (const entry of snapshot.entries) {
            if (entry.metadata.expiresAt > Date.now()) {
                this.cache.set(entry.key, entry.value);
                this.metadata.set(entry.key, entry.metadata);
                imported++;
            }
        }
        
        return {
            imported,
            total: snapshot.entries.length,
            timestamp: new Date()
        };
    }

    // Private helper methods
    _recordAccess(key, type) {
        this.accessHistory.push({
            key,
            type,
            timestamp: Date.now()
        });
        
        // Keep history size manageable
        if (this.accessHistory.length > 10000) {
            this.accessHistory = this.accessHistory.slice(-5000);
        }
    }

    async _prefetchRelated(key) {
        // Analyze access patterns to find related keys
        const recentAccesses = this.accessHistory
            .filter(a => a.key === key)
            .slice(-10);
        
        if (recentAccesses.length > 3) {
            // Find keys accessed after this key
            const relatedKeys = new Set();
            
            for (let i = 0; i < this.accessHistory.length - 1; i++) {
                if (this.accessHistory[i].key === key) {
                    const nextKey = this.accessHistory[i + 1].key;
                    if (nextKey !== key) {
                        relatedKeys.add(nextKey);
                    }
                }
            }
            
            // Prefetch top related keys
            const predictions = Array.from(relatedKeys)
                .slice(0, 3)
                .map(k => ({ key: k, confidence: 0.8 }));
            
            if (predictions.length > 0) {
                await this.warmCache(predictions);
            }
        }
    }

    async _evictLRU() {
        // Find least recently used entry
        let lruKey = null;
        let lruTime = Infinity;
        
        for (const [key, metadata] of this.metadata) {
            if (metadata.priority !== 'high' && metadata.lastAccessed < lruTime) {
                lruTime = metadata.lastAccessed;
                lruKey = key;
            }
        }
        
        if (lruKey) {
            this._evict(lruKey, 'lru');
        }
    }

    _evict(key, reason) {
        this.cache.delete(key);
        this.metadata.delete(key);
        this.stats.evictions++;
        this._recordAccess(key, `evict_${reason}`);
    }

    _shouldCompress(value) {
        const size = this._getSize(value);
        return size > 1024; // Compress if larger than 1KB
    }

    _compress(value) {
        // Simplified compression simulation
        const original = JSON.stringify(value);
        const compressed = original; // In reality, would use compression algorithm
        
        return {
            data: compressed,
            ratio: 0.7, // Assume 30% compression
            savings: original.length * 0.3
        };
    }

    _getSize(value) {
        // Estimate size in bytes
        if (typeof value === 'string') {
            return value.length * 2; // UTF-16
        }
        return JSON.stringify(value).length * 2;
    }

    async _analyzeSetPattern(key, value, options) {
        // Detect patterns in cache usage
        const recentSets = this.accessHistory
            .filter(a => a.type === 'set')
            .slice(-100);
        
        if (recentSets.length > 50) {
            const patterns = await this.client.detectPatterns(
                recentSets.map(s => ({
                    key: s.key,
                    timestamp: s.timestamp
                }))
            );
            
            // Store patterns for future optimization
            if (patterns.patterns.length > 0) {
                await this.client.storeMemory({
                    type: 'cache_patterns',
                    patterns: patterns.patterns,
                    timestamp: new Date()
                }, 'semantic');
            }
        }
    }

    _calculateAverageAccessCount() {
        if (this.metadata.size === 0) return 0;
        
        let total = 0;
        for (const metadata of this.metadata.values()) {
            total += metadata.accessCount;
        }
        
        return total / this.metadata.size;
    }

    _calculateMemoryUsage() {
        let total = 0;
        for (const metadata of this.metadata.values()) {
            total += metadata.size;
        }
        return total;
    }
}

module.exports = SAFLACache;